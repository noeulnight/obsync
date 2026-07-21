import { HttpException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { VaultFilesService } from '../collaboration/vault-files.service';
import { VaultsService } from '../vaults/vaults.service';

@Injectable()
export class McpService {
  constructor(
    private readonly vaults: VaultsService,
    private readonly files: VaultFilesService,
  ) {}

  async handle(
    request: Request,
    response: Response,
    userId: string,
    scopes: string[],
  ) {
    const server = this.server(userId, scopes);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    response.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  }

  private server(userId: string, scopes: string[]) {
    const server = new McpServer({ name: 'obsync', version: '1.0.0' });

    if (scopes.includes('vault:read'))
      server.registerTool(
        'list_vaults',
        { description: 'List Vaults available to the current account.' },
        () => this.result(() => this.vaults.list(userId)),
      );

    if (scopes.includes('vault:read'))
      server.registerTool(
        'vault_list',
        {
          description: 'List files and folders in a Vault.',
          inputSchema: {
            vaultId: z.string().uuid(),
            includeDeleted: z.boolean().optional().default(false),
          },
        },
        ({ vaultId, includeDeleted }) =>
          this.result(async () => {
            const files = await this.files.list(userId, vaultId);
            return includeDeleted
              ? files
              : files.filter((file) => !file.deleted);
          }),
      );

    if (scopes.includes('vault:read'))
      server.registerTool(
        'vault_read',
        {
          description: 'Read the current live content of a Markdown document.',
          inputSchema: { vaultId: z.string().uuid(), path: z.string().min(1) },
        },
        ({ vaultId, path }) =>
          this.result(() => this.files.readMarkdown(userId, vaultId, path)),
      );

    if (scopes.includes('vault:write'))
      server.registerTool(
        'vault_write',
        {
          description:
            'Create or replace a Markdown document and publish the change to connected editors.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            content: z.string(),
          },
        },
        ({ vaultId, path, content }) =>
          this.result(() =>
            this.files.writeMarkdown(userId, vaultId, path, content),
          ),
      );

    if (scopes.includes('vault:read'))
      server.registerTool(
        'search_simple',
        {
          description:
            'Search Markdown paths and current document content in a Vault.',
          inputSchema: {
            vaultId: z.string().uuid(),
            query: z.string().min(1),
          },
        },
        ({ vaultId, query }) =>
          this.result(() => this.files.search(userId, vaultId, query)),
      );

    return server;
  }

  private async result(operation: () => Promise<unknown>) {
    try {
      const value = await operation();
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(value, null, 2) },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text:
              error instanceof HttpException
                ? error.message
                : 'Operation failed',
          },
        ],
      };
    }
  }
}

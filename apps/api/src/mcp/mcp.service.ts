import { HttpException, Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AttachmentsService } from '../attachments/attachments.service';
import {
  FileKind,
  FileOperationType,
} from '../collaboration/dto/file-operation.dto';
import { VaultFilesService } from '../collaboration/vault-files.service';
import { VaultsService } from '../vaults/vaults.service';

@Injectable()
export class McpService {
  constructor(
    private readonly vaults: VaultsService,
    private readonly files: VaultFilesService,
    private readonly attachments: AttachmentsService,
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

    if (scopes.includes('vault:write')) {
      server.registerTool(
        'vault_create_file',
        {
          description:
            'Create a folder, Canvas, or registered attachment in a Vault.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            kind: z.enum(['folder', 'canvas', 'attachment']),
            attachmentId: z.string().uuid().optional(),
          },
        },
        ({ vaultId, path, kind, attachmentId }) =>
          this.result(() =>
            this.files.apply(userId, vaultId, {
              operationId: randomUUID(),
              fileId: randomUUID(),
              type: FileOperationType.CREATE,
              kind: kind as FileKind,
              path,
              attachmentId,
            }),
          ),
      );

      server.registerTool(
        'vault_rename_file',
        {
          description:
            'Rename or move a file or folder using its current version.',
          inputSchema: fileChangeSchema.extend({ path: z.string().min(1) })
            .shape,
        },
        ({ vaultId, fileId, baseVersion, path }) =>
          this.result(() =>
            this.files.apply(userId, vaultId, {
              operationId: randomUUID(),
              fileId,
              baseVersion,
              type: FileOperationType.RENAME,
              path,
            }),
          ),
      );

      server.registerTool(
        'vault_delete_file',
        {
          description: 'Delete a file or folder using its current version.',
          inputSchema: fileChangeSchema.shape,
        },
        ({ vaultId, fileId, baseVersion }) =>
          this.result(() =>
            this.files.apply(userId, vaultId, {
              operationId: randomUUID(),
              fileId,
              baseVersion,
              type: FileOperationType.DELETE,
            }),
          ),
      );
    }

    if (scopes.includes('vault:read'))
      server.registerTool(
        'canvas_read',
        {
          description: 'Read the live nodes, edges, and metadata of a Canvas.',
          inputSchema: { vaultId: z.string().uuid(), path: z.string().min(1) },
        },
        ({ vaultId, path }) =>
          this.result(() => this.files.readCanvas(userId, vaultId, path)),
      );

    if (scopes.includes('vault:write'))
      server.registerTool(
        'canvas_write',
        {
          description:
            'Create or replace a Canvas and publish it to connected editors.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            canvas: canvasSchema,
          },
        },
        ({ vaultId, path, canvas }) => {
          const { nodes, edges, ...meta } = canvas;
          return this.result(() =>
            this.files.writeCanvas(userId, vaultId, path, {
              meta,
              nodes,
              edges,
            }),
          );
        },
      );

    if (scopes.includes('vault:read')) {
      server.registerTool(
        'vault_backlinks',
        {
          description: 'List Markdown documents linking to a file.',
          inputSchema: {
            vaultId: z.string().uuid(),
            fileId: z.string().uuid(),
          },
        },
        ({ vaultId, fileId }) =>
          this.result(() => this.files.backlinks(userId, vaultId, fileId)),
      );

      server.registerTool(
        'vault_graph',
        {
          description: 'Read the Markdown link graph for a Vault.',
          inputSchema: { vaultId: z.string().uuid() },
        },
        ({ vaultId }) => this.result(() => this.files.graph(userId, vaultId)),
      );

      server.registerTool(
        'vault_versions',
        {
          description: 'List version history for a file.',
          inputSchema: {
            vaultId: z.string().uuid(),
            fileId: z.string().uuid(),
          },
        },
        ({ vaultId, fileId }) =>
          this.result(() => this.files.versions(userId, vaultId, fileId)),
      );

      server.registerTool(
        'vault_version_read',
        {
          description: 'Read one historical Markdown version.',
          inputSchema: {
            vaultId: z.string().uuid(),
            fileId: z.string().uuid(),
            versionId: z.string().uuid(),
          },
        },
        ({ vaultId, fileId, versionId }) =>
          this.result(() =>
            this.files.version(userId, vaultId, fileId, versionId),
          ),
      );
    }

    if (scopes.includes('vault:write')) {
      server.registerTool(
        'vault_version_restore',
        {
          description: 'Restore a historical Markdown version.',
          inputSchema: {
            vaultId: z.string().uuid(),
            fileId: z.string().uuid(),
            versionId: z.string().uuid(),
          },
        },
        ({ vaultId, fileId, versionId }) =>
          this.result(() =>
            this.files.restoreVersion(userId, vaultId, fileId, versionId),
          ),
      );

      server.registerTool(
        'attachment_prepare_upload',
        {
          description: 'Create a private presigned upload for an attachment.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            size: z.number().int().positive(),
            mimeType: z.string().min(1),
            sha256: z.string().regex(/^[a-fA-F0-9]{64}$/),
          },
        },
        ({ vaultId, path, size, mimeType, sha256 }) =>
          this.result(() =>
            this.attachments.presignUpload(userId, vaultId, {
              path,
              size,
              mimeType,
              sha256,
              idempotencyKey: randomUUID(),
            }),
          ),
      );

      server.registerTool(
        'attachment_complete',
        {
          description: 'Verify a completed attachment upload.',
          inputSchema: {
            vaultId: z.string().uuid(),
            attachmentId: z.string().uuid(),
          },
        },
        ({ vaultId, attachmentId }) =>
          this.result(() =>
            this.attachments.complete(userId, vaultId, attachmentId),
          ),
      );
    }

    if (scopes.includes('vault:read'))
      server.registerTool(
        'attachment_download',
        {
          description: 'Create a short-lived private attachment download URL.',
          inputSchema: {
            vaultId: z.string().uuid(),
            attachmentId: z.string().uuid(),
          },
        },
        ({ vaultId, attachmentId }) =>
          this.result(() =>
            this.attachments.download(userId, vaultId, attachmentId),
          ),
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

    if (scopes.includes('vault:write')) {
      server.registerTool(
        'vault_append',
        {
          description:
            'Append content to a Markdown document without replacing concurrent edits.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            content: z.string(),
          },
        },
        ({ vaultId, path, content }) =>
          this.result(() =>
            this.files.appendMarkdown(userId, vaultId, path, content),
          ),
      );

      server.registerTool(
        'vault_patch',
        {
          description:
            'Append, prepend, or replace one Markdown heading, block, or frontmatter property. Optionally reject stale target content using a hash from vault_get_document_map.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
            targetType: z.enum(['heading', 'block', 'frontmatter']),
            target: z.string().min(1),
            operation: z.enum(['append', 'prepend', 'replace']),
            content: z.string(),
            expectedTargetHash: z.string().length(64).optional(),
          },
        },
        ({
          vaultId,
          path,
          targetType,
          target,
          operation,
          content,
          expectedTargetHash,
        }) =>
          this.result(() =>
            this.files.patchMarkdown(
              userId,
              vaultId,
              path,
              targetType,
              target,
              operation,
              content,
              expectedTargetHash,
            ),
          ),
      );
    }

    if (scopes.includes('vault:read')) {
      server.registerTool(
        'vault_get_document_map',
        {
          description:
            'List headings, block references, and frontmatter properties in a Markdown document.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1),
          },
        },
        ({ vaultId, path }) =>
          this.result(() => this.files.documentMap(userId, vaultId, path)),
      );

      server.registerTool(
        'vault_context',
        {
          description:
            'Load compact Markdown context and linked documents relevant to a question.',
          inputSchema: {
            vaultId: z.string().uuid(),
            question: z.string().min(1),
            maxDocuments: z.number().int().min(1).max(20).optional(),
            maxCharacters: z.number().int().min(200).max(20_000).optional(),
          },
        },
        ({ vaultId, question, maxDocuments, maxCharacters }) =>
          this.result(() =>
            this.files.context(
              userId,
              vaultId,
              question,
              maxDocuments,
              maxCharacters,
            ),
          ),
      );

      server.registerTool(
        'tag_list',
        {
          description:
            'List Markdown tags and their document counts in a Vault.',
          inputSchema: { vaultId: z.string().uuid() },
        },
        ({ vaultId }) => this.result(() => this.files.tags(userId, vaultId)),
      );

      server.registerTool(
        'search_query',
        {
          description:
            'Search Markdown documents by path, content, tag, or frontmatter property.',
          inputSchema: {
            vaultId: z.string().uuid(),
            path: z.string().min(1).optional(),
            content: z.string().min(1).optional(),
            tag: z.string().min(1).optional(),
            frontmatterKey: z.string().min(1).optional(),
            frontmatterValue: z.string().min(1).optional(),
          },
        },
        ({ vaultId, ...query }) =>
          this.result(() =>
            this.files.structuredSearch(userId, vaultId, query),
          ),
      );
    }

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

const fileChangeSchema = z.object({
  vaultId: z.string().uuid(),
  fileId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
});

const canvasNodeSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['text', 'file', 'link', 'group']),
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
    text: z.string().optional(),
    file: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough();
const canvasEdgeSchema = z
  .object({
    id: z.string().min(1),
    fromNode: z.string().min(1),
    toNode: z.string().min(1),
  })
  .passthrough();
const canvasSchema = z
  .object({
    nodes: z.array(canvasNodeSchema),
    edges: z.array(canvasEdgeSchema),
  })
  .passthrough();

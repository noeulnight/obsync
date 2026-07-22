import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HocuspocusProvider } from '@hocuspocus/provider';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import * as Y from 'yjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AppValidationPipe } from '../src/http/pipes/app-validation.pipe';
import { McpOAuthService } from '../src/mcp/mcp-oauth.service';

const resource = 'http://localhost:3000/mcp';
const redirectUri = 'http://127.0.0.1/callback';
const verifier = 'mcp-e2e-code-verifier-with-more-than-forty-three-characters';

describe('MCP OAuth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accountToken: string;
  let mcpToken: string;
  let refreshToken: string;
  let clientId: string;
  let vaultId: string;
  let otherVaultId: string;
  let websocketUrl: string;
  const email = 'mcp-e2e@example.com';
  const otherEmail = 'mcp-other-e2e@example.com';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.use(app.get(McpOAuthService).router());
    app.setGlobalPrefix('api', {
      exclude: [{ path: 'mcp', method: RequestMethod.ALL }],
    });
    app.useGlobalPipes(new AppValidationPipe());
    await app.listen(0, '127.0.0.1');
    websocketUrl = (await app.getUrl()).replace('http://', 'ws://');
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({
      where: { email: { in: [email, otherEmail] } },
    });

    const login = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(200);
    accountToken = json<{ accessToken: string }>(login.text).accessToken;
    const vault = await request(app.getHttpServer())
      .post('/api/vaults')
      .set('authorization', `Bearer ${accountToken}`)
      .send({ name: 'MCP E2E' })
      .expect(201);
    vaultId = json<{ id: string }>(vault.text).id;

    const otherLogin = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: otherEmail, password: 'password123' })
      .expect(200);
    const otherVault = await request(app.getHttpServer())
      .post('/api/vaults')
      .set(
        'authorization',
        `Bearer ${json<{ accessToken: string }>(otherLogin.text).accessToken}`,
      )
      .send({ name: 'Other MCP E2E' })
      .expect(201);
    otherVaultId = json<{ id: string }>(otherVault.text).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [email, otherEmail] } },
    });
    await app.close();
  });

  it('advertises OAuth and challenges unauthorized requests', async () => {
    await request(app.getHttpServer())
      .get('/.well-known/oauth-protected-resource/mcp')
      .expect(200)
      .expect(({ text }) => expect(text).toContain(resource));
    await request(app.getHttpServer())
      .get('/.well-known/oauth-authorization-server')
      .expect(200)
      .expect(({ text }) => expect(text).toContain('/authorize'));
    await request(app.getHttpServer())
      .post('/mcp')
      .set('accept', 'application/json, text/event-stream')
      .send(rpc('initialize', initializeParams(), 1))
      .expect(401)
      .expect('www-authenticate', /oauth-protected-resource\/mcp/);
  });

  it('registers a public client and completes authorization code with PKCE', async () => {
    const registered = await request(app.getHttpServer())
      .post('/register')
      .send({
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'Obsync E2E',
      })
      .expect(201);
    const client = json<{ client_id: string; client_secret?: string }>(
      registered.text,
    );
    clientId = client.client_id;
    expect(client.client_secret).toBeUndefined();

    const authorization = await request(app.getHttpServer())
      .get('/authorize')
      .query({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        code_challenge: challenge(verifier),
        code_challenge_method: 'S256',
        scope: 'vault:read vault:write',
        resource,
        state: 'e2e-state',
      })
      .expect(302);
    const requestId = new URL(authorization.headers.location).searchParams.get(
      'request_id',
    );
    expect(requestId).toBeTruthy();

    await request(app.getHttpServer())
      .get(`/api/auth/mcp/authorization/${requestId}`)
      .expect(200)
      .expect(({ text }) => expect(text).toContain('Obsync E2E'));
    const approval = await request(app.getHttpServer())
      .post(`/api/auth/mcp/authorization/${requestId}/approve`)
      .set('authorization', `Bearer ${accountToken}`)
      .expect(201);
    const callback = new URL(
      json<{ redirectUrl: string }>(approval.text).redirectUrl,
    );
    expect(callback.searchParams.get('state')).toBe('e2e-state');

    const tokens = await request(app.getHttpServer())
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: callback.searchParams.get('code'),
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource,
      })
      .expect(200);
    const body = json<{ access_token: string; refresh_token: string }>(
      tokens.text,
    );
    mcpToken = body.access_token;
    refreshToken = body.refresh_token;
  });

  it('lists scoped tools and writes live Markdown', async () => {
    const tools = await mcp(rpc('tools/list', {}, 2));
    expect(
      json<{ result: { tools: Array<{ name: string }> } }>(
        tools.text,
      ).result.tools.map((tool) => tool.name),
    ).toEqual([
      'list_vaults',
      'vault_create_file',
      'vault_rename_file',
      'vault_delete_file',
      'canvas_read',
      'canvas_write',
      'vault_backlinks',
      'vault_graph',
      'vault_versions',
      'vault_version_read',
      'vault_version_restore',
      'attachment_prepare_upload',
      'attachment_complete',
      'attachment_download',
      'vault_list',
      'vault_read',
      'vault_write',
      'vault_append',
      'vault_patch',
      'vault_get_document_map',
      'tag_list',
      'search_query',
      'search_simple',
    ]);

    await callTool('vault_write', {
      vaultId,
      path: 'MCP Test.md',
      content: '# Written through OAuth MCP',
    });
    const read = await callTool('vault_read', { vaultId, path: 'MCP Test.md' });
    expect(read.text).toContain('# Written through OAuth MCP');

    await callTool('vault_write', {
      vaultId,
      path: 'MCP Test.md',
      content: '---\nstatus: draft\ntags: [mcp]\n---\n# Work\nOriginal ^task\n',
    });
    await callTool('vault_patch', {
      vaultId,
      path: 'MCP Test.md',
      targetType: 'frontmatter',
      target: 'status',
      operation: 'replace',
      content: 'done',
    });
    await callTool('vault_append', {
      vaultId,
      path: 'MCP Test.md',
      content: '# Later\nAdded',
    });
    expect(
      toolValue<{ frontmatter: Array<{ key: string; value: string }> }>(
        await callTool('vault_get_document_map', {
          vaultId,
          path: 'MCP Test.md',
        }),
      ).frontmatter,
    ).toContainEqual({ key: 'status', value: 'done' });
    expect(toolValue(await callTool('tag_list', { vaultId }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: 'mcp' })]),
    );
    const structured = toolValue<Array<{ id: string; path: string }>>(
      await callTool('search_query', {
        vaultId,
        frontmatterKey: 'status',
        frontmatterValue: 'done',
      }),
    );
    expect(
      typeof structured.find(({ path }) => path === 'MCP Test.md')?.id,
    ).toBe('string');

    const files = toolValue<Array<{ id: string; path: string }>>(
      await callTool('vault_list', { vaultId }),
    );
    const markdown = files.find((file) => file.path === 'MCP Test.md');
    expect(markdown).toBeDefined();

    const document = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: `${websocketUrl}/collaboration?vaultId=${vaultId}`,
      name: `doc:${markdown?.id}`,
      document,
      token: accountToken,
    });
    await waitForSync(provider);
    await callTool('vault_write', {
      vaultId,
      path: 'MCP Test.md',
      content: '# Live MCP update',
    });
    await waitFor(
      () => document.getText('content').toJSON() === '# Live MCP update',
    );
    provider.destroy();
    document.destroy();

    const denied = toolResult(
      await callTool('vault_list', { vaultId: otherVaultId }),
    );
    expect(denied.isError).toBe(true);

    await callTool('canvas_write', {
      vaultId,
      path: 'MCP.canvas',
      canvas: {
        nodes: [
          {
            id: 'node-1',
            type: 'text',
            text: '한글 노트',
            x: 0,
            y: 0,
            width: 240,
            height: 120,
          },
        ],
        edges: [],
      },
    });
    expect(
      toolValue<{ data: { nodes: Array<{ text?: string }> } }>(
        await callTool('canvas_read', { vaultId, path: 'MCP.canvas' }),
      ).data.nodes[0].text,
    ).toBe('한글 노트');

    const created = toolValue<{
      files: Array<{ id: string; version: number }>;
    }>(
      await callTool('vault_create_file', {
        vaultId,
        path: 'MCP Folder',
        kind: 'folder',
      }),
    ).files[0];
    await callTool('vault_rename_file', {
      vaultId,
      fileId: created.id,
      baseVersion: created.version,
      path: 'Renamed MCP Folder',
    });
    await callTool('vault_delete_file', {
      vaultId,
      fileId: created.id,
      baseVersion: created.version + 1,
    });
  });

  it('rotates refresh tokens when clients omit the resource', async () => {
    await request(app.getHttpServer())
      .post('/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
        resource: 'https://example.com/mcp',
      })
      .expect(400);

    const refreshed = await request(app.getHttpServer())
      .post('/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      })
      .expect(200);
    const next = json<{ access_token: string; refresh_token: string }>(
      refreshed.text,
    );
    expect(next.refresh_token).not.toBe(refreshToken);
    mcpToken = next.access_token;
    await request(app.getHttpServer())
      .post('/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
        resource,
      })
      .expect(400);
  });

  it('lists and immediately revokes connected apps', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/mcp/apps')
      .set('authorization', `Bearer ${accountToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual([
          expect.objectContaining({ clientId, name: 'Obsync E2E' }),
        ]);
      });
    await request(app.getHttpServer())
      .delete(`/api/auth/mcp/apps/${clientId}`)
      .set('authorization', `Bearer ${accountToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .post('/mcp')
      .set('authorization', `Bearer ${mcpToken}`)
      .set('accept', 'application/json, text/event-stream')
      .send(rpc('tools/list', {}, 4))
      .expect(401);
  });

  function mcp(body: object) {
    return request(app.getHttpServer())
      .post('/mcp')
      .set('authorization', `Bearer ${mcpToken}`)
      .set('accept', 'application/json, text/event-stream')
      .set('mcp-protocol-version', '2025-06-18')
      .send(body)
      .expect(200);
  }

  function callTool(name: string, args: object) {
    return mcp(rpc('tools/call', { name, arguments: args }, 3));
  }
});

function toolResult(response: request.Response) {
  return json<{
    result: {
      isError?: boolean;
      content: Array<{ type: string; text: string }>;
    };
  }>(response.text).result;
}

function toolValue<T>(response: request.Response) {
  return json<T>(toolResult(response).content[0].text);
}

function waitForSync(provider: HocuspocusProvider) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('sync timeout')), 3_000);
    provider.on('synced', ({ state }) => {
      if (!state) return;
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitFor(check: () => boolean) {
  const deadline = Date.now() + 3_000;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error('update timeout');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function challenge(value: string) {
  return createHash('sha256').update(value).digest('base64url');
}

function rpc(method: string, params: object, id: number) {
  return { jsonrpc: '2.0', method, params, id };
}

function initializeParams() {
  return {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'obsync-e2e', version: '1.0.0' },
  };
}

function json<T>(text: string) {
  return JSON.parse(text) as T;
}

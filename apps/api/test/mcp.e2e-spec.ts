import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
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
  const email = 'mcp-e2e@example.com';

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
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);
    accountToken = json<{ accessToken: string }>(login.text).accessToken;
    const vault = await request(app.getHttpServer())
      .post('/api/vaults')
      .set('authorization', `Bearer ${accountToken}`)
      .send({ name: 'MCP E2E' })
      .expect(201);
    vaultId = json<{ id: string }>(vault.text).id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
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
      'vault_list',
      'vault_read',
      'vault_write',
      'search_simple',
    ]);

    await callTool('vault_write', {
      vaultId,
      path: 'MCP Test.md',
      content: '# Written through OAuth MCP',
    });
    const read = await callTool('vault_read', { vaultId, path: 'MCP Test.md' });
    expect(read.text).toContain('# Written through OAuth MCP');
  });

  it('rotates refresh tokens', async () => {
    const refreshed = await request(app.getHttpServer())
      .post('/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
        resource,
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

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  OAuthClientInformationFullSchema,
  type OAuthClientInformationFull,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { Prisma } from '@prisma/client';
import type { RequestHandler, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export const mcpScopes = ['vault:read', 'vault:write'] as const;
const authorizationTtlMs = 10 * 60 * 1_000;

@Injectable()
export class McpOAuthService implements OAuthServerProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get clientsStore() {
    return {
      getClient: (clientId: string) => this.client(clientId),
      registerClient: (client: OAuthClientInformationFull) =>
        this.registerClient(client),
    };
  }

  configuration() {
    return {
      url: this.resourceUrl().toString(),
      scopes: [...mcpScopes],
    };
  }

  async connectedApps(userId: string) {
    const tokens = await this.prisma.mcpOAuthRefreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        clientId: true,
        scopes: true,
        createdAt: true,
        client: { select: { metadata: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const apps = new Map<
      string,
      { clientId: string; name: string; scopes: Set<string>; connectedAt: Date }
    >();
    for (const token of tokens) {
      const existing = apps.get(token.clientId);
      if (existing) {
        token.scopes.forEach((scope) => existing.scopes.add(scope));
        continue;
      }
      const client = OAuthClientInformationFullSchema.parse(
        token.client.metadata,
      );
      apps.set(token.clientId, {
        clientId: token.clientId,
        name: client.client_name ?? 'MCP client',
        scopes: new Set(token.scopes),
        connectedAt: token.createdAt,
      });
    }
    return [...apps.values()].map((app) => ({
      ...app,
      scopes: [...app.scopes],
    }));
  }

  async revokeApp(userId: string, clientId: string) {
    await this.prisma.mcpOAuthRefreshToken.updateMany({
      where: { userId, clientId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  router(): RequestHandler {
    const resource = this.resourceUrl();
    const issuer = new URL(resource.origin);
    return mcpAuthRouter({
      provider: this,
      issuerUrl: issuer,
      resourceServerUrl: resource,
      resourceName: 'Obsync',
      scopesSupported: [...mcpScopes],
      authorizationOptions: { rateLimit: false },
      clientRegistrationOptions: { rateLimit: false },
      tokenOptions: { rateLimit: false },
    });
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    response: Response,
  ) {
    const resource = this.validResource(params.resource);
    const scopes = this.validScopes(params.scopes);
    const authorization = await this.prisma.mcpOAuthAuthorization.create({
      data: {
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state,
        resource,
        scopes,
        expiresAt: new Date(Date.now() + authorizationTtlMs),
      },
      select: { id: true },
    });
    const approval = new URL(
      '/oauth/authorize',
      this.config.getOrThrow<string>('app.webUrl'),
    );
    approval.searchParams.set('request_id', authorization.id);
    response.redirect(approval.toString());
  }

  async authorization(id: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findFirst({
      where: {
        id,
        approvedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        scopes: true,
        client: { select: { metadata: true } },
      },
    });
    if (!authorization) throw new BadRequestException('Authorization expired');
    const client = OAuthClientInformationFullSchema.parse(
      authorization.client.metadata,
    );
    return {
      clientName: client.client_name ?? 'MCP client',
      scopes: authorization.scopes,
    };
  }

  async approve(userId: string, id: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findFirst({
      where: {
        id,
        approvedAt: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { redirectUri: true, state: true },
    });
    if (!authorization) throw new BadRequestException('Authorization expired');
    const code = randomBytes(32).toString('base64url');
    const approved = await this.prisma.mcpOAuthAuthorization.updateMany({
      where: { id, approvedAt: null, consumedAt: null },
      data: { userId, codeHash: hash(code), approvedAt: new Date() },
    });
    if (approved.count !== 1)
      throw new BadRequestException('Authorization unavailable');
    return this.redirect(authorization.redirectUri, authorization.state, {
      code,
    });
  }

  async deny(id: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findFirst({
      where: { id, approvedAt: null, consumedAt: null },
      select: { redirectUri: true, state: true },
    });
    if (!authorization)
      throw new BadRequestException('Authorization unavailable');
    await this.prisma.mcpOAuthAuthorization.delete({ where: { id } });
    return this.redirect(authorization.redirectUri, authorization.state, {
      error: 'access_denied',
    });
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ) {
    const authorization = await this.code(client.client_id, authorizationCode);
    return authorization.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ) {
    const authorization = await this.code(client.client_id, authorizationCode);
    if (
      !authorization.userId ||
      authorization.redirectUri !== redirectUri ||
      authorization.resource !== this.validResource(resource)
    ) {
      throw new InvalidGrantError('Invalid authorization code');
    }
    const consumed = await this.prisma.mcpOAuthAuthorization.updateMany({
      where: { id: authorization.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new InvalidGrantError('Authorization code used');
    return this.tokens(
      authorization.userId,
      client.client_id,
      authorization.scopes,
      authorization.resource,
    );
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    requestedScopes?: string[],
    resource?: URL,
  ) {
    const stored = await this.prisma.mcpOAuthRefreshToken.findFirst({
      where: {
        tokenHash: hash(refreshToken),
        clientId: client.client_id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!stored || stored.resource !== this.validResource(resource)) {
      throw new InvalidGrantError('Invalid refresh token');
    }
    const scopes = requestedScopes?.length
      ? this.validScopes(requestedScopes).filter((scope) =>
          stored.scopes.includes(scope),
        )
      : stored.scopes;
    if (requestedScopes?.length && scopes.length !== requestedScopes.length) {
      throw new InvalidScopeError('Requested scope was not granted');
    }
    const revoked = await this.prisma.mcpOAuthRefreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new InvalidGrantError('Refresh token used');
    return this.tokens(
      stored.userId,
      client.client_id,
      scopes,
      stored.resource,
    );
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const resource = this.resourceUrl().toString();
      const payload = await this.jwt.verifyAsync<McpAccessToken>(token, {
        secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
        audience: resource,
      });
      if (payload.type !== 'mcp' || payload.resource !== resource) {
        throw new Error('Invalid token');
      }
      const activeGrant = await this.prisma.mcpOAuthRefreshToken.findFirst({
        where: {
          userId: payload.sub,
          clientId: payload.clientId,
          resource,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!activeGrant) throw new Error('Revoked token');
      return {
        token,
        clientId: payload.clientId,
        scopes: payload.scopes,
        expiresAt: payload.exp,
        resource: new URL(payload.resource),
        extra: { userId: payload.sub },
      };
    } catch {
      throw new InvalidGrantError('Invalid access token');
    }
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ) {
    await this.prisma.mcpOAuthRefreshToken.updateMany({
      where: {
        tokenHash: hash(request.token),
        clientId: client.client_id,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  private async client(clientId: string) {
    const client = await this.prisma.mcpOAuthClient.findUnique({
      where: { id: clientId },
      select: { metadata: true },
    });
    return client
      ? OAuthClientInformationFullSchema.parse(client.metadata)
      : undefined;
  }

  private async registerClient(client: OAuthClientInformationFull) {
    if (
      client.redirect_uris.some((redirect) => !safeRedirect(new URL(redirect)))
    ) {
      throw new InvalidClientMetadataError(
        'Redirect URI must use HTTPS or loopback HTTP',
      );
    }
    const publicClient = {
      ...client,
      token_endpoint_auth_method: 'none',
      client_secret: undefined,
      client_secret_expires_at: undefined,
    } satisfies OAuthClientInformationFull;
    const metadata = JSON.parse(
      JSON.stringify(publicClient),
    ) as Prisma.InputJsonObject;
    await this.prisma.mcpOAuthClient.create({
      data: { id: publicClient.client_id, metadata },
    });
    return publicClient;
  }

  private async code(clientId: string, authorizationCode: string) {
    const authorization = await this.prisma.mcpOAuthAuthorization.findFirst({
      where: {
        clientId,
        codeHash: hash(authorizationCode),
        approvedAt: { not: null },
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!authorization)
      throw new InvalidGrantError('Invalid authorization code');
    return authorization;
  }

  private async tokens(
    userId: string,
    clientId: string,
    scopes: string[],
    resource: string,
  ): Promise<OAuthTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const accessTtl = this.config.getOrThrow<number>(
      'auth.jwt.accessTtlSeconds',
    );
    const refreshTtl = this.config.getOrThrow<number>(
      'auth.jwt.refreshTtlSeconds',
    );
    const accessToken = await this.jwt.signAsync(
      { sub: userId, type: 'mcp', clientId, scopes, resource },
      {
        secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
        expiresIn: accessTtl,
        audience: resource,
      },
    );
    await this.prisma.mcpOAuthRefreshToken.create({
      data: {
        userId,
        clientId,
        tokenHash: hash(refreshToken),
        scopes,
        resource,
        expiresAt: new Date(Date.now() + refreshTtl * 1_000),
      },
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: accessTtl,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }

  private validResource(resource?: URL) {
    const expected = this.resourceUrl().toString();
    if (resource?.toString() !== expected) {
      throw new InvalidRequestError('Invalid MCP resource');
    }
    return expected;
  }

  private validScopes(requested: string[] = []) {
    const scopes = requested.length ? [...new Set(requested)] : [...mcpScopes];
    if (
      scopes.some(
        (scope) => !mcpScopes.includes(scope as (typeof mcpScopes)[number]),
      )
    ) {
      throw new InvalidScopeError('Unsupported scope');
    }
    return scopes;
  }

  private resourceUrl() {
    return new URL(this.config.getOrThrow<string>('mcp.publicUrl'));
  }

  private redirect(
    redirectUri: string,
    state: string | null,
    params: Record<string, string>,
  ) {
    const url = new URL(redirectUri);
    for (const [key, value] of Object.entries(params))
      url.searchParams.set(key, value);
    if (state) url.searchParams.set('state', state);
    return url.toString();
  }
}

type McpAccessToken = {
  sub: string;
  type: 'mcp';
  clientId: string;
  scopes: string[];
  resource: string;
  exp: number;
};

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function safeRedirect(url: URL) {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}

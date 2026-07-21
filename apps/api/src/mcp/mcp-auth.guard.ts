import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { McpOAuthService } from './mcp-oauth.service';

@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly oauth: McpOAuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
    try {
      if (scheme !== 'Bearer' || !token) throw new Error('Missing token');
      const auth = await this.oauth.verifyAccessToken(token);
      const userId = auth.extra?.userId;
      if (typeof userId !== 'string') throw new Error('Invalid token');
      request.user = { id: userId, scopes: auth.scopes };
      return true;
    } catch {
      const response = context.switchToHttp().getResponse<Response>();
      const resource = new URL(this.config.getOrThrow<string>('mcp.publicUrl'));
      response.setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${getOAuthProtectedResourceMetadataUrl(resource)}"`,
      );
      throw new UnauthorizedException();
    }
  }
}

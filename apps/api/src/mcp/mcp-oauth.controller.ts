import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { McpOAuthService } from './mcp-oauth.service';

@Controller('auth/mcp')
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('config')
  @UseGuards(JwtAuthGuard)
  config() {
    return this.oauth.configuration();
  }

  @Get('apps')
  @UseGuards(JwtAuthGuard)
  apps(@Req() request: AuthenticatedRequest) {
    return this.oauth.connectedApps(request.user.id);
  }

  @Delete('apps/:clientId')
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    await this.oauth.revokeApp(request.user.id, clientId);
  }

  @Get('authorization/:id')
  details(@Param('id', ParseUUIDPipe) id: string) {
    return this.oauth.authorization(id);
  }

  @Post('authorization/:id/approve')
  @UseGuards(JwtAuthGuard)
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { redirectUrl: await this.oauth.approve(request.user.id, id) };
  }

  @Post('authorization/:id/deny')
  @UseGuards(JwtAuthGuard)
  async deny(@Param('id', ParseUUIDPipe) id: string) {
    return { redirectUrl: await this.oauth.deny(id) };
  }
}

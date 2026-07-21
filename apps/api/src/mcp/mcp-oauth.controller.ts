import {
  Controller,
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

@Controller('auth/mcp/authorization')
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('config')
  @UseGuards(JwtAuthGuard)
  config() {
    return this.oauth.configuration();
  }

  @Get(':id')
  details(@Param('id', ParseUUIDPipe) id: string) {
    return this.oauth.authorization(id);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { redirectUrl: await this.oauth.approve(request.user.id, id) };
  }

  @Post(':id/deny')
  @UseGuards(JwtAuthGuard)
  async deny(@Param('id', ParseUUIDPipe) id: string) {
    return { redirectUrl: await this.oauth.deny(id) };
  }
}

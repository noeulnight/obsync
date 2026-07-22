import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { McpOAuthService } from './mcp-oauth.service';
import {
  ConnectedMcpAppResponseDto,
  McpAuthorizationRedirectResponseDto,
  McpAuthorizationResponseDto,
  McpConfigurationResponseDto,
} from './dto/mcp-oauth-response.dto';

@Controller('auth/mcp')
@ApiTags('MCP authorization')
export class McpOAuthController {
  constructor(private readonly oauth: McpOAuthService) {}

  @Get('config')
  @ApiOkResponse({ type: McpConfigurationResponseDto })
  @UseGuards(JwtAuthGuard)
  config() {
    return this.oauth.configuration();
  }

  @Get('apps')
  @ApiOkResponse({ type: ConnectedMcpAppResponseDto, isArray: true })
  @UseGuards(JwtAuthGuard)
  apps(@Req() request: AuthenticatedRequest) {
    return this.oauth.connectedApps(request.user.id);
  }

  @Delete('apps/:clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @UseGuards(JwtAuthGuard)
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('clientId', ParseUUIDPipe) clientId: string,
  ) {
    await this.oauth.revokeApp(request.user.id, clientId);
  }

  @Get('authorization/:id')
  @ApiOkResponse({ type: McpAuthorizationResponseDto })
  details(@Param('id', ParseUUIDPipe) id: string) {
    return this.oauth.authorization(id);
  }

  @Post('authorization/:id/approve')
  @ApiCreatedResponse({ type: McpAuthorizationRedirectResponseDto })
  @UseGuards(JwtAuthGuard)
  async approve(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { redirectUrl: await this.oauth.approve(request.user.id, id) };
  }

  @Post('authorization/:id/deny')
  @ApiCreatedResponse({ type: McpAuthorizationRedirectResponseDto })
  @UseGuards(JwtAuthGuard)
  async deny(@Param('id', ParseUUIDPipe) id: string) {
    return { redirectUrl: await this.oauth.deny(id) };
  }
}

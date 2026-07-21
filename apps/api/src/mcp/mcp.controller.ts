import { All, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpService } from './mcp.service';

@Controller('mcp')
@UseGuards(McpAuthGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  handle(@Req() request: AuthenticatedRequest, @Res() response: Response) {
    return this.mcp.handle(
      request,
      response,
      request.user.id,
      request.user.scopes ?? [],
    );
  }

  @All()
  methodNotAllowed(@Res() response: Response) {
    response.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }
}

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
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PublicSharesService } from './public-shares.service';

@Controller('vaults/:vaultId/files/:fileId/share')
@UseGuards(JwtAuthGuard)
export class PublicShareManagementController {
  constructor(private readonly shares: PublicSharesService) {}

  @Get()
  status(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.status(request.user.id, vaultId, fileId);
  }

  @Post()
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.publish(request.user.id, vaultId, fileId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  unpublish(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.unpublish(request.user.id, vaultId, fileId);
  }
}

@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly shares: PublicSharesService) {}

  @Get(':slug')
  read(@Param('slug') slug: string) {
    return this.shares.read(slug);
  }

  @Get(':slug/attachments/:attachmentId')
  attachment(
    @Param('slug') slug: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.shares.attachment(slug, attachmentId);
  }
}

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
import { PublicSharesService } from './public-shares.service';
import {
  PublicShareContentResponseDto,
  PublicShareDownloadResponseDto,
  PublicShareResponseDto,
} from './dto/public-share-response.dto';

@Controller('vaults/:vaultId/files/:fileId/share')
@ApiTags('Sharing')
@UseGuards(JwtAuthGuard)
export class PublicShareManagementController {
  constructor(private readonly shares: PublicSharesService) {}

  @Get()
  @ApiOkResponse({ type: PublicShareResponseDto, nullable: true })
  status(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.status(request.user.id, vaultId, fileId);
  }

  @Post()
  @ApiCreatedResponse({ type: PublicShareResponseDto })
  publish(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.publish(request.user.id, vaultId, fileId);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  unpublish(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.shares.unpublish(request.user.id, vaultId, fileId);
  }
}

@Controller('public/shares')
@ApiTags('Public sharing')
export class PublicSharesController {
  constructor(private readonly shares: PublicSharesService) {}

  @Get(':slug')
  @ApiOkResponse({ type: PublicShareContentResponseDto })
  read(@Param('slug') slug: string) {
    return this.shares.read(slug);
  }

  @Get(':slug/attachments/:attachmentId')
  @ApiOkResponse({ type: PublicShareDownloadResponseDto })
  attachment(
    @Param('slug') slug: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.shares.attachment(slug, attachmentId);
  }
}

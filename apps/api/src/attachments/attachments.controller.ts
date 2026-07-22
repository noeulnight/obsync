import {
  Body,
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
import { AttachmentsService } from './attachments.service';
import { PresignUploadDto } from './dto/presign-upload.dto';
import {
  AttachmentResponseDto,
  DownloadResponseDto,
  PresignUploadResponseDto,
} from './dto/attachment-response.dto';

@Controller('vaults/:vaultId/attachments')
@ApiTags('Attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('presign-upload')
  @ApiCreatedResponse({ type: PresignUploadResponseDto })
  presignUpload(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: PresignUploadDto,
  ) {
    return this.attachments.presignUpload(request.user.id, vaultId, body);
  }

  @Post(':attachmentId/complete')
  @ApiCreatedResponse({ type: AttachmentResponseDto })
  complete(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.attachments.complete(request.user.id, vaultId, attachmentId);
  }

  @Get(':attachmentId/download')
  @ApiOkResponse({ type: DownloadResponseDto })
  download(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.attachments.download(request.user.id, vaultId, attachmentId);
  }

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('attachmentId', new ParseUUIDPipe()) attachmentId: string,
  ) {
    return this.attachments.delete(request.user.id, vaultId, attachmentId);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { FileOperationDto } from './dto/file-operation.dto';
import { VaultFilesService } from './vault-files.service';

@Controller('vaults/:vaultId/files')
@UseGuards(JwtAuthGuard)
export class VaultFilesController {
  constructor(private readonly files: VaultFilesService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.files.list(request.user.id, vaultId);
  }

  @Post('operations')
  apply(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: FileOperationDto,
  ) {
    return this.files.apply(request.user.id, vaultId, body);
  }

  @Get(':fileId/versions')
  versions(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.versions(request.user.id, vaultId, fileId);
  }
}

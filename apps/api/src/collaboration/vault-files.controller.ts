import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { FileOperationDto } from './dto/file-operation.dto';
import { SearchFilesDto } from './dto/search-files.dto';
import {
  BacklinkResponseDto,
  FileOperationResponseDto,
  FileVersionDetailResponseDto,
  FileVersionResponseDto,
  ResetVaultResponseDto,
  RestoreFileVersionResponseDto,
  SearchFileResponseDto,
  VaultFileResponseDto,
  VaultGraphResponseDto,
} from './dto/vault-file-response.dto';
import { VaultFilesService } from './vault-files.service';

@Controller('vaults/:vaultId/files')
@ApiTags('Files')
@UseGuards(JwtAuthGuard)
export class VaultFilesController {
  constructor(private readonly files: VaultFilesService) {}

  @Get()
  @ApiOkResponse({ type: VaultFileResponseDto, isArray: true })
  list(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.files.list(request.user.id, vaultId);
  }

  @Get('search')
  @ApiOkResponse({ type: SearchFileResponseDto, isArray: true })
  search(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Query() query: SearchFilesDto,
  ) {
    return this.files.search(request.user.id, vaultId, query.query);
  }

  @Get('graph')
  @ApiOkResponse({ type: VaultGraphResponseDto })
  graph(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.files.graph(request.user.id, vaultId);
  }

  @Post('graph/rebuild')
  @ApiCreatedResponse({ type: VaultGraphResponseDto })
  rebuildGraph(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.files.rebuildGraph(request.user.id, vaultId);
  }

  @Post('reset')
  @ApiCreatedResponse({ type: ResetVaultResponseDto })
  reset(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.files.reset(request.user.id, vaultId);
  }

  @Post('operations')
  @ApiCreatedResponse({ type: FileOperationResponseDto })
  apply(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: FileOperationDto,
  ) {
    return this.files.apply(request.user.id, vaultId, body);
  }

  @Get(':fileId/versions')
  @ApiOkResponse({ type: FileVersionResponseDto, isArray: true })
  versions(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.versions(request.user.id, vaultId, fileId);
  }

  @Get(':fileId/versions/:versionId')
  @ApiOkResponse({ type: FileVersionDetailResponseDto })
  version(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return this.files.version(request.user.id, vaultId, fileId, versionId);
  }

  @Post(':fileId/versions/:versionId/restore')
  @ApiCreatedResponse({ type: RestoreFileVersionResponseDto })
  restoreVersion(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return this.files.restoreVersion(
      request.user.id,
      vaultId,
      fileId,
      versionId,
    );
  }

  @Get(':fileId/backlinks')
  @ApiOkResponse({ type: BacklinkResponseDto, isArray: true })
  backlinks(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('fileId', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.backlinks(request.user.id, vaultId, fileId);
  }
}

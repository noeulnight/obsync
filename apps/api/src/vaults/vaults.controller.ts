import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';
import { InviteVaultDto, UpdateVaultMemberDto } from './dto/invite-vault.dto';
import { VaultsService } from './vaults.service';

@Controller('vaults')
@UseGuards(JwtAuthGuard)
export class VaultsController {
  constructor(private readonly vaults: VaultsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.vaults.list(request.user.id);
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateVaultDto) {
    return this.vaults.create(request.user.id, body.name);
  }

  @Get(':vaultId')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.get(request.user.id, vaultId);
  }

  @Patch(':vaultId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: UpdateVaultDto,
  ) {
    return this.vaults.update(request.user.id, vaultId, body.name);
  }

  @Delete(':vaultId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.delete(request.user.id, vaultId);
  }

  @Get(':vaultId/members')
  members(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.members(request.user.id, vaultId);
  }

  @Get(':vaultId/invitations')
  invitations(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.invitations(request.user.id, vaultId);
  }

  @Post(':vaultId/invitations')
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: InviteVaultDto,
  ) {
    return this.vaults.invite(request.user.id, vaultId, body.email, body.role);
  }

  @Patch(':vaultId/members/:memberId')
  updateMember(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body() body: UpdateVaultMemberDto,
  ) {
    return this.vaults.updateMember(
      request.user.id,
      vaultId,
      memberId,
      body.role,
    );
  }

  @Delete(':vaultId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ) {
    return this.vaults.removeMember(request.user.id, vaultId, memberId);
  }

  @Delete(':vaultId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.cancelInvitation(request.user.id, vaultId, invitationId);
  }
}

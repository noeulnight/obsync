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
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { CreateVaultDto } from './dto/create-vault.dto';
import { UpdateVaultDto } from './dto/update-vault.dto';
import { InviteVaultDto, UpdateVaultMemberDto } from './dto/invite-vault.dto';
import {
  VaultInvitationResponseDto,
  VaultMemberResponseDto,
} from './dto/vault-member-response.dto';
import { VaultResponseDto } from './dto/vault-response.dto';
import { VaultsService } from './vaults.service';

@Controller('vaults')
@ApiTags('Vaults')
@UseGuards(JwtAuthGuard)
export class VaultsController {
  constructor(private readonly vaults: VaultsService) {}

  @Get()
  @ApiOkResponse({ type: VaultResponseDto, isArray: true })
  list(@Req() request: AuthenticatedRequest) {
    return this.vaults.list(request.user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: VaultResponseDto })
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateVaultDto) {
    return this.vaults.create(request.user.id, body.name);
  }

  @Get(':vaultId')
  @ApiOkResponse({ type: VaultResponseDto })
  get(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.get(request.user.id, vaultId);
  }

  @Patch(':vaultId')
  @ApiOkResponse({ type: VaultResponseDto })
  update(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: UpdateVaultDto,
  ) {
    return this.vaults.update(request.user.id, vaultId, body.name);
  }

  @Delete(':vaultId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  delete(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.delete(request.user.id, vaultId);
  }

  @Get(':vaultId/members')
  @ApiOkResponse({ type: VaultMemberResponseDto, isArray: true })
  members(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.members(request.user.id, vaultId);
  }

  @Get(':vaultId/invitations')
  @ApiOkResponse({ type: VaultInvitationResponseDto, isArray: true })
  invitations(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
  ) {
    return this.vaults.invitations(request.user.id, vaultId);
  }

  @Post(':vaultId/invitations')
  @ApiCreatedResponse({ type: VaultInvitationResponseDto })
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Body() body: InviteVaultDto,
  ) {
    return this.vaults.invite(request.user.id, vaultId, body.email, body.role);
  }

  @Patch(':vaultId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
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
  @ApiNoContentResponse()
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ) {
    return this.vaults.removeMember(request.user.id, vaultId, memberId);
  }

  @Delete(':vaultId/invitations/:invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  cancelInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('vaultId', new ParseUUIDPipe()) vaultId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.cancelInvitation(request.user.id, vaultId, invitationId);
  }
}

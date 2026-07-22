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
import { PendingVaultInvitationResponseDto } from './dto/vault-member-response.dto';
import { VaultResponseDto } from './dto/vault-response.dto';
import { VaultsService } from './vaults.service';

@Controller('invitations')
@ApiTags('Invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly vaults: VaultsService) {}

  @Get()
  @ApiOkResponse({ type: PendingVaultInvitationResponseDto, isArray: true })
  list(@Req() request: AuthenticatedRequest) {
    return this.vaults.pendingInvitations(request.user.id);
  }

  @Post(':invitationId/accept')
  @ApiCreatedResponse({ type: VaultResponseDto })
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.acceptInvitation(request.user.id, invitationId);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.rejectInvitation(request.user.id, invitationId);
  }
}

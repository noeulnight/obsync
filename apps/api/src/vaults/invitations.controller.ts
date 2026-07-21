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
import { VaultsService } from './vaults.service';

@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly vaults: VaultsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.vaults.pendingInvitations(request.user.id);
  }

  @Post(':invitationId/accept')
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.acceptInvitation(request.user.id, invitationId);
  }

  @Delete(':invitationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
  ) {
    return this.vaults.rejectInvitation(request.user.id, invitationId);
  }
}

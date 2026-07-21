import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VaultsController } from './vaults.controller';
import { VaultsService } from './vaults.service';
import { VaultAccessService } from './vault-access.service';
import { InvitationsController } from './invitations.controller';

@Module({
  imports: [AuthModule],
  controllers: [VaultsController, InvitationsController],
  providers: [VaultsService, VaultAccessService],
  exports: [VaultAccessService],
})
export class VaultsModule {}

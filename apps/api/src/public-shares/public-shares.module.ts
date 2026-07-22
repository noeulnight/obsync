import { Module } from '@nestjs/common';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { AuthModule } from '../auth/auth.module';
import { VaultsModule } from '../vaults/vaults.module';
import {
  PublicShareManagementController,
  PublicSharesController,
} from './public-shares.controller';
import { PublicSharesService } from './public-shares.service';

@Module({
  imports: [AuthModule, CollaborationModule, VaultsModule],
  controllers: [PublicShareManagementController, PublicSharesController],
  providers: [PublicSharesService],
})
export class PublicSharesModule {}

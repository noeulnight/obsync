import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CollaborationServerService } from './collaboration-server.service';
import { VaultsModule } from '../vaults/vaults.module';
import { VaultFilesController } from './vault-files.controller';
import { VaultFilesService } from './vault-files.service';
import { VaultLinksService } from './vault-links.service';

@Module({
  imports: [AuthModule, VaultsModule],
  controllers: [VaultFilesController],
  providers: [CollaborationServerService, VaultFilesService, VaultLinksService],
})
export class CollaborationModule {}

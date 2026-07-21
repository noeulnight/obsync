import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentCleanupService } from './attachment-cleanup.service';
import { VaultsModule } from '../vaults/vaults.module';

@Module({
  imports: [AuthModule, VaultsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentCleanupService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { VaultsModule } from '../vaults/vaults.module';
import { McpAuthGuard } from './mcp-auth.guard';
import { McpController } from './mcp.controller';
import { McpOAuthController } from './mcp-oauth.controller';
import { McpOAuthService } from './mcp-oauth.service';
import { McpService } from './mcp.service';

@Module({
  imports: [AuthModule, AttachmentsModule, CollaborationModule, VaultsModule],
  controllers: [McpController, McpOAuthController],
  providers: [McpService, McpOAuthService, McpAuthGuard],
  exports: [McpOAuthService],
})
export class McpModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { appConfig } from './config/configs/app.config';
import { databaseConfig } from './config/configs/database.config';
import { authConfig } from './config/configs/auth.config';
import { storageConfig } from './config/configs/storage.config';
import { DatabaseModule } from './database/database.module';
import { environmentValidationSchema } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { HttpModule } from './http/http.module';
import { VaultsModule } from './vaults/vaults.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    CollaborationModule,
    AuthModule,
    AttachmentsModule,
    VaultsModule,
    DatabaseModule,
    StorageModule,
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      load: [appConfig, authConfig, databaseConfig, storageConfig],
      validationSchema: environmentValidationSchema,
    }),
    HealthModule,
    HttpModule,
  ],
})
export class AppModule {}

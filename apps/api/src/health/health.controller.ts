import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';

@Controller()
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  async ready() {
    this.config.getOrThrow<string>('app.nodeEnv');
    this.config.getOrThrow<number>('app.port');
    await this.prisma.$queryRaw`SELECT 1`;
    await this.storage.check();
    return {
      status: 'ready' as const,
      checks: {
        config: 'up' as const,
        database: 'up' as const,
        storage: 'up' as const,
      },
    };
  }
}

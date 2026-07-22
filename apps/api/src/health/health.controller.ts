import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  HealthResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';

@Controller()
@ApiTags('System')
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('health')
  @ApiOkResponse({ type: HealthResponseDto })
  health() {
    return { status: 'ok' as const };
  }

  @Get('ready')
  @ApiOkResponse({ type: ReadinessResponseDto })
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

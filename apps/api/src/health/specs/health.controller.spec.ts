import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { appConfig } from '../../config/configs/app.config';
import { HealthController } from '../health.controller';
import { HealthModule } from '../health.module';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from '../../storage/storage.service';

describe('HealthController', () => {
  it('reports health and readiness', async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        HealthModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) })
      .overrideProvider(StorageService)
      .useValue({ check: jest.fn().mockResolvedValue(undefined) })
      .compile();
    const controller = module.get(HealthController);

    expect(controller.health()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      checks: { config: 'up', database: 'up', storage: 'up' },
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AppValidationPipe } from './../src/http/pipes/app-validation.pipe';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new AppValidationPipe());
    await app.init();
  });

  afterAll(() => app.close());

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .set('x-request-id', 'health-test')
      .expect(200)
      .expect('x-request-id', 'health-test')
      .expect({ status: 'ok' });
  });

  it('/api/ready (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/ready')
      .expect(200)
      .expect({
        status: 'ready',
        checks: { config: 'up', database: 'up', storage: 'up' },
      });
  });
});

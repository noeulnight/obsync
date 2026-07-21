import { ConfigService } from '@nestjs/config';
import { StorageService } from '../storage.service';

describe('StorageService', () => {
  it('uses separate internal and public endpoints', async () => {
    const values: Record<string, unknown> = {
      'storage.bucket': 'obsync',
      'storage.endpoint': 'http://localhost:9000',
      'storage.publicEndpoint': 'http://mac.lab:9000',
      'storage.region': 'us-east-1',
      'storage.forcePathStyle': true,
      'storage.accessKeyId': 'minioadmin',
      'storage.secretAccessKey': 'minioadmin',
    };
    const config = {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => values[key],
    } as ConfigService;
    const storage = new StorageService(config);

    expect((await storage.client.config.endpoint()).hostname).toBe('localhost');
    expect((await storage.publicClient.config.endpoint()).hostname).toBe(
      'mac.lab',
    );

    storage.onModuleDestroy();
  });
});

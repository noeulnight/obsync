import {
  DeleteObjectCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService implements OnModuleDestroy {
  readonly bucket: string;
  readonly client: S3Client;
  readonly publicClient: S3Client;

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('storage.bucket');
    const accessKeyId = config.get<string>('storage.accessKeyId');
    const secretAccessKey = config.get<string>('storage.secretAccessKey');
    const options = {
      endpoint: config.get<string>('storage.endpoint'),
      region: config.getOrThrow<string>('storage.region'),
      forcePathStyle: config.getOrThrow<boolean>('storage.forcePathStyle'),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    };
    this.client = new S3Client(options);
    this.publicClient = new S3Client({
      ...options,
      endpoint:
        config.get<string>('storage.publicEndpoint') ?? options.endpoint,
    });
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  objectKey(vaultId: string, attachmentId: string): string {
    return `vaults/${vaultId}/attachments/${attachmentId}`;
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  onModuleDestroy() {
    this.client.destroy();
    this.publicClient.destroy();
  }
}

import { registerAs } from '@nestjs/config';

export const storageConfig = registerAs('storage', () => ({
  endpoint: process.env.S3_ENDPOINT || undefined,
  publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || undefined,
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'obsync',
  accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
}));

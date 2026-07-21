import {
  type Environment,
  environmentValidationSchema,
} from '../environment.validation';

describe('environment validation', () => {
  it('applies development defaults', () => {
    const result = environmentValidationSchema.validate({});

    expect(result.error).toBeUndefined();
    if (result.error) throw result.error;
    expect(result.value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'log',
      WEB_URL: 'http://localhost:5173',
      DATABASE_URL:
        'postgresql://obsync:obsync@localhost:5432/obsync?schema=public',
      JWT_ACCESS_SECRET: 'dev-access-secret-change-before-production',
      JWT_REFRESH_SECRET: 'dev-refresh-secret-change-before-production',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'obsync',
      S3_ACCESS_KEY_ID: 'minioadmin',
      S3_SECRET_ACCESS_KEY: 'minioadmin',
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it('rejects invalid values', () => {
    const { error } = environmentValidationSchema.validate({
      PORT: 'invalid',
      S3_PUBLIC_ENDPOINT: 'not-a-url',
    });

    expect(error).toBeDefined();
  });

  it('accepts a separate public S3 endpoint', () => {
    const result = environmentValidationSchema.validate({
      S3_PUBLIC_ENDPOINT: 'http://mac.lab:9000',
    });

    expect(result.error).toBeUndefined();
    expect((result.value as Environment).S3_PUBLIC_ENDPOINT).toBe(
      'http://mac.lab:9000',
    );
  });

  it('enables OIDC only with a complete client configuration', () => {
    const result = environmentValidationSchema.validate({
      OIDC_ISSUER: 'https://accounts.example.com',
      OIDC_CLIENT_ID: 'obsync',
      OIDC_CLIENT_SECRET: 'secret',
      OIDC_REDIRECT_URI: 'https://sync.example.com/api/auth/oidc/callback',
    });

    expect(result.error).toBeUndefined();
  });

  it('rejects an incomplete OIDC configuration', () => {
    const { error } = environmentValidationSchema.validate({
      OIDC_ISSUER: 'https://accounts.example.com',
    });

    expect(error).toBeDefined();
  });

  it('requires explicit secrets in production', () => {
    const { error } = environmentValidationSchema.validate({
      NODE_ENV: 'production',
    });

    expect(error).toBeDefined();
  });

  it('requires the matching S3 secret key', () => {
    const { error } = environmentValidationSchema.validate({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://user:pass@example.com:5432/db',
      JWT_ACCESS_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
      S3_ACCESS_KEY_ID: 'key',
    });

    expect(error).toBeDefined();
  });
});

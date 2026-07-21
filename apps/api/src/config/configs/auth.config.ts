import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET ??
      'dev-access-secret-change-before-production',
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ??
      'dev-refresh-secret-change-before-production',
    accessTtlSeconds: 15 * 60,
    refreshTtlSeconds: 30 * 24 * 60 * 60,
  },
}));

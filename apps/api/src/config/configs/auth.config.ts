import { registerAs } from '@nestjs/config';

export const authConfig = registerAs('auth', () => ({
  registrationEnabled: process.env.REGISTRATION_ENABLED !== 'false',
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
  oidc: {
    issuer: process.env.OIDC_ISSUER,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
    redirectUri: process.env.OIDC_REDIRECT_URI,
    scopes: process.env.OIDC_SCOPES ?? 'openid email profile',
  },
}));

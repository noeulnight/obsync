import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Configuration } from 'openid-client';

export type OidcTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo?: string;
};

export type OidcProfile = {
  issuer: string;
  subject: string;
  email: string;
  displayName?: string;
};

@Injectable()
export class OidcService {
  private configuration?: Promise<Configuration>;

  constructor(private readonly config: ConfigService) {}

  enabled() {
    return Boolean(this.config.get<string>('auth.oidc.issuer'));
  }

  async start() {
    const client = await import('openid-client');
    const oidc = await this.configurationOrThrow();
    const transaction = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      codeVerifier: client.randomPKCECodeVerifier(),
    } satisfies OidcTransaction;
    const url = client.buildAuthorizationUrl(oidc, {
      redirect_uri: this.config.getOrThrow<string>('auth.oidc.redirectUri'),
      scope: this.config.getOrThrow<string>('auth.oidc.scopes'),
      response_type: 'code',
      code_challenge: await client.calculatePKCECodeChallenge(
        transaction.codeVerifier,
      ),
      code_challenge_method: 'S256',
      state: transaction.state,
      nonce: transaction.nonce,
    });
    return { url, transaction };
  }

  async callback(
    callbackUrl: URL,
    transaction: OidcTransaction,
  ): Promise<OidcProfile> {
    let tokens;
    try {
      const client = await import('openid-client');
      tokens = await client.authorizationCodeGrant(
        await this.configurationOrThrow(),
        callbackUrl,
        {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          idTokenExpected: true,
        },
      );
    } catch {
      throw new UnauthorizedException('Identity provider sign-in failed');
    }

    const claims = tokens.claims();
    if (
      !claims ||
      typeof claims.sub !== 'string' ||
      typeof claims.iss !== 'string' ||
      typeof claims.email !== 'string'
    ) {
      throw new UnauthorizedException(
        'The identity provider did not return an email address',
      );
    }
    return {
      issuer: claims.iss,
      subject: claims.sub,
      email: claims.email,
      ...(typeof claims.name === 'string' ? { displayName: claims.name } : {}),
    };
  }

  private configurationOrThrow() {
    const issuer = this.config.get<string>('auth.oidc.issuer');
    const clientId = this.config.get<string>('auth.oidc.clientId');
    const clientSecret = this.config.get<string>('auth.oidc.clientSecret');
    if (!issuer || !clientId || !clientSecret) {
      throw new BadRequestException('Single sign-on is not configured');
    }
    this.configuration ??= import('openid-client')
      .then((client) =>
        client.discovery(new URL(issuer), clientId, clientSecret),
      )
      .catch(() => {
        this.configuration = undefined;
        throw new ServiceUnavailableException(
          'Identity provider is unavailable',
        );
      });
    return this.configuration;
  }
}

export class UserResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  createdAt!: Date;
  canManageCredentials!: boolean;
}

export class SessionResponseDto {
  id!: string;
  userAgent!: string | null;
  createdAt!: Date;
  expiresAt!: Date;
  current!: boolean;
}

export class AuthTokensResponseDto {
  accessToken!: string;
  refreshToken!: string;
}

export class AccessTokenResponseDto {
  accessToken!: string;
}

export class OidcConfigResponseDto {
  enabled!: boolean;
  registrationEnabled!: boolean;
}

export class DeviceCodeResponseDto {
  deviceCode!: string;
  userCode!: string;
  verificationUri!: string;
  expiresIn!: number;
  interval!: number;
}

export class PendingDeviceTokenResponseDto {
  status!: 'pending';
}

export class AuthorizedDeviceTokenResponseDto extends AuthTokensResponseDto {
  status!: 'authorized';
}

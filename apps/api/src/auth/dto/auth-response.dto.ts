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

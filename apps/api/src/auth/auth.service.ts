import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { argon2id, hash, verify } from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import type {
  AuthTokensResponseDto,
  SessionResponseDto,
  UserResponseDto,
} from './dto/auth-response.dto';
import type { JwtPayload } from './types/jwt-payload.type';

const deviceCodeTtlMs = 10 * 60 * 1000;
const devicePollIntervalSeconds = 2;
const userCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const userSelect = {
  id: true,
  email: true,
  displayName: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async register(email: string, password: string): Promise<UserResponseDto> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: this.normalizeEmail(email),
          passwordHash: await this.hashSecret(password),
        },
        select: userSelect,
      });
      return user;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async login(email: string, password: string, userAgent?: string) {
    const user = await this.authenticate(email, password);
    return this.issueTokens(user.id, userAgent);
  }

  async startDeviceAuthorization() {
    const deviceCode = randomBytes(32).toString('base64url');
    const userCode = this.userCode();
    await this.prisma.deviceAuthorization.create({
      data: {
        deviceCodeHash: this.codeHash(deviceCode),
        userCodeHash: this.codeHash(userCode),
        expiresAt: new Date(Date.now() + deviceCodeTtlMs),
      },
    });
    return {
      deviceCode,
      userCode,
      verificationUri: new URL(
        '/device',
        this.config.getOrThrow<string>('app.webUrl'),
      ).toString(),
      expiresIn: deviceCodeTtlMs / 1000,
      interval: devicePollIntervalSeconds,
    };
  }

  async approveDeviceAuthorization(
    userId: string,
    userCode: string,
  ): Promise<void> {
    const authorization = await this.prisma.deviceAuthorization.findFirst({
      where: {
        userCodeHash: this.codeHash(userCode),
        userId: null,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!authorization)
      throw new BadRequestException('Device code is invalid or expired');

    const approved = await this.prisma.deviceAuthorization.updateMany({
      where: { id: authorization.id, userId: null, consumedAt: null },
      data: { userId, approvedAt: new Date() },
    });
    if (approved.count !== 1)
      throw new BadRequestException('Device code is unavailable');
  }

  async pollDeviceAuthorization(deviceCode: string, userAgent?: string) {
    const authorization = await this.prisma.deviceAuthorization.findUnique({
      where: { deviceCodeHash: this.codeHash(deviceCode) },
      select: { id: true, userId: true, expiresAt: true, consumedAt: true },
    });
    if (
      !authorization ||
      authorization.expiresAt <= new Date() ||
      authorization.consumedAt
    ) {
      throw new BadRequestException('Device code is invalid or expired');
    }
    if (!authorization.userId) return { status: 'pending' as const };

    const consumed = await this.prisma.deviceAuthorization.updateMany({
      where: { id: authorization.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1)
      throw new BadRequestException('Device code is unavailable');
    return {
      status: 'authorized' as const,
      ...(await this.issueTokens(authorization.userId, userAgent)),
    };
  }

  async refresh(refreshToken: string, userAgent?: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!session || !(await verify(session.refreshTokenHash, refreshToken))) {
      throw new UnauthorizedException();
    }

    const revoked = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedException();
    return this.issueTokens(
      session.userId,
      userAgent ?? session.userAgent ?? undefined,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    await this.prisma.session.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
    if (!user) throw new UnauthorizedException();
    return user;
  }

  async updateAccount(
    userId: string,
    input: { displayName?: string; email?: string; currentPassword?: string },
  ): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const email = input.email && this.normalizeEmail(input.email);
    if (email && email !== user.email) {
      if (
        !input.currentPassword ||
        !(await verify(user.passwordHash, input.currentPassword))
      ) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName === undefined
            ? {}
            : { displayName: input.displayName.trim() || null }),
          ...(email === undefined ? {} : { email }),
        },
        select: userSelect,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw error;
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verify(user.passwordHash, currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const passwordHash = await this.hashSecret(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async sessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const revoked = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0)
      throw new BadRequestException('Session is unavailable');
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const attachments = await this.prisma.attachment.findMany({
      where: { vault: { ownerId: userId } },
      select: { objectKey: true },
    });
    for (const attachment of attachments)
      await this.storage.deleteObject(attachment.objectKey);
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private async authenticate(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
    });
    if (!user || !(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  private userCode() {
    const code = [...randomBytes(8)]
      .map((value) => userCodeAlphabet[value % userCodeAlphabet.length])
      .join('');
    return `${code.slice(0, 4)}-${code.slice(4)}`;
  }

  private codeHash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async issueTokens(
    userId: string,
    userAgent?: string,
  ): Promise<AuthTokensResponseDto> {
    const sessionId = randomUUID();
    const accessTtl = this.config.getOrThrow<number>(
      'auth.jwt.accessTtlSeconds',
    );
    const refreshTtl = this.config.getOrThrow<number>(
      'auth.jwt.refreshTtlSeconds',
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, type: 'access', sid: sessionId } satisfies JwtPayload,
        {
          secret: this.config.getOrThrow<string>('auth.jwt.accessSecret'),
          expiresIn: accessTtl,
        },
      ),
      this.jwt.signAsync(
        { sub: userId, type: 'refresh', sid: sessionId } satisfies JwtPayload,
        {
          secret: this.config.getOrThrow<string>('auth.jwt.refreshSecret'),
          expiresIn: refreshTtl,
        },
      ),
    ]);
    await this.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        userAgent: userAgent?.slice(0, 500),
        refreshTokenHash: await this.hashSecret(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('auth.jwt.refreshSecret'),
      });
      if (payload.type !== 'refresh' || !payload.sid) {
        throw new UnauthorizedException();
      }
      return payload as JwtPayload & { sid: string };
    } catch {
      throw new UnauthorizedException();
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private async hashSecret(value: string): Promise<string> {
    return (await hash(value, { type: argon2id })) as string;
  }
}

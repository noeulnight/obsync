import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCreatedResponse,
  ApiExtraModels,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { DeviceApprovalDto, DeviceTokenDto } from './dto/device-auth.dto';
import {
  AccessTokenResponseDto,
  AuthorizedDeviceTokenResponseDto,
  AuthTokensResponseDto,
  DeviceCodeResponseDto,
  OidcConfigResponseDto,
  PendingDeviceTokenResponseDto,
  SessionResponseDto,
  UserResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedRequest } from './interfaces/authenticated-request.interface';
import { JwtAuthGuard } from './jwt-auth.guard';
import { OidcService, type OidcTransaction } from './oidc.service';

@Controller('auth')
@ApiTags('Authentication')
@ApiExtraModels(PendingDeviceTokenResponseDto, AuthorizedDeviceTokenResponseDto)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly oidc: OidcService,
  ) {}

  @Get('oidc/config')
  @ApiOkResponse({ type: OidcConfigResponseDto })
  oidcConfig() {
    return {
      enabled: this.oidc.enabled(),
      registrationEnabled: this.config.getOrThrow<boolean>(
        'auth.registrationEnabled',
      ),
    };
  }

  @Get('oidc/start')
  @ApiFoundResponse({ description: 'Redirects to the identity provider.' })
  async oidcStart(
    @Query('return_to') returnTo: string | undefined,
    @Res() response: Response,
  ) {
    const { url, transaction } = await this.oidc.start();
    response.cookie(
      oidcCookieName,
      encodeTransaction({ ...transaction, returnTo: localPath(returnTo) }),
      {
        ...this.oidcCookieOptions(),
        maxAge: oidcCookieTtlMs,
      },
    );
    response.redirect(url.toString());
  }

  @Get('oidc/callback')
  @ApiFoundResponse({ description: 'Sets the web session and redirects back.' })
  async oidcCallback(@Req() request: Request, @Res() response: Response) {
    const transaction = decodeTransaction(cookie(request, oidcCookieName));
    response.clearCookie(oidcCookieName, this.oidcCookieOptions());
    if (!transaction) throw new UnauthorizedException('Sign-in expired');

    const callbackUrl = new URL(
      this.config.getOrThrow<string>('auth.oidc.redirectUri'),
    );
    callbackUrl.search = new URL(
      request.originalUrl,
      'http://localhost',
    ).search;
    const profile = await this.oidc.callback(callbackUrl, transaction);
    this.webTokens(
      response,
      await this.auth.loginOidc(profile, userAgent(request)),
    );
    response.redirect(
      new URL(
        transaction.returnTo ?? '/',
        this.config.getOrThrow<string>('app.webUrl'),
      ).toString(),
    );
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.register(body.email, body.password);
    return this.webTokens(
      response,
      await this.auth.login(body.email, body.password, userAgent(request)),
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.webTokens(
      response,
      await this.auth.login(body.email, body.password, userAgent(request)),
    );
  }

  @Post('device/code')
  @ApiCreatedResponse({ type: DeviceCodeResponseDto })
  deviceCode() {
    return this.auth.startDeviceAuthorization();
  }

  @Post('device/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @UseGuards(JwtAuthGuard)
  async approveDevice(
    @Body() body: DeviceApprovalDto,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.auth.approveDeviceAuthorization(request.user.id, body.userCode);
  }

  @Post('device/token')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(PendingDeviceTokenResponseDto) },
        { $ref: getSchemaPath(AuthorizedDeviceTokenResponseDto) },
      ],
    },
  })
  deviceToken(@Body() body: DeviceTokenDto, @Req() request: Request) {
    return this.auth.pollDeviceAuthorization(
      body.deviceCode,
      userAgent(request),
    );
  }

  @Post('device/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AuthTokensResponseDto })
  deviceRefresh(@Body() body: RefreshDto, @Req() request: Request) {
    return this.auth.refresh(body.refreshToken, userAgent(request));
  }

  @Post('device/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  deviceLogout(@Body() body: RefreshDto) {
    return this.auth.logout(body.refreshToken);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AccessTokenResponseDto })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = refreshCookie(request);
    if (!refreshToken) throw new UnauthorizedException();
    return this.webTokens(
      response,
      await this.auth.refresh(refreshToken, userAgent(request)),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = refreshCookie(request);
    if (refreshToken) await this.auth.logout(refreshToken);
    response.clearCookie(refreshCookieName, this.cookieOptions());
  }

  @Get('me')
  @ApiOkResponse({ type: UserResponseDto })
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.auth.me(request.user.id);
  }

  @Patch('me')
  @ApiOkResponse({ type: UserResponseDto })
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: UpdateAccountDto,
  ) {
    return this.auth.updateAccount(request.user.id, body);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.changePassword(
      request.user.id,
      body.currentPassword,
      body.newPassword,
    );
    response.clearCookie(refreshCookieName, this.cookieOptions());
  }

  @Get('sessions')
  @ApiOkResponse({ type: SessionResponseDto, isArray: true })
  @UseGuards(JwtAuthGuard)
  sessions(@Req() request: AuthenticatedRequest) {
    return this.auth.sessions(request.user.id, request.user.sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @UseGuards(JwtAuthGuard)
  revokeSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
  ) {
    return this.auth.revokeSession(request.user.id, sessionId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @UseGuards(JwtAuthGuard)
  async deleteMe(
    @Req() request: AuthenticatedRequest,
    @Body() body: DeleteAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.deleteAccount(request.user.id, body.password);
    response.clearCookie(refreshCookieName, this.cookieOptions());
  }

  private webTokens(
    response: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    response.cookie(refreshCookieName, tokens.refreshToken, {
      ...this.cookieOptions(),
      maxAge:
        this.config.getOrThrow<number>('auth.jwt.refreshTtlSeconds') * 1000,
    });
    return { accessToken: tokens.accessToken };
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.getOrThrow<string>('app.nodeEnv') === 'production',
      path: '/api/auth',
    };
  }

  private oidcCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.getOrThrow<string>('app.nodeEnv') === 'production',
      path: '/api/auth/oidc',
    };
  }
}

const refreshCookieName = 'obsync_refresh';
const oidcCookieName = 'obsync_oidc';
const oidcCookieTtlMs = 10 * 60 * 1000;

function refreshCookie(request: Request) {
  return cookie(request, refreshCookieName);
}

function cookie(request: Request, cookieName: string) {
  const pair = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim().split('='))
    .find(([name]) => name === cookieName);
  if (!pair) return undefined;
  try {
    return decodeURIComponent(pair.slice(1).join('='));
  } catch {
    return undefined;
  }
}

function encodeTransaction(transaction: OidcTransaction) {
  return Buffer.from(JSON.stringify(transaction)).toString('base64url');
}

function decodeTransaction(value?: string): OidcTransaction | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as OidcTransaction;
  } catch {
    return undefined;
  }
}

function localPath(value?: string) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : undefined;
}

function userAgent(request: Request) {
  return request.get('user-agent') ?? undefined;
}

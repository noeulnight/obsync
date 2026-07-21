import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Prisma } from '@prisma/client';
import { verify } from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth.service';

describe('AuthService', () => {
  it('normalizes email, hashes the password, and returns no hash', async () => {
    const createdAt = new Date();
    const create = jest.fn((args: Prisma.UserCreateArgs) =>
      Promise.resolve({
        id: 'user-id',
        email: String(args.data.email),
        displayName: null,
        createdAt,
      }),
    );
    const prisma = { user: { create } } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      new JwtService(),
      new ConfigService(),
      { deleteObject: jest.fn() } as never,
    );

    const user = await service.register(' User@Example.COM ', 'password123');
    const passwordHash = String(create.mock.calls[0][0].data.passwordHash);

    expect(user).toEqual({
      id: 'user-id',
      email: 'user@example.com',
      displayName: null,
      createdAt,
    });
    expect(passwordHash).not.toBe('password123');
    await expect(verify(passwordHash, 'password123')).resolves.toBe(true);
  });

  it('approves a device for the authenticated web user', async () => {
    let update = '';
    const updateMany = jest.fn((args: unknown) => {
      update = JSON.stringify(args);
      return Promise.resolve({ count: 1 });
    });
    const prisma = {
      deviceAuthorization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'authorization-id' }),
        updateMany,
      },
    } as unknown as PrismaService;
    const service = new AuthService(
      prisma,
      new JwtService(),
      new ConfigService(),
      { deleteObject: jest.fn() } as never,
    );

    await service.approveDeviceAuthorization('user-id', 'ABCD-EFGH');

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(update).toContain('"id":"authorization-id"');
    expect(update).toContain('"userId":"user-id"');
  });
});

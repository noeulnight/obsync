import { Injectable, NotFoundException } from '@nestjs/common';
import type { VaultRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type EffectiveVaultRole = 'OWNER' | VaultRole;

@Injectable()
export class VaultAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRead(
    userId: string,
    vaultId: string,
  ): Promise<EffectiveVaultRole> {
    const vault = await this.prisma.vault.findUnique({
      where: { id: vaultId },
      select: {
        ownerId: true,
        members: { where: { userId }, select: { role: true }, take: 1 },
      },
    });
    if (!vault) throw new NotFoundException('Vault not found');
    if (vault.ownerId === userId) return 'OWNER';
    const role = vault.members[0]?.role;
    if (!role) throw new NotFoundException('Vault not found');
    return role;
  }

  async requireWrite(
    userId: string,
    vaultId: string,
  ): Promise<EffectiveVaultRole> {
    const role = await this.requireRead(userId, vaultId);
    if (role === 'VIEWER') throw new NotFoundException('Vault not found');
    return role;
  }

  async requireOwner(userId: string, vaultId: string): Promise<void> {
    if ((await this.requireRead(userId, vaultId)) !== 'OWNER') {
      throw new NotFoundException('Vault not found');
    }
  }
}

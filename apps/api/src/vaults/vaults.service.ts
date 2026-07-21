import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { VaultRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { VaultResponseDto } from './dto/vault-response.dto';
import { VaultAccessService } from './vault-access.service';

const invitationTtlMs = 7 * 24 * 60 * 60 * 1000;
const vaultSelect = {
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class VaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: VaultAccessService,
  ) {}

  async list(userId: string): Promise<VaultResponseDto[]> {
    const vaults = await this.prisma.vault.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
      select: {
        ...vaultSelect,
        ownerId: true,
        members: { where: { userId }, select: { role: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });
    return vaults.map(({ ownerId, members, ...vault }) => ({
      ...vault,
      role: ownerId === userId ? 'OWNER' : (members[0]?.role ?? 'VIEWER'),
    }));
  }

  async create(ownerId: string, name: string): Promise<VaultResponseDto> {
    const vault = await this.prisma.vault.create({
      data: { ownerId, name: name.trim() },
      select: vaultSelect,
    });
    return { ...vault, role: 'OWNER' };
  }

  async get(userId: string, id: string): Promise<VaultResponseDto> {
    const role = await this.access.requireRead(userId, id);
    const vault = await this.prisma.vault.findUnique({
      where: { id },
      select: vaultSelect,
    });
    if (!vault) throw new NotFoundException('Vault not found');
    return { ...vault, role };
  }

  async update(
    userId: string,
    id: string,
    name?: string,
  ): Promise<VaultResponseDto> {
    await this.access.requireOwner(userId, id);
    const vault = await this.prisma.vault.update({
      where: { id },
      data: name === undefined ? {} : { name: name.trim() },
      select: vaultSelect,
    });
    return { ...vault, role: 'OWNER' };
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.access.requireOwner(userId, id);
    const attachments = await this.prisma.attachment.findMany({
      where: { vaultId: id },
      select: { objectKey: true },
    });
    for (const attachment of attachments)
      await this.storage.deleteObject(attachment.objectKey);
    await this.prisma.vault.delete({ where: { id } });
  }

  async members(userId: string, vaultId: string) {
    await this.access.requireRead(userId, vaultId);
    const vault = await this.prisma.vault.findUnique({
      where: { id: vaultId },
      select: {
        owner: { select: { id: true, email: true, displayName: true } },
        members: {
          select: {
            user: { select: { id: true, email: true, displayName: true } },
            role: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!vault) throw new NotFoundException('Vault not found');
    return [
      { ...vault.owner, role: 'OWNER' as const },
      ...vault.members.map(({ user, ...member }) => ({ ...user, ...member })),
    ];
  }

  async invitations(userId: string, vaultId: string) {
    await this.access.requireOwner(userId, vaultId);
    return this.prisma.vaultInvitation.findMany({
      where: { vaultId, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(
    userId: string,
    vaultId: string,
    rawEmail: string,
    role: VaultRole,
  ) {
    await this.access.requireOwner(userId, vaultId);
    const email = rawEmail.trim().toLowerCase();
    const target = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        vaults: { where: { id: vaultId }, select: { id: true } },
        vaultMemberships: { where: { vaultId }, select: { id: true } },
      },
    });
    if (target?.vaults.length || target?.vaultMemberships.length) {
      throw new ConflictException('User is already a Vault member');
    }
    return this.prisma.vaultInvitation.upsert({
      where: { vaultId_email: { vaultId, email } },
      create: {
        vaultId,
        email,
        role,
        invitedById: userId,
        expiresAt: new Date(Date.now() + invitationTtlMs),
      },
      update: {
        role,
        invitedById: userId,
        expiresAt: new Date(Date.now() + invitationTtlMs),
      },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async updateMember(
    userId: string,
    vaultId: string,
    memberId: string,
    role: VaultRole,
  ) {
    await this.access.requireOwner(userId, vaultId);
    const result = await this.prisma.vaultMember.updateMany({
      where: { vaultId, userId: memberId },
      data: { role },
    });
    if (!result.count) throw new NotFoundException('Vault member not found');
  }

  async removeMember(userId: string, vaultId: string, memberId: string) {
    await this.access.requireOwner(userId, vaultId);
    const result = await this.prisma.vaultMember.deleteMany({
      where: { vaultId, userId: memberId },
    });
    if (!result.count) throw new NotFoundException('Vault member not found');
  }

  async cancelInvitation(
    userId: string,
    vaultId: string,
    invitationId: string,
  ) {
    await this.access.requireOwner(userId, vaultId);
    const result = await this.prisma.vaultInvitation.deleteMany({
      where: { id: invitationId, vaultId },
    });
    if (!result.count)
      throw new NotFoundException('Vault invitation not found');
  }

  async pendingInvitations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException();
    return this.prisma.vaultInvitation.findMany({
      where: { email: user.email, expiresAt: { gt: new Date() } },
      select: {
        id: true,
        role: true,
        expiresAt: true,
        vault: { select: { id: true, name: true } },
        invitedBy: { select: { displayName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async acceptInvitation(userId: string, invitationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException();
    const invitation = await this.prisma.vaultInvitation.findFirst({
      where: {
        id: invitationId,
        email: user.email,
        expiresAt: { gt: new Date() },
      },
    });
    if (!invitation) throw new NotFoundException('Vault invitation not found');
    await this.prisma.$transaction([
      this.prisma.vaultMember.upsert({
        where: { vaultId_userId: { vaultId: invitation.vaultId, userId } },
        create: { vaultId: invitation.vaultId, userId, role: invitation.role },
        update: { role: invitation.role },
      }),
      this.prisma.vaultInvitation.delete({ where: { id: invitation.id } }),
    ]);
    return this.get(userId, invitation.vaultId);
  }

  async rejectInvitation(userId: string, invitationId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException();
    const result = await this.prisma.vaultInvitation.deleteMany({
      where: { id: invitationId, email: user.email },
    });
    if (!result.count)
      throw new NotFoundException('Vault invitation not found');
  }
}

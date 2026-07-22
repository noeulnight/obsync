export class VaultMemberResponseDto {
  id!: string;
  email!: string;
  displayName!: string | null;
  role!: 'OWNER' | 'EDITOR' | 'VIEWER';
  createdAt?: Date;
}

export class VaultInvitationResponseDto {
  id!: string;
  email!: string;
  role!: 'EDITOR' | 'VIEWER';
  expiresAt!: Date;
  createdAt!: Date;
}

export class InvitationVaultResponseDto {
  id!: string;
  name!: string;
}

export class InvitationSenderResponseDto {
  displayName!: string | null;
  email!: string;
}

export class PendingVaultInvitationResponseDto {
  id!: string;
  role!: 'EDITOR' | 'VIEWER';
  expiresAt!: Date;
  vault!: InvitationVaultResponseDto;
  invitedBy!: InvitationSenderResponseDto;
}

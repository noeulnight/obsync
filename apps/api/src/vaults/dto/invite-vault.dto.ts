import { VaultRole } from '@prisma/client';
import { IsEmail, IsEnum } from 'class-validator';

export class InviteVaultDto {
  @IsEmail()
  email!: string;

  @IsEnum(VaultRole)
  role!: VaultRole;
}

export class UpdateVaultMemberDto {
  @IsEnum(VaultRole)
  role!: VaultRole;
}

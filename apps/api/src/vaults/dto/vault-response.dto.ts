export class VaultResponseDto {
  id!: string;
  name!: string;
  createdAt!: Date;
  updatedAt!: Date;
  role!: 'OWNER' | 'EDITOR' | 'VIEWER';
}

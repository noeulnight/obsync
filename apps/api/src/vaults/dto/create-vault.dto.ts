import { IsString, Length } from 'class-validator';

export class CreateVaultDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

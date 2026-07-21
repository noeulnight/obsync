import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class PresignUploadDto {
  @IsUUID()
  idempotencyKey!: string;

  @IsString()
  @Length(1, 1024)
  path!: string;

  @IsInt()
  @Min(1)
  @Max(100 * 1024 * 1024)
  size!: number;

  @IsString()
  @Length(3, 255)
  @Matches(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i)
  mimeType!: string;

  @Matches(/^[a-f0-9]{64}$/i)
  sha256!: string;
}

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export enum FileOperationType {
  CREATE = 'create',
  RENAME = 'rename',
  DELETE = 'delete',
  UPDATE_ATTACHMENT = 'updateAttachment',
}

export enum FileKind {
  MARKDOWN = 'markdown',
  ATTACHMENT = 'attachment',
  FOLDER = 'folder',
  CANVAS = 'canvas',
}

export class FileOperationDto {
  @IsUUID()
  operationId!: string;

  @IsUUID()
  fileId!: string;

  @IsEnum(FileOperationType)
  type!: FileOperationType;

  @IsOptional()
  @IsEnum(FileKind)
  kind?: FileKind;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  path?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  baseVersion?: number;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}

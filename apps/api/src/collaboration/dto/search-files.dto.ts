import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchFilesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  query!: string;
}

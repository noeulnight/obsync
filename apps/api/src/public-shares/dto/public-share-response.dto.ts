export class PublicShareResponseDto {
  slug!: string;
  createdAt!: Date;
}

export class PublicShareFileResponseDto {
  id!: string;
  kind!: 'markdown' | 'canvas';
  path!: string;
}

export class PublicShareDocumentResponseDto {
  id!: string;
  path!: string;
  content!: string;
}

export class PublicShareAttachmentResponseDto {
  id!: string;
  path!: string;
  mimeType!: string;
}

export class PublicShareContentResponseDto {
  slug!: string;
  vaultName!: string;
  file!: PublicShareFileResponseDto;
  content?: string;
  canvas?: Record<string, unknown>;
  documents!: PublicShareDocumentResponseDto[];
  attachments!: PublicShareAttachmentResponseDto[];
}

export class PublicShareDownloadResponseDto {
  downloadUrl!: string;
  expiresIn!: number;
}

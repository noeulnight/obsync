export class AttachmentResponseDto {
  id!: string;
  path!: string;
  size!: number;
  mimeType!: string;
  sha256!: string;
  status!: 'PENDING' | 'READY' | 'DELETED';
  createdAt!: Date;
  updatedAt!: Date;
}

export class PresignUploadResponseDto {
  attachment!: AttachmentResponseDto;
  uploadUrl!: string | null;
  uploadHeaders!: Record<string, string>;
  expiresIn!: number;
  alreadyReady!: boolean;
}

export class DownloadResponseDto {
  downloadUrl!: string;
  expiresIn!: number;
}

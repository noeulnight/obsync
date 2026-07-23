export class VaultFileResponseDto {
  id!: string;
  kind!: 'markdown' | 'canvas' | 'folder' | 'attachment';
  path!: string;
  deleted!: boolean;
  version!: number;
  updatedAt!: Date;
  attachmentId!: string | null;
  mimeType!: string | null;
  sha256!: string | null;
  size!: number | null;
}

export class SearchFileResponseDto {
  id!: string;
  path!: string;
  excerpt!: string;
}

export class FileOperationResponseDto {
  files!: VaultFileResponseDto[];
}

export class ResetVaultResponseDto {
  deleted!: number;
}

export class PermanentDeleteResponseDto {
  deleted!: number;
}

export class GraphNodeResponseDto {
  id!: string;
  path!: string;
  kind?: 'MARKDOWN' | 'CANVAS';
  exists!: boolean;
}

export class GraphEdgeResponseDto {
  source!: string;
  target!: string;
}

export class VaultGraphResponseDto {
  nodes!: GraphNodeResponseDto[];
  edges!: GraphEdgeResponseDto[];
}

export class FileVersionAuthorResponseDto {
  id!: string;
  displayName!: string | null;
  email!: string;
}

export class FileVersionResponseDto {
  id!: string;
  version!: number;
  path!: string;
  deletedAt!: Date | null;
  attachmentId!: string | null;
  createdAt!: Date;
  createdBy!: FileVersionAuthorResponseDto;
  hasContent!: boolean;
}

export class FileVersionDetailResponseDto {
  id!: string;
  version!: number;
  path!: string;
  deletedAt!: Date | null;
  createdAt!: Date;
  createdBy!: FileVersionAuthorResponseDto;
  content!: string;
}

export class RestoreFileVersionResponseDto {
  restored!: true;
}

export class BacklinkResponseDto {
  id!: string;
  path!: string;
  excerpt!: string;
}

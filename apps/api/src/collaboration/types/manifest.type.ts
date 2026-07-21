export type ManifestEntry = {
  kind: string;
  path: string;
  deleted: boolean;
  updatedAt?: number;
  [key: string]: unknown;
};

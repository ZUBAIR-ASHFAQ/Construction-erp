export type StorageMetadata = Readonly<Record<string, string>>;

export type PutObjectInput = Readonly<{
  key: string;
  body: string | Uint8Array;
  contentType?: string;
  contentLength?: number;
  checksumSha256?: string;
  metadata?: StorageMetadata;
}>;

export type StoredObjectInfo = Readonly<{
  key: string;
  sizeBytes: number | null;
  eTag: string | null;
  checksumSha256: string | null;
  contentType: string | null;
  lastModified: Date | null;
  metadata: StorageMetadata;
}>;

export type DownloadedObject = StoredObjectInfo & Readonly<{
  body: unknown;
}>;

export type SignedUploadInput = Readonly<{
  key: string;
  contentType?: string;
  checksumSha256?: string;
  expiresInSeconds?: number;
}>;

export type SignedDownloadInput = Readonly<{
  key: string;
  expiresInSeconds?: number;
}>;

export type SignedObjectUrl = Readonly<{
  url: string;
  expiresAt: Date;
}>;

export type StorageHealth = Readonly<{
  status: 'ok' | 'error';
  checkedAt: Date;
  code?: 'STORAGE_UNAVAILABLE';
}>;

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<StoredObjectInfo>;
  headObject(key: string): Promise<StoredObjectInfo>;
  getObject(key: string): Promise<DownloadedObject>;
  deleteObject(key: string): Promise<void>;
  createSignedUploadUrl(input: SignedUploadInput): Promise<SignedObjectUrl>;
  createSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedObjectUrl>;
  checkHealth(): Promise<StorageHealth>;
  close(): void;
}

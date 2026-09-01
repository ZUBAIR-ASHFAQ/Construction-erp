import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '@construction-erp/config';
import { AppError } from '@construction-erp/errors';
import { assertStorageKey } from './key.js';
import {
  storageObjectAlreadyExists,
  storageObjectNotFound,
  storageOperationFailed,
  storageUnavailable
} from './errors.js';
import type {
  DownloadedObject,
  ObjectStorage,
  PutObjectInput,
  SignedDownloadInput,
  SignedObjectUrl,
  SignedUploadInput,
  StorageHealth,
  StorageMetadata,
  StoredObjectInfo
} from './types.js';

/** Return error status. */
function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return typeof metadata?.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined;
}

/** Map s3 error. */
function mapS3Error(error: unknown, operation: 'read' | 'write' | 'health'): Error {
  const status = errorStatus(error);
  if (status === 404 && operation === 'read') return storageObjectNotFound(error);
  if (status === 409 || status === 412) return storageObjectAlreadyExists(error);
  if (operation === 'health' || status === 429 || (status !== undefined && status >= 500)) {
    return storageUnavailable(error);
  }
  return storageOperationFailed(error);
}

/** Normalize metadata. */
function normalizeMetadata(value: Record<string, string> | undefined): StorageMetadata {
  return Object.freeze({ ...(value ?? {}) });
}

/** Validate content length. */
function assertContentLength(length: number | undefined): number | undefined {
  if (length === undefined) return undefined;
  if (!Number.isSafeInteger(length) || length < 0) throw new TypeError('contentLength must be a non-negative safe integer.');
  return length;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #maxSignedUrlTtlSeconds: number;

  /** Create a new S3ObjectStorage instance. */
  constructor(config: StorageConfig, client?: S3Client) {
    this.#bucket = config.bucket;
    this.#maxSignedUrlTtlSeconds = config.maxSignedUrlTtlSeconds;
    this.#client = client ?? new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      ...(config.accessKeyId && config.secretAccessKey
        ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
        : {})
    });
  }

  /** Return put object. */
  async putObject(input: PutObjectInput): Promise<StoredObjectInfo> {
    const key = assertStorageKey(input.key);
    try {
      const result = await this.#client.send(new PutObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        ContentLength: assertContentLength(input.contentLength),
        ChecksumSHA256: input.checksumSha256,
        Metadata: input.metadata ? { ...input.metadata } : undefined,
        // Versioned business objects must never silently overwrite a key.
        IfNoneMatch: '*'
      }));
      return Object.freeze({
        key,
        sizeBytes: input.contentLength ?? null,
        eTag: result.ETag ?? null,
        checksumSha256: result.ChecksumSHA256 ?? input.checksumSha256 ?? null,
        contentType: input.contentType ?? null,
        lastModified: null,
        metadata: Object.freeze({ ...(input.metadata ?? {}) })
      });
    } catch (error) {
      throw mapS3Error(error, 'write');
    }
  }

  /** Return head object. */
  async headObject(rawKey: string): Promise<StoredObjectInfo> {
    const key = assertStorageKey(rawKey);
    try {
      const result = await this.#client.send(new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ChecksumMode: 'ENABLED'
      }));
      return Object.freeze({
        key,
        sizeBytes: typeof result.ContentLength === 'number' ? result.ContentLength : null,
        eTag: result.ETag ?? null,
        checksumSha256: result.ChecksumSHA256 ?? null,
        contentType: result.ContentType ?? null,
        lastModified: result.LastModified ?? null,
        metadata: normalizeMetadata(result.Metadata)
      });
    } catch (error) {
      throw mapS3Error(error, 'read');
    }
  }

  /** Return object. */
  async getObject(rawKey: string): Promise<DownloadedObject> {
    const key = assertStorageKey(rawKey);
    try {
      const result = await this.#client.send(new GetObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ChecksumMode: 'ENABLED'
      }));
      if (result.Body === undefined) throw storageOperationFailed();
      return Object.freeze({
        key,
        body: result.Body,
        sizeBytes: typeof result.ContentLength === 'number' ? result.ContentLength : null,
        eTag: result.ETag ?? null,
        checksumSha256: result.ChecksumSHA256 ?? null,
        contentType: result.ContentType ?? null,
        lastModified: result.LastModified ?? null,
        metadata: normalizeMetadata(result.Metadata)
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapS3Error(error, 'read');
    }
  }

  /** Delete object. */
  async deleteObject(rawKey: string): Promise<void> {
    const key = assertStorageKey(rawKey);
    try {
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }));
    } catch (error) {
      throw mapS3Error(error, 'write');
    }
  }

  /** Create signed upload url. */
  async createSignedUploadUrl(input: SignedUploadInput): Promise<SignedObjectUrl> {
    const key = assertStorageKey(input.key);
    const expiresIn = this.#signedUrlTtl(input.expiresInSeconds);
    try {
      const url = await getSignedUrl(
        this.#client,
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          ContentType: input.contentType,
          ChecksumSHA256: input.checksumSha256,
          IfNoneMatch: '*'
        }),
        { expiresIn }
      );
      return Object.freeze({ url, expiresAt: new Date(Date.now() + expiresIn * 1000) });
    } catch (error) {
      throw mapS3Error(error, 'write');
    }
  }

  /** Create signed download url. */
  async createSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedObjectUrl> {
    const key = assertStorageKey(input.key);
    const expiresIn = this.#signedUrlTtl(input.expiresInSeconds);
    try {
      const url = await getSignedUrl(
        this.#client,
        new GetObjectCommand({ Bucket: this.#bucket, Key: key }),
        { expiresIn }
      );
      return Object.freeze({ url, expiresAt: new Date(Date.now() + expiresIn * 1000) });
    } catch (error) {
      throw mapS3Error(error, 'read');
    }
  }

  /** Check health. */
  async checkHealth(): Promise<StorageHealth> {
    const checkedAt = new Date();
    try {
      await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
      return Object.freeze({ status: 'ok', checkedAt });
    } catch {
      // Health diagnostics intentionally expose no provider exception details.
      return Object.freeze({ status: 'error', checkedAt, code: 'STORAGE_UNAVAILABLE' });
    }
  }

  /** Return close. */
  close(): void {
    this.#client.destroy();
  }

  #signedUrlTtl(requested: number | undefined): number {
    const ttl = requested ?? this.#maxSignedUrlTtlSeconds;
    if (!Number.isInteger(ttl) || ttl < 30 || ttl > this.#maxSignedUrlTtlSeconds) {
      throw new TypeError(`Signed URL expiry must be between 30 and ${this.#maxSignedUrlTtlSeconds} seconds.`);
    }
    return ttl;
  }
}

/** Create s3 object storage. */
export function createS3ObjectStorage(config: StorageConfig): ObjectStorage {
  return new S3ObjectStorage(config);
}

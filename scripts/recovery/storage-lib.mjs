import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';

/** Load s3 settings. */
export function loadS3Settings(env = process.env, { target = false } = {}) {
  const prefix = target ? 'RESTORE_STORAGE_' : 'STORAGE_';
  const bucket = env[`${prefix}BUCKET`]?.trim();
  if (!bucket) throw new Error(`${prefix}BUCKET is required.`);
  const endpoint = env[`${prefix}ENDPOINT`]?.trim() || env.STORAGE_ENDPOINT?.trim();
  const region = env[`${prefix}REGION`]?.trim() || env.STORAGE_REGION?.trim() || 'us-east-1';
  const accessKeyId = env[`${prefix}ACCESS_KEY_ID`]?.trim() || env.STORAGE_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env[`${prefix}SECRET_ACCESS_KEY`]?.trim() || env.STORAGE_SECRET_ACCESS_KEY?.trim();
  const forcePathStyleRaw = env[`${prefix}FORCE_PATH_STYLE`] ?? env.STORAGE_FORCE_PATH_STYLE;
  const forcePathStyle = forcePathStyleRaw === undefined ? Boolean(endpoint) : forcePathStyleRaw === 'true';
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) throw new Error('S3 recovery credentials must be supplied as a pair.');
  return Object.freeze({ bucket, endpoint, region, accessKeyId, secretAccessKey, forcePathStyle });
}

/** Create s3 client. */
export function createS3Client(settings) {
  return new S3Client({
    region: settings.region,
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    forcePathStyle: settings.forcePathStyle,
    ...(settings.accessKeyId && settings.secretAccessKey
      ? { credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey } }
      : {})
  });
}

/** Return object backup file name. */
export function objectBackupFileName(key) {
  return `${createHash('sha256').update(key).digest('hex')}.bin`;
}

/** Return stream body to file. */
export async function streamBodyToFile(body, filePath) {
  if (!body) throw new Error('Object-storage response body was empty.');
  const hash = createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(body, meter, createWriteStream(filePath, { mode: 0o600 }));
  return { sizeBytes: size, sha256: hash.digest('hex') };
}

/** Return sha256 and size. */
export async function sha256AndSize(filePath) {
  const hash = createHash('sha256');
  let size = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  await pipeline(createReadStream(filePath), meter, new Transform({ transform(_chunk, _encoding, callback) { callback(); } }));
  return { sizeBytes: size, sha256: hash.digest('hex') };
}

/** Validate local object. */
export async function assertLocalObject(filePath, expected) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size !== expected.sizeBytes) throw new Error(`Object backup size mismatch: ${expected.key}`);
  const actual = await sha256AndSize(filePath);
  if (actual.sha256 !== expected.sha256) throw new Error(`Object backup checksum mismatch: ${expected.key}`);
}

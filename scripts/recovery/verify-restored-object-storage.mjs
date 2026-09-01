import path from 'node:path';
import process from 'node:process';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { readJson, safeBackupDirectory } from './lib.mjs';
import { createS3Client, loadS3Settings } from './storage-lib.mjs';

/** Check whether h body. */
async function hashBody(body) {
  if (!body) throw new Error('Restored object body is empty.');
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of body) { size += chunk.length; hash.update(chunk); }
  return { sizeBytes: size, sha256: hash.digest('hex') };
}
const directory = safeBackupDirectory(process.env.RECOVERY_STORAGE_BACKUP_DIR ?? process.argv[2] ?? '');
const manifest = await readJson(path.join(directory, 'manifest.json'));
const target = loadS3Settings(process.env, { target: true });
const client = createS3Client(target);
try {
  for (const object of manifest.objects) {
    const result = await client.send(new GetObjectCommand({ Bucket: target.bucket, Key: object.key }));
    const actual = await hashBody(result.Body);
    if (actual.sizeBytes !== object.sizeBytes || actual.sha256 !== object.sha256) {
      throw new Error(`Restored object verification failed: ${object.key}`);
    }
  }
} finally { client.destroy(); }
console.log(`Restored object-storage content verified: ${manifest.objects.length} object(s).`);

import path from 'node:path';
import process from 'node:process';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ensureDirectory, safeBackupDirectory, utcStamp, writeJson } from './lib.mjs';
import { createS3Client, loadS3Settings, objectBackupFileName, streamBodyToFile } from './storage-lib.mjs';

const root = safeBackupDirectory(process.env.RECOVERY_BACKUP_DIR ?? path.resolve('backups'));
const backupId = process.env.RECOVERY_BACKUP_ID?.trim() || utcStamp();
const directory = path.join(root, backupId, 'object-storage');
const objectsDir = path.join(directory, 'objects');
await ensureDirectory(objectsDir);
const settings = loadS3Settings();
const client = createS3Client(settings);
const objects = [];
let token;
try {
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: settings.bucket, ContinuationToken: token }));
    for (const summary of page.Contents ?? []) {
      if (!summary.Key) continue;
      const file = objectBackupFileName(summary.Key);
      const result = await client.send(new GetObjectCommand({ Bucket: settings.bucket, Key: summary.Key }));
      const measured = await streamBodyToFile(result.Body, path.join(objectsDir, file));
      objects.push({
        key: summary.Key,
        file: `objects/${file}`,
        sizeBytes: measured.sizeBytes,
        sha256: measured.sha256,
        eTag: result.ETag ?? null,
        contentType: result.ContentType ?? null,
        metadata: result.Metadata ?? {}
      });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
} finally {
  client.destroy();
}
objects.sort((a, b) => a.key.localeCompare(b.key));
await writeJson(path.join(directory, 'manifest.json'), {
  formatVersion: 1,
  kind: 'construction-erp-object-storage-backup',
  backupId,
  createdAt: new Date().toISOString(),
  sourceBucket: settings.bucket,
  objectCount: objects.length,
  objects
});
console.log(`Object-storage backup completed: ${objects.length} object(s) in ${directory}`);

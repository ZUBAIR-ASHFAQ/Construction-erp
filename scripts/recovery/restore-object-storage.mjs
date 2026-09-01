import path from 'node:path';
import process from 'node:process';
import { createReadStream } from 'node:fs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { readJson, RESTORE_CONFIRMATION, safeBackupDirectory } from './lib.mjs';
import { assertLocalObject, createS3Client, loadS3Settings } from './storage-lib.mjs';

if (process.env.RESTORE_CONFIRM !== RESTORE_CONFIRMATION) throw new Error(`Set RESTORE_CONFIRM=${RESTORE_CONFIRMATION} before object restore.`);
const directory = safeBackupDirectory(process.env.RECOVERY_STORAGE_BACKUP_DIR ?? process.argv[2] ?? '');
const manifest = await readJson(path.join(directory, 'manifest.json'));
if (manifest.kind !== 'construction-erp-object-storage-backup' || manifest.formatVersion !== 1) throw new Error('Unsupported object-storage recovery manifest.');
const target = loadS3Settings(process.env, { target: true });
if (target.bucket === manifest.sourceBucket && process.env.RECOVERY_ALLOW_SOURCE_BUCKET_RESTORE !== '1') {
  throw new Error('Refusing to restore into the source bucket without RECOVERY_ALLOW_SOURCE_BUCKET_RESTORE=1.');
}
const client = createS3Client(target);
try {
  for (const object of manifest.objects) {
    const filePath = path.join(directory, object.file);
    await assertLocalObject(filePath, object);
    await client.send(new PutObjectCommand({
      Bucket: target.bucket,
      Key: object.key,
      Body: createReadStream(filePath),
      ContentLength: object.sizeBytes,
      ContentType: object.contentType ?? undefined,
      Metadata: object.metadata ?? undefined,
      ...(process.env.RECOVERY_ALLOW_OBJECT_OVERWRITE === '1' ? {} : { IfNoneMatch: '*' })
    }));
  }
} finally {
  client.destroy();
}
console.log(`Object-storage restore completed: ${manifest.objects.length} object(s) into ${target.bucket}.`);

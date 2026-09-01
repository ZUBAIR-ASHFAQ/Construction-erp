import path from 'node:path';
import process from 'node:process';
import { readJson, safeBackupDirectory } from './lib.mjs';
import { assertLocalObject } from './storage-lib.mjs';

const directory = safeBackupDirectory(process.env.RECOVERY_STORAGE_BACKUP_DIR ?? process.argv[2] ?? '');
const manifest = await readJson(path.join(directory, 'manifest.json'));
if (manifest.kind !== 'construction-erp-object-storage-backup' || manifest.formatVersion !== 1) throw new Error('Unsupported object-storage recovery manifest.');
if (!Array.isArray(manifest.objects) || manifest.objectCount !== manifest.objects.length) throw new Error('Object-storage manifest count is invalid.');
for (const object of manifest.objects) {
  if (!object.key || !object.file || object.file.includes('..')) throw new Error('Unsafe object-storage manifest entry.');
  await assertLocalObject(path.join(directory, object.file), object);
}
console.log(`Object-storage backup verified: ${manifest.objects.length} object(s).`);

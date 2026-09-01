import { addMissingChecksums } from './lib.mjs';

const { document, added } = await addMissingChecksums();
console.log(`Checksum manifest contains ${Object.keys(document.migrations).length} migration(s); added ${added} new lock(s).`);
console.log('Existing checksum locks are immutable. If an old migration changed, this command fails instead of accepting the edit.');

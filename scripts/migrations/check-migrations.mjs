import process from 'node:process';
import { validateMigrationInventory } from './lib.mjs';

const result = await validateMigrationInventory();

if (result.errors.length > 0) {
  console.error('Migration policy check failed:');
  for (const error of result.errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const gateCount = result.gateManifest.gates.length;
  console.log(
    `Migration policy check passed: ${result.migrationDirectories.length} migration(s) locked across ${gateCount} gate(s).`,
  );
}

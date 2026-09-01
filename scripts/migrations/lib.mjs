import { createHash } from 'node:crypto';
import { access, mkdtemp, readdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(here, '../..');
export const databaseDir = path.join(rootDir, 'packages/database');
export const prismaDir = path.join(databaseDir, 'prisma');
export const migrationsDir = path.join(prismaDir, 'migrations');
export const gateManifestPath = path.join(prismaDir, 'migration-gates.json');
export const checksumManifestPath = path.join(prismaDir, 'migration-checksums.json');

const migrationNamePattern = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Return sha256 file. */
export async function sha256File(filePath) {
  const contents = await readFile(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

/** List migration directories. */
export async function listMigrationDirectories() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Read gate manifest. */
export async function readGateManifest() {
  return JSON.parse(await readFile(gateManifestPath, 'utf8'));
}

/** Read checksum manifest. */
export async function readChecksumManifest() {
  return JSON.parse(await readFile(checksumManifestPath, 'utf8'));
}

/** Validate migration inventory. */
export async function validateMigrationInventory() {
  const migrationDirectories = await listMigrationDirectories();
  const gateManifest = await readGateManifest();
  const checksumManifest = await readChecksumManifest();
  const errors = [];

  if (gateManifest.formatVersion !== 1) {
    errors.push('migration-gates.json formatVersion must be 1.');
  }
  if (gateManifest.provider !== 'postgresql') {
    errors.push('migration-gates.json provider must be postgresql.');
  }
  if (!Array.isArray(gateManifest.gates) || gateManifest.gates.length === 0) {
    errors.push('migration-gates.json must declare at least one migration gate.');
  }
  if (checksumManifest.formatVersion !== 1 || checksumManifest.algorithm !== 'sha256') {
    errors.push('migration-checksums.json must use formatVersion 1 and sha256.');
  }

  for (const name of migrationDirectories) {
    if (!migrationNamePattern.test(name)) {
      errors.push(`Migration directory has invalid name: ${name}`);
    }
    const sqlPath = path.join(migrationsDir, name, 'migration.sql');
    try {
      await access(sqlPath);
      const sql = await readFile(sqlPath, 'utf8');
      if (!sql.trim()) {
        errors.push(`Migration SQL is empty: ${name}`);
      }
    } catch {
      errors.push(`Migration is missing migration.sql: ${name}`);
    }
  }

  const claimed = [];
  let previousStage = -1;
  for (const gate of gateManifest.gates ?? []) {
    if (!Number.isInteger(gate.stage) || gate.stage < previousStage) {
      errors.push(`Migration gate stages must be nondecreasing integers: ${gate.gate ?? '<unnamed>'}`);
    }
    previousStage = gate.stage;
    if (typeof gate.gate !== 'string' || gate.gate.trim() === '') {
      errors.push('Every migration gate must have a nonblank gate name.');
    }
    if (!Array.isArray(gate.migrations) || gate.migrations.length === 0) {
      errors.push(`Migration gate ${gate.gate ?? '<unnamed>'} must claim at least one migration.`);
      continue;
    }
    for (const migration of gate.migrations) {
      claimed.push(migration);
    }
  }

  const duplicateClaims = claimed.filter((value, index) => claimed.indexOf(value) !== index);
  for (const duplicate of new Set(duplicateClaims)) {
    errors.push(`Migration is claimed by more than one gate: ${duplicate}`);
  }

  if (JSON.stringify(claimed) !== JSON.stringify([...claimed].sort())) {
    errors.push('Migrations must be claimed in chronological directory-name order across gates.');
  }

  for (const migration of migrationDirectories) {
    if (!claimed.includes(migration)) {
      errors.push(`Migration directory is not assigned to a gate: ${migration}`);
    }
  }
  for (const migration of claimed) {
    if (!migrationDirectories.includes(migration)) {
      errors.push(`Gate manifest references a missing migration directory: ${migration}`);
    }
  }

  const checksumMap = checksumManifest.migrations ?? {};
  for (const migration of migrationDirectories) {
    const expected = checksumMap[migration];
    if (typeof expected !== 'string') {
      errors.push(`Missing locked checksum for migration: ${migration}`);
      continue;
    }
    const actual = await sha256File(path.join(migrationsDir, migration, 'migration.sql'));
    if (actual !== expected) {
      errors.push(`Checksum mismatch for immutable migration ${migration}. Expected ${expected}, got ${actual}.`);
    }
  }
  for (const migration of Object.keys(checksumMap)) {
    if (!migrationDirectories.includes(migration)) {
      errors.push(`Checksum manifest contains a migration that no longer exists: ${migration}`);
    }
  }

  return { errors, migrationDirectories, gateManifest, checksumManifest };
}

/** Return migrations before latest gate. */
export function migrationsBeforeLatestGate(gateManifest) {
  const gates = gateManifest.gates ?? [];
  if (gates.length <= 1) return [];
  return gates.slice(0, -1).flatMap((gate) => gate.migrations);
}

/** Return migrations in latest gate. */
export function migrationsInLatestGate(gateManifest) {
  const gates = gateManifest.gates ?? [];
  return gates.length === 0 ? [] : [...gates.at(-1).migrations];
}

/** Create previous gate prisma copy. */
export async function makePreviousGatePrismaCopy(previousMigrations) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'construction-erp-prisma-'));
  const tempPrismaDir = path.join(tempRoot, 'prisma');
  await cp(prismaDir, tempPrismaDir, { recursive: true });

  const tempMigrationsDir = path.join(tempPrismaDir, 'migrations');
  const entries = await readdir(tempMigrationsDir, { withFileTypes: true });
  const keep = new Set(previousMigrations);
  for (const entry of entries) {
    if (entry.isDirectory() && !keep.has(entry.name)) {
      await rm(path.join(tempMigrationsDir, entry.name), { recursive: true, force: true });
    }
  }

  // Runtime migration verification does not need the repository policy manifests in the temp copy.
  await rm(path.join(tempPrismaDir, 'migration-gates.json'), { force: true });
  await rm(path.join(tempPrismaDir, 'migration-checksums.json'), { force: true });
  return { tempRoot, tempPrismaDir };
}

/** Return add missing checksums. */
export async function addMissingChecksums() {
  const migrations = await listMigrationDirectories();
  const existing = await readChecksumManifest();
  const map = { ...(existing.migrations ?? {}) };

  for (const lockedMigration of Object.keys(map)) {
    if (!migrations.includes(lockedMigration)) {
      throw new Error(`Refusing to remove checksum lock for missing migration: ${lockedMigration}`);
    }
  }

  let added = 0;
  for (const migration of migrations) {
    const actual = await sha256File(path.join(migrationsDir, migration, 'migration.sql'));
    if (map[migration] && map[migration] !== actual) {
      throw new Error(
        `Refusing to re-lock edited migration ${migration}. Applied/reviewed migrations are immutable; restore it and create a new forward migration.`,
      );
    }
    if (!map[migration]) {
      map[migration] = actual;
      added += 1;
    }
  }

  const document = { formatVersion: 1, algorithm: 'sha256', migrations: map };
  await writeFile(checksumManifestPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  return { document, added };
}

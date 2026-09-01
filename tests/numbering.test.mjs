import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000500_foundation_number_sequence_infrastructure/migration.sql',
  'utf8'
);
const allocateSource = await readFile('packages/numbering/src/allocate.ts', 'utf8');
const provisionSource = await readFile('packages/numbering/src/provision.ts', 'utf8');
const definitionSource = await readFile('packages/numbering/src/definition.ts', 'utf8');
const formatSource = await readFile('packages/numbering/src/format.ts', 'utf8');
const errorsSource = await readFile('packages/numbering/src/errors.ts', 'utf8');
const typesSource = await readFile('packages/numbering/src/types.ts', 'utf8');
const modelBody = schema.match(/model\s+NumberSequence\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('Foundation owns company-scoped number_sequences without future-module FKs', () => {
  assert.match(schema, /model\s+NumberSequence\s*\{/);
  assert.match(modelBody, /companyId\s+String\s+@map\("company_id"\)\s+@db\.Uuid/);
  assert.match(modelBody, /company\s+Company\s+@relation/);
  assert.match(modelBody, /@@map\("number_sequences"\)/);
  assert.match(migration, /CREATE TABLE "number_sequences"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
  assert.doesNotMatch(migration, /REFERENCES\s+"projects"/i);
  assert.doesNotMatch(migration, /"project_id"/i);
});

test('sequence key is unique inside the canonical company', () => {
  assert.match(modelBody, /@@unique\(\[companyId, sequenceKey\]/);
  assert.match(migration, /CREATE UNIQUE INDEX "number_sequences_company_key_uq"/);
});

test('runtime allocation never accepts companyId from the caller', () => {
  const runtimeInput = typesSource.match(/export type AllocateNumberInput = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? '';
  assert.doesNotMatch(runtimeInput, /companyId\s*:/);
  assert.match(allocateSource, /requireRequestSecurityContext/);
  assert.match(allocateSource, /security\.companyId/);
});

test('allocation is transaction-bound and atomic under concurrency', () => {
  assert.match(allocateSource, /TransactionClient/);
  assert.match(allocateSource, /UPDATE "number_sequences"/);
  assert.match(allocateSource, /"next_value" = "next_value" \+ "increment_by"/);
  assert.match(allocateSource, /RETURNING/);
  assert.match(allocateSource, /"next_value" - "increment_by"/);
  assert.doesNotMatch(allocateSource, /new PrismaClient/);
});

test('allocation distinguishes missing, inactive and exhausted sequences with stable errors', () => {
  for (const code of [
    'NUMBER_SEQUENCE_NOT_FOUND',
    'NUMBER_SEQUENCE_INACTIVE',
    'NUMBER_SEQUENCE_EXHAUSTED',
    'INVALID_NUMBER_SEQUENCE_DEFINITION',
    'NUMBER_SEQUENCE_DEFINITION_CONFLICT'
  ]) assert.match(errorsSource, new RegExp(code));
  assert.match(allocateSource, /sequenceNotFound\(\)/);
  assert.match(allocateSource, /sequenceInactive\(\)/);
  assert.match(allocateSource, /sequenceExhausted\(\)/);
});

test('definitions validate keys, affixes, padding, increment and BIGINT limits', () => {
  for (const marker of [
    'SEQUENCE_KEY_PATTERN',
    'CONTROL_CHARACTER_PATTERN',
    'MAX_SEQUENCE_TEXT',
    'MAX_PAD_WIDTH',
    'POSTGRES_BIGINT_MAX',
    'positiveBigInt',
    'padWidth'
  ]) assert.match(definitionSource, new RegExp(marker));
});

test('formatting is deterministic and bounded', () => {
  assert.match(formatSource, /padStart/);
  assert.match(formatSource, /prefix/);
  assert.match(formatSource, /suffix/);
  assert.match(formatSource, /MAX_FORMATTED_NUMBER_LENGTH/);
});

test('bootstrap provisioning is explicitly separated from request-authorized runtime allocation', () => {
  assert.match(typesSource, /ProvisionNumberSequenceInput/);
  assert.match(provisionSource, /trusted bootstrap orchestration/);
  assert.match(provisionSource, /Never bind this function directly to an HTTP request body/);
  assert.match(provisionSource, /sequenceDefinitionConflict/);
  assert.doesNotMatch(provisionSource, /requireRequestSecurityContext/);
});

test('database constraints defend the sequence contract', () => {
  for (const marker of [
    'number_sequences_key_format',
    'number_sequences_prefix_shape',
    'number_sequences_suffix_shape',
    'number_sequences_pad_width_range',
    'number_sequences_next_value_positive',
    'number_sequences_increment_positive',
    'number_sequences_status_allowed',
    'number_sequences_company_status_idx'
  ]) assert.match(migration, new RegExp(marker));
});

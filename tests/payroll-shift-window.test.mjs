import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const web = 'apps/web/src/features/labour-payroll';

test('attendance and Payroll persist nullable clock windows with a guarded migration', async () => {
  const [schema, migration, checksums] = await Promise.all([
    read('packages/database/prisma/schema.prisma'),
    read('packages/database/prisma/migrations/20260917000100_payroll_shift_windows/migration.sql'),
    read('packages/database/prisma/migration-checksums.json')
  ]);
  assert.match(schema, /startMinute\s+Int\?\s+@map\("start_minute"\)/);
  assert.match(schema, /endMinute\s+Int\?\s+@map\("end_minute"\)/);
  assert.match(schema, /fromMinute\s+Int\?\s+@map\("from_minute"\)/);
  assert.match(schema, /toMinute\s+Int\?\s+@map\("to_minute"\)/);
  assert.match(migration, /"start_minute" BETWEEN 0 AND 1439/);
  assert.match(migration, /"from_minute" BETWEEN 0 AND 1439/);
  const manifest = JSON.parse(checksums);
  const digest = createHash('sha256').update(migration).digest('hex');
  assert.equal(manifest.migrations['20260917000100_payroll_shift_windows'], digest);
});

test('API contract adds a Payroll clock window without breaking legacy date-only callers and supports overnight attendance shifts', async () => {
  const [schema, routes, service, repository] = await Promise.all([
    read(`${backend}/labour-payroll.schema.ts`),
    read(`${backend}/labour-payroll.routes.ts`),
    read(`${backend}/labour-payroll.service.ts`),
    read(`${backend}/labour-payroll.repository.ts`)
  ]);
  assert.match(schema, /const timeSchema = z\.string\(\)\.regex/);
  assert.match(schema, /fromTime: timeSchema\.optional\(\)/);
  assert.match(schema, /toTime: timeSchema\.optional\(\)/);
  assert.match(schema, /endTime must differ from startTime/);
  assert.match(routes, /required: \['periodStart', 'periodEnd'\]/);
  assert.match(routes, /fromTime: TIME_JSON_SCHEMA/);
  assert.match(routes, /toTime: TIME_JSON_SCHEMA/);
  assert.match(repository, /startMinute < endMinute \? \[\[startMinute, endMinute\]\] : \[\[startMinute, 1440\], \[0, endMinute\]\]/);
  assert.match(repository, /attendanceMatchesWindow\(row, fromMinute, toMinute\)/);
  assert.match(repository, /if \(fromMinute === null \|\| toMinute === null\) return true/);
  assert.match(repository, /if \(attendance\.startMinute === null \|\| attendance\.endMinute === null\) return false/);
  assert.match(repository, /attendanceMatchesWindow\(\{ startMinute, endMinute \}, run\.fromMinute, run\.toMinute\)/);
  assert.match(service, /payrollWindowClosed\(new Date\(\), locked\.periodEnd, locked\.fromMinute, locked\.toMinute, companyTimeZone\)/);
});

test('web Payroll and attendance flows send date and hour windows for daily and monthly workers', async () => {
  const [api, workspace] = await Promise.all([
    read(`${web}/api/labour-payroll-api.ts`),
    read(`${web}/components/labour-payroll-workspace.tsx`)
  ]);
  assert.match(api, /fromTime: string/);
  assert.match(api, /toTime: string/);
  assert.match(api, /startTime: string/);
  assert.match(api, /endTime: string/);
  assert.match(workspace, /From date/);
  assert.match(workspace, /To date/);
  assert.match(workspace, /From hour/);
  assert.match(workspace, /To hour/);
  assert.match(workspace, /Shift from/);
  assert.match(workspace, /Shift to/);
  assert.match(workspace, /overnight windows such as 20:00 → 05:00 are supported/);
});

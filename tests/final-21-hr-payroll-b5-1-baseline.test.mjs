import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B5.1 historical audit remains available after the B5.2 migration', () => {
  assert.equal(exists('docs/PASS-B5-1-FINAL21-HR-PAYROLL-BASELINE-AUDIT.md'), true);
  const audit = read('docs/PASS-B5-1-FINAL21-HR-PAYROLL-BASELINE-AUDIT.md');
  assert.match(audit, /non-destructive baseline/i);
  assert.match(audit, /B5\.2 - create the final Employee \+ Salary\/Compensation module/i);
  assert.match(audit, /do not delete current assignment rows/i);
  assert.match(audit, /B5\.2 must \*\*not\*\* rewrite the payroll engine yet/i);
});

test('B5.2 supersedes the B5.1 source-state freeze without deleting its audit evidence', () => {
  assert.equal(exists('apps/api/src/modules/employees/'), true);
  assert.equal(exists('apps/web/src/features/employees/'), true);
  assert.equal(exists('docs/PASS-B5-2-FINAL21-EMPLOYEE-SALARY-FOUNDATION.md'), true);
});

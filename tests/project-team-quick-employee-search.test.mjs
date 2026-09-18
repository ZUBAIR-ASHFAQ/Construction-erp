import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('Project Team assignment reuses server Employee search and keeps the selected Employee visible', () => {
  const workspace = read('apps/web/src/features/project-team/components/project-team-workspace.tsx');
  const employeeApi = read('apps/web/src/features/employees/api/employees-api.ts');
  const employeeRepository = read('apps/api/src/modules/employees/employees.repository.ts');

  assert.match(workspace, /employeeSearch\.trim\(\) \? \{ search: employeeSearch\.trim\(\) \} : \{\}/);
  assert.match(workspace, /Search active Employees by name, employee no\. or phone/);
  assert.match(workspace, /role="combobox"/);
  assert.match(workspace, /employeePickerOpen &&/);
  assert.match(workspace, /project-team-employee-options/);
  assert.match(workspace, /selectedEmployeeOption/);
  assert.match(workspace, /employeeOptions/);
  assert.doesNotMatch(workspace, /<select value=\{createForm\.watch\('employeeId'\)\}/);
  assert.match(employeeApi, /query\.set\('search', input\.search\)/);
  assert.match(employeeRepository, /name: \{ contains: search, mode: 'insensitive'/);
});

test('Employee picker keeps Add employee beside the single searchable field', () => {
  const workspace = read('apps/web/src/features/project-team/components/project-team-workspace.tsx');
  const styles = read('apps/web/src/styles.css');

  const rowStart = workspace.indexOf('className="project-team-employee-field-row"');
  const searchInput = workspace.indexOf('role="combobox"', rowStart);
  const addButton = workspace.indexOf('project-team-employee-add', rowStart);
  assert.ok(rowStart >= 0 && searchInput > rowStart && addButton > searchInput);
  assert.match(styles, /\.project-team-employee-field-row \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(styles, /\.project-team-employee-options \{[\s\S]*position: absolute;/);
});

test('Project Team quick add creates a minimal Employee and auto-selects it for assignment', () => {
  const workspace = read('apps/web/src/features/project-team/components/project-team-workspace.tsx');
  const employeeHooks = read('apps/web/src/features/employees/hooks/employees.ts');
  const employeeService = read('apps/api/src/modules/employees/employees.service.ts');

  assert.match(workspace, /useCreateEmployee\(\)/);
  assert.match(workspace, /<label>Name<input autoFocus/);
  assert.match(workspace, /<label>Phone<input inputMode="tel"/);
  assert.match(workspace, /jobTitle: projectRole \|\| 'Employee'/);
  assert.match(workspace, /joiningDate: assignmentStart \|\| localToday\(\)/);
  assert.match(workspace, /createForm\.setValue\('employeeId', employee\.id/);
  assert.match(workspace, /Create & select Employee/);
  assert.match(employeeHooks, /invalidateQueries\(\{ queryKey: EMPLOYEES_QUERY_KEY \}\)/);
  assert.match(employeeService, /allocateCompanyNumber\(tx, \{ sequenceKey: EMPLOYEE_SEQUENCE_KEY \}\)/);
});

test('Project Team quick add remains permission-gated and does not create a parallel backend route', () => {
  const workspace = read('apps/web/src/features/project-team/components/project-team-workspace.tsx');
  const teamSchema = read('apps/api/src/modules/project-team/project-team.schema.ts');

  assert.match(workspace, /usePermission\('employees\.create'\)/);
  assert.match(workspace, /canCreateEmployees &&/);
  assert.doesNotMatch(teamSchema, /quick.?employee/i);
});

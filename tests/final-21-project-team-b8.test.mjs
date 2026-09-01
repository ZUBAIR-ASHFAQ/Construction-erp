import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/project-team';
const web = 'apps/web/src/features/project-team';
const migrationPath = 'packages/database/prisma/migrations/20260829001200_final21_project_team_assignment/migration.sql';

/** Confirm the exact small backend module and runtime registration exist. */
test('B8 creates the final five-file Project Team backend and registers it after Project Stages', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'index.ts',
    'project-team.repository.ts',
    'project-team.routes.ts',
    'project-team.schema.ts',
    'project-team.service.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.match(app, /registerProjectTeamRoutes/);
  assert.ok(app.indexOf('registerProjectStagesRoutes') < app.indexOf('registerProjectTeamRoutes'));
});

/** Confirm final assignment persistence replaces both legacy assignment owners. */
test('B8 owns Employee Project Stage assignment in the final two tables and retires legacy models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model ProjectTeamAssignment[\s\S]*@@map\("project_team_assignments"\)/);
  assert.match(prisma, /model ProjectTeamHistory[\s\S]*@@map\("project_team_history"\)/);
  assert.match(prisma, /employee\s+Employee\s+@relation\(fields: \[employeeId, companyId\], references: \[id, companyId\]/);
  assert.match(prisma, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(prisma, /stage\s+ProjectStage\?/);
  assert.doesNotMatch(prisma, /model (ProjectMember|WorkforceAssignment) \{/);
});

/** Confirm the forward migration preserves useful legacy data before deleting old owners. */
test('B8 migrates legacy Workforce and resolvable ProjectMember data before dropping the old tables', () => {
  const migration = read(migrationPath);
  assert.match(migration, /FROM "workforce_assignments" wa/);
  assert.match(migration, /FROM "project_members" pm/);
  assert.match(migration, /employee\."user_id" = pm\."user_id"/);
  assert.ok(migration.indexOf('FROM "workforce_assignments" wa') < migration.indexOf('DROP TABLE "workforce_assignments"'));
  assert.ok(migration.indexOf('FROM "project_members" pm') < migration.indexOf('DROP TABLE "project_members"'));
});

/** Confirm Company Project Employee and Stage integrity are enforced in persistence. */
test('B8 migration enforces Company Project Employee Stage and date/allocation integrity', () => {
  const migration = read(migrationPath);
  assert.match(migration, /FOREIGN KEY \("project_id", "company_id"\) REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /FOREIGN KEY \("employee_id", "company_id"\) REFERENCES "employees"\("id", "company_id"\)/);
  assert.match(migration, /"allocation_percent" > 0 AND "allocation_percent" <= 100/);
  assert.match(migration, /"to_date" IS NULL OR "to_date" >= "from_date"/);
  assert.match(migration, /final21_validate_project_team_stage_scope/);
});

/** Confirm the public API has only the four required Project Team operations. */
test('B8 exposes the exact Final Module 8 route surface without generic delete CRUD', () => {
  const schema = read(`${backend}/project-team.schema.ts`);
  for (const route of [
    "GET', route: '/api/v1/projects/:projectId/team'",
    "POST', route: '/api/v1/projects/:projectId/team'",
    "PATCH', route: '/api/v1/projects/:projectId/team/:assignmentId'",
    "POST', route: '/api/v1/projects/:projectId/team/:assignmentId/end'"
  ]) assert.ok(schema.includes(route), `missing ${route}`);
  assert.doesNotMatch(schema, /method: 'DELETE'/);
  assert.equal(existsSync(new URL('../apps/api/src/modules/workforce-timesheets', import.meta.url)), false);
  const labourRoutes = read('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts');
  assert.doesNotMatch(labourRoutes, /\/api\/v1\/workforce\/assignments/);
});

/** Confirm stable permission error and event vocabulary matches the controlling contract. */
test('B8 uses final Project Team permissions errors and lifecycle events', () => {
  const schema = read(`${backend}/project-team.schema.ts`);
  for (const value of ['project_team.read', 'project_team.manage']) assert.ok(schema.includes(`'${value}'`));
  for (const value of ['ASSIGNMENT_NOT_FOUND', 'EMPLOYEE_NOT_ASSIGNABLE', 'ALLOCATION_EXCEEDED', 'STAGE_ASSIGNMENT_INVALID']) assert.ok(schema.includes(`'${value}'`));
  for (const value of ['project_team.assigned', 'project_team.updated', 'project_team.assignment_ended']) assert.ok(schema.includes(`'${value}'`));
});

/** Confirm service invariants are scoped, idempotent and traceable. */
test('B8 service validates active Employees Stage scope allocation and writes audit outbox history', () => {
  const service = read(`${backend}/project-team.service.ts`);
  const repository = read(`${backend}/project-team.repository.ts`);
  assert.match(service, /employee\.status !== 'ACTIVE'/);
  assert.match(service, /requireStage/);
  assert.match(service, /requireAllocationAvailable/);
  assert.match(service, /ALLOCATION_EXCEEDED/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /FOR UPDATE/);
});

/** Confirm ending and editing preserve ownership/history rather than deleting records. */
test('B8 separates Project role from RBAC and preserves assignment history on update and end', () => {
  const schema = read(`${backend}/project-team.schema.ts`);
  const service = read(`${backend}/project-team.service.ts`);
  const repository = read(`${backend}/project-team.repository.ts`);
  assert.match(schema, /projectRole: roleSchema/);
  assert.doesNotMatch(schema, /roleId|permissionId/);
  const updateSchema = schema.match(/updateProjectTeamAssignmentBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict/)?.[0] ?? '';
  assert.doesNotMatch(updateSchema, /employeeId|projectId/);
  assert.match(service, /createHistory\(assignmentId, 'UPDATED'/);
  assert.match(service, /createHistory\(assignmentId, 'ENDED'/);
  assert.match(service, /status: ASSIGNMENT_ENDED/);
  assert.doesNotMatch(repository, /projectTeamAssignment\.delete/);
});

/** Confirm the final Attendance module consumes Module 8 rather than owning Workforce assignments. */
test('B8 handoff remains valid after B14 replaces transitional Timesheets with Attendance', () => {
  const repository = read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts');
  const service = read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
  assert.match(repository, /projectTeamAssignment/);
  assert.match(service, /findActiveAssignment/);
  assert.doesNotMatch(repository, /workforceAssignment/);
  assert.equal(existsSync(new URL('../apps/api/src/modules/workforce-timesheets', import.meta.url)), false);
});

/** Confirm the required React feature is present and uses the requested state/form tools. */
test('B8 adds Project Team React API hooks workspace and page with assignment edit/end controls', () => {
  for (const file of ['api/project-team-api.ts', 'hooks/project-team.ts', 'components/project-team-workspace.tsx', 'pages/project-team-page.tsx']) {
    assert.equal(existsSync(new URL(`../${web}/${file}`, import.meta.url)), true, `${file} must exist`);
  }
  const hooks = read(`${web}/hooks/project-team.ts`);
  const workspace = read(`${web}/components/project-team-workspace.tsx`);
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(hooks, /@tanstack\/react-query/);
  assert.match(workspace, /react-hook-form/);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /Project role/);
  assert.match(workspace, /Allocation/);
  assert.match(workspace, /Stage UUID/);
  assert.match(workspace, /From date/);
  assert.match(workspace, />Edit<|>Edit<\/button>/);
  assert.match(workspace, />End<|>End<\/button>/);
  assert.match(shell, /Project Team \/ Assignment/);
});

/** Confirm B8 retires the old Workforce permission vocabulary after mapping grants forward. */
test('B8 migrates legacy Workforce permission grants to Project Team and removes old codes from persistence', () => {
  const migration = read(migrationPath);
  const administrationSchema = read('apps/api/src/modules/administration/administration.schema.ts');
  assert.match(migration, /'workforce\.read', 'project_team\.read'/);
  assert.match(migration, /'workforce\.assign', 'project_team\.manage'/);
  assert.match(migration, /DELETE FROM "permissions" WHERE "code" IN \('workforce\.read', 'workforce\.assign'\)/);
  assert.doesNotMatch(administrationSchema, /workforce\.read|workforce\.assign|REMOVED_FINAL_21_PERMISSION_CODES/);
});

/** Confirm every named function or class method added in B8 has a nearby purpose comment. */
test('B8 keeps new code junior-readable with short purpose comments', () => {
  const paths = [
    `${backend}/project-team.schema.ts`,
    `${backend}/project-team.repository.ts`,
    `${backend}/project-team.service.ts`,
    `${backend}/project-team.routes.ts`,
    `${web}/api/project-team-api.ts`,
    `${web}/hooks/project-team.ts`,
    `${web}/components/project-team-workspace.tsx`,
    `${web}/pages/project-team-page.tsx`
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});

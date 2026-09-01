import { access, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';

const MODE = process.argv.includes('--mode=static') ? 'static' : 'full';
const MIGRATION_CONFIRM = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';

/** Run one repository command and stop the baseline when it fails. */
function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code}`}.`));
    });
  });
}

/** Return true when a file exists at the repository root. */
async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Verify an existing npm lockfile matches the root workspace manifest. */
async function verifyLockfile() {
  if (!(await fileExists('package-lock.json'))) {
    throw new Error('package-lock.json is missing. Generate it with npm run module-24a:lockfile on a machine with npm registry access.');
  }

  const [manifest, lockfile] = await Promise.all([
    readFile('package.json', 'utf8').then(JSON.parse),
    readFile('package-lock.json', 'utf8').then(JSON.parse),
  ]);

  if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 2 || !lockfile.packages?.['']) {
    throw new Error('package-lock.json must be a modern npm lockfile with a root packages entry.');
  }

  const root = lockfile.packages[''];
  if (JSON.stringify(root.workspaces ?? []) !== JSON.stringify(manifest.workspaces ?? [])) {
    throw new Error('package-lock.json workspace declarations do not match package.json.');
  }

  for (const field of ['dependencies', 'devDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
      if (root[field]?.[name] !== spec) {
        throw new Error(`package-lock.json is out of sync for ${field}.${name}.`);
      }
    }
  }
}

/** Verify the destructive migration test uses an explicitly disposable database. */
function verifyMigrationEnvironment() {
  if (!process.env.MIGRATION_TEST_DATABASE_URL) {
    throw new Error('MIGRATION_TEST_DATABASE_URL is required for the clean-database baseline migration check.');
  }
  if (process.env.MIGRATION_TEST_CONFIRM !== MIGRATION_CONFIRM) {
    throw new Error(`Set MIGRATION_TEST_CONFIRM=${MIGRATION_CONFIRM} before running the destructive migration check.`);
  }
}

/** Run dependency-free repository checks that are safe in every environment. */
async function runStaticChecks() {
  await run('npm', ['run', 'check:workspace']);
  await run('npm', ['run', 'db:migrations:check']);
  await run('npm', ['run', 'test:static']);
}

/** Run the complete reproducible baseline after dependencies and a disposable database are available. */
async function runFullChecks() {
  if (!(await fileExists('package-lock.json'))) {
    console.log('package-lock.json is missing; generating it with the existing reviewed lockfile command.');
    await run('npm', ['run', 'module-24a:lockfile']);
  }

  await verifyLockfile();
  await run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  await run('npm', ['run', 'db:validate']);
  await run('npm', ['run', 'db:generate']);
  await run('npm', ['run', 'typecheck']);
  await run('npm', ['run', 'build']);
  await runStaticChecks();

  verifyMigrationEnvironment();
  await run('npm', ['run', 'db:migrations:verify:clean']);
}

console.log(`Running the reproducible baseline in ${MODE} mode.`);

if (MODE === 'static') {
  await runStaticChecks();
  if (await fileExists('package-lock.json')) {
    await verifyLockfile();
    console.log('Static reproducible baseline passed and package-lock.json is synchronized.');
  } else {
    console.log('Static baseline checks passed. The full reproducible baseline remains blocked until package-lock.json is generated with registry access.');
  }
} else {
  await runFullChecks();
  console.log('Reproducible baseline complete: lockfile, Prisma, TypeScript, build, static tests and clean-database migrations all passed.');
}

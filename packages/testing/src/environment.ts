const CONFIRMATION = 'RESET_CONSTRUCTION_ERP_TEST_DATABASE';
const ALLOWED_NAME_PATTERN = /(integration[_-]?test|foundation[_-]?test|erp[_-]?test|test[_-]?erp)/i;
const PROTECTED_DATABASES = new Set(['postgres', 'template0', 'template1', 'construction_erp']);

export type FoundationTestEnvironment = Readonly<{
  databaseUrl: string;
  databaseName: string;
}>;

/** Validate disposable test database url. */
export function assertDisposableTestDatabaseUrl(rawUrl: string): FoundationTestEnvironment {
  if (!rawUrl?.trim()) throw new Error('TEST_DATABASE_URL is required.');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('TEST_DATABASE_URL must use postgres:// or postgresql://.');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
  if (!databaseName || !ALLOWED_NAME_PATTERN.test(databaseName)) {
    throw new Error('Disposable test database name must clearly contain integration_test, foundation_test, erp_test, or test_erp.');
  }
  if (PROTECTED_DATABASES.has(databaseName.toLowerCase())) {
    throw new Error(`Refusing to use protected database name: ${databaseName}`);
  }

  return Object.freeze({ databaseUrl: rawUrl, databaseName });
}

/** Load foundation test environment. */
export function loadFoundationTestEnvironment(env: NodeJS.ProcessEnv = process.env): FoundationTestEnvironment {
  if (env.TEST_DATABASE_CONFIRM !== CONFIRMATION) {
    throw new Error(`Set TEST_DATABASE_CONFIRM=${CONFIRMATION} before destructive Foundation database tests.`);
  }
  return assertDisposableTestDatabaseUrl(env.TEST_DATABASE_URL ?? '');
}

export const FOUNDATION_TEST_DATABASE_CONFIRMATION = CONFIRMATION;

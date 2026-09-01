import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  createDatabaseClient,
  disconnectDatabase,
  verifyDatabaseConnection
} from '@construction-erp/database';
import { bootstrapInitialInstallation } from '@construction-erp/bootstrap';

const CONFIRMATION = 'PROVISION_CONSTRUCTION_ERP_INITIAL_COMPANY';

/** Return input path. */
function inputPath() {
  const arg = process.argv.find((value) => value.startsWith('--input='));
  const separateIndex = process.argv.indexOf('--input');
  const value =
    arg?.slice('--input='.length) ??
    (separateIndex >= 0 ? process.argv[separateIndex + 1] : undefined) ??
    process.env.INITIAL_BOOTSTRAP_INPUT_FILE;

  if (!value) {
    throw new Error(
      'Provide --input <json-file> (or INITIAL_BOOTSTRAP_INPUT_FILE) for the reviewed initial bootstrap document.'
    );
  }
  return path.resolve(process.cwd(), value);
}

/** Return identity provisioner. */
async function identityProvisioner() {
  const administratorPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!administratorPassword) return undefined;

  // Keep the secret out of the persisted bootstrap document. The compiled API
  // module captures it only for this controlled bootstrap execution.
  const { createAdministrationBootstrapIdentityProvisioner } = await import(
    '../../apps/api/dist/modules/administration/administration.service.js'
  );

  delete process.env.INITIAL_ADMIN_PASSWORD;
  return createAdministrationBootstrapIdentityProvisioner(administratorPassword);
}

if (process.env.INITIAL_BOOTSTRAP_CONFIRM !== CONFIRMATION) {
  throw new Error(
    `Set INITIAL_BOOTSTRAP_CONFIRM=${CONFIRMATION} to acknowledge that this command creates the authoritative initial company.`
  );
}

const filePath = inputPath();
const raw = JSON.parse(await readFile(filePath, 'utf8'));
const provisionIdentity = await identityProvisioner();

const client = createDatabaseClient();
try {
  await verifyDatabaseConnection(client);
  const result = await bootstrapInitialInstallation(client, raw, provisionIdentity);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.status === 'IDENTITY_PENDING') {
    process.stderr.write(
      'Foundation provisioning is durable and identity is pending Administration. Set INITIAL_ADMIN_PASSWORD and re-run the same bootstrap input to complete the administrator/system roles.\n'
    );
  }
} finally {
  await disconnectDatabase(client);
}

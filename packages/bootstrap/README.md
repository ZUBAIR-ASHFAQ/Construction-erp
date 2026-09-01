# `@construction-erp/bootstrap`

Foundation Pass 17 implements the controlled initial-provisioning orchestration required before business modules are generated.

## Ownership boundary

Foundation owns the orchestration, company master, non-secret required configuration, and number-sequence provisioning.

Administration still owns:

- users;
- credentials/sessions;
- roles;
- permissions;
- role assignments.

Therefore Foundation does **not** create fake Administration tables in Stage 0. Instead the bootstrap can operate in either mode:

1. **Foundation-only mode** — atomically creates the company/configuration/sequences and persists `IDENTITY_PENDING`.
2. **Identity-enabled mode** — once Administration supplies a `BootstrapIdentityProvisioner`, the same orchestration also creates/reconciles the system administrator and system roles and records `COMPLETED`.

A fresh deployment with Administration available can complete everything in one transaction. A Stage-0 deployment can safely resume the same run after Stage 1.

## Safety properties

- global PostgreSQL transaction advisory lock prevents concurrent initial bootstrap races;
- a stable SHA-256 fingerprint makes retries idempotent;
- reuse of the same bootstrap key with different input fails with `INITIAL_BOOTSTRAP_KEY_REUSED`;
- bootstrap never accepts a caller-provided `companyId`;
- company configuration is explicitly non-secret and rejects secret-bearing keys;
- administrator passwords/tokens/MFA secrets are never persisted in Foundation bootstrap state;
- identity adapter output must prove one administrator UUID plus one UUID for every requested system-role code;
- no Administration foreign keys are introduced before Administration exists.

## Example bootstrap JSON

```json
{
  "bootstrapKey": "initial",
  "company": {
    "legalName": "Example Construction LLC",
    "displayName": "Example Construction",
    "status": "ACTIVE",
    "baseCurrency": "USD",
    "timeZone": "Asia/Dubai",
    "locale": "en-AE",
    "fiscalSettings": {
      "fiscalYearStartMonth": 1
    }
  },
  "configuration": {
    "environmentLabel": "production"
  },
  "numberSequences": [
    {
      "sequenceKey": "foundation.bootstrap",
      "prefix": "BOOT-",
      "padWidth": 6,
      "nextValue": "1",
      "incrementBy": "1",
      "status": "ACTIVE"
    }
  ],
  "identity": {
    "administrator": {
      "email": "admin@example.com",
      "name": "System Administrator",
      "roleCodes": ["system-admin"]
    },
    "systemRoles": [
      {
        "code": "system-admin",
        "name": "System Administrator"
      }
    ]
  }
}
```

The role/sequence names above are only an example. The ERP requirements do not prescribe the exact system-role codes or business sequence keys at Foundation, so reviewed deployment input must define them.

## CLI

After dependencies are installed and Prisma has been generated:

```bash
pnpm bootstrap:initial -- --input ./bootstrap.initial.json
```

At Pass 17, the CLI executes Foundation-only mode and will normally report `IDENTITY_PENDING`. Administration will provide the identity adapter needed to resume/complete the same bootstrap run.

Do not put passwords, tokens, access keys, database URLs, or other secrets in the bootstrap JSON.

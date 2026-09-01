# Stage 0 — Pass 0.3 Environment Baseline

Captured before the final 21-module refactor. This pass records the available toolchain only; no runtime version, dependency, schema, API, UI, or business code was changed.

## Project requirements

- `.nvmrc`: `22`
- `package.json` Node engine: `>=20`

## Actual environment

- Node.js: `v22.16.0`
- npm: `10.9.2`
- Git: `2.47.3`
- Docker CLI: **not installed / not available in this execution environment**
- Docker Compose: **not available because Docker CLI is unavailable**

## Compatibility result

- Node.js matches `.nvmrc` major version `22`: **PASS**
- Node.js satisfies `package.json` engine `>=20`: **PASS**
- npm is available: **PASS**
- Git is available: **PASS**
- Docker/Docker Compose availability: **UNAVAILABLE IN CURRENT EXECUTION ENVIRONMENT**

## Pass rule

No tool/runtime versions were installed, upgraded, downgraded, or otherwise changed during this pass.

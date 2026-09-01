# Pass 392 — Module 19 Submittal HTTP Routes and Backend Registration

Pass 392 builds on the exact Pass-391 archive and exposes only the four source-approved Submittal HTTP operations. It completes the five-file `rfi-submittals` backend folder reached by the Submittal work so far and registers that module with the shared Fastify application.

## Public Submittal operations

- `GET /api/v1/projects/:projectId/submittals`
- `POST /api/v1/projects/:projectId/submittals`
- `POST /api/v1/submittals/:id/submit`
- `POST /api/v1/submittals/:id/reviews`

No RFI route is pulled forward by this pass.

## Boundary behavior

Every route authenticates before entering the service. Params, query and body values are parsed through the existing strict Zod schemas. All write commands require a 1–200 character `Idempotency-Key`, then rely on the Pass-391 service for project scope, permission, user/document validation, serialization, audit and outbox behavior.

Pass 392 adds response Zod schemas so Fastify route output and the service response shape remain aligned. OpenAPI schemas expose only browser-safe Submittal, revision and review fields.

## Registration and structure

The backend module now contains exactly:

```text
apps/api/src/modules/rfi-submittals/
├── rfi-submittals.schema.ts
├── rfi-submittals.repository.ts
├── rfi-submittals.service.ts
├── rfi-submittals.routes.ts
└── index.ts
```

`apps/api/src/app.ts` registers `registerRfiSubmittalsRoutes` when the shared database is available. No extra helper, manager, controller, repository or service file is introduced.

## Deferred work

RFI persistence/service/routes, full Module-19 backend integration verification and React work remain deferred. Pass 392 adds no table, Prisma model or migration.

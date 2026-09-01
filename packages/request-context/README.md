# @construction-erp/request-context

Foundation Pass 06 request-scoped infrastructure.

It provides:

- a server-generated `requestId` for every API request;
- a bounded/sanitized `correlationId` for tracing only;
- `AsyncLocalStorage` propagation across service/repository calls;
- a trusted security-context slot that cannot be rebound during the same request;
- helpers for later company/actor/permission enforcement;
- a project-scope contract whose initial state can remain `not-resolved` until Administration Project-scope handling.

## Security boundary

`RequestSecurityContext` is **not** populated from request body/query/header ownership fields. Administration will bind authenticated user/company/permissions after validating the session. Administration Project-scope handling will later activate project-scope resolution after Project Management exists.

Client correlation headers are telemetry only and never become authorization or tenant scope.

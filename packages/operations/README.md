# @construction-erp/operations

Foundation Pass 19 provides production-safe operations and observability primitives.

## Surfaces

- liveness: process-only `/health` report; it does not fail because a dependency is briefly unavailable;
- readiness: bounded PostgreSQL + object-storage checks; dependency details contain stable status/codes only;
- HTTP metrics: route-template/method/status-class counters and duration sums; no tenant, user, request ID, raw URL or query labels;
- queue/outbox diagnostics: aggregate state counts, due work and stale leases without reading business payloads;
- Prometheus text rendering for HTTP/process/async-infrastructure gauges.

The API always exposes `/health` and `/readiness`. Metrics and queue/outbox diagnostic routes are controlled by server configuration and default to disabled in production until deliberately exposed behind the deployment's private monitoring boundary.

No database model is owned by this package. It observes existing Foundation infrastructure only.

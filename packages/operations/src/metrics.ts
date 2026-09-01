import type { HttpMetricObservation } from './types.js';

type MetricBucket = {
  count: number;
  durationMsSum: number;
};

const METHOD_PATTERN = /^[A-Z]{1,16}$/;
const MAX_ROUTE_LENGTH = 240;

/** Normalize method. */
function normalizeMethod(value: string): string {
  const method = value.trim().toUpperCase();
  return METHOD_PATTERN.test(method) ? method : 'OTHER';
}

/** Normalize route. */
function normalizeRoute(value: string): string {
  const route = value.trim();
  if (!route || route.length > MAX_ROUTE_LENGTH || /[\r\n\0]/.test(route)) return 'unknown';
  return route;
}

/** Return status class. */
function statusClass(statusCode: number): string {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) return 'other';
  return `${Math.floor(statusCode / 100)}xx`;
}

/** Return finite duration. */
function finiteDuration(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Return escape label. */
function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}

/** Return labels. */
function labels(method: string, route: string, status: string): string {
  return `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_class="${escapeLabel(status)}"`;
}

/**
 * Low-cardinality, in-process HTTP metrics. The registry deliberately accepts
 * route templates rather than raw URLs and has no company/user/request labels.
 */
export class HttpMetricsRegistry {
  readonly #buckets = new Map<string, MetricBucket>();

  /** Return record. */
  record(input: HttpMetricObservation): void {
    const method = normalizeMethod(input.method);
    const route = normalizeRoute(input.route);
    const responseClass = statusClass(input.statusCode);
    const key = JSON.stringify([method, route, responseClass]);
    const bucket = this.#buckets.get(key) ?? { count: 0, durationMsSum: 0 };
    bucket.count += 1;
    bucket.durationMsSum += finiteDuration(input.durationMs);
    this.#buckets.set(key, bucket);
  }

  /** Return render prometheus. */
  renderPrometheus(): string {
    const lines = [
      '# HELP construction_erp_http_requests_total Total HTTP responses by method, route template and status class.',
      '# TYPE construction_erp_http_requests_total counter',
      '# HELP construction_erp_http_request_duration_seconds_sum Sum of HTTP response durations.',
      '# TYPE construction_erp_http_request_duration_seconds_sum counter',
      '# HELP construction_erp_http_request_duration_seconds_count Count of HTTP response durations.',
      '# TYPE construction_erp_http_request_duration_seconds_count counter'
    ];

    for (const [key, bucket] of [...this.#buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const parsed = JSON.parse(key) as [string, string, string];
      const metricLabels = labels(parsed[0], parsed[1], parsed[2]);
      lines.push(`construction_erp_http_requests_total{${metricLabels}} ${bucket.count}`);
      lines.push(`construction_erp_http_request_duration_seconds_sum{${metricLabels}} ${(bucket.durationMsSum / 1000).toFixed(6)}`);
      lines.push(`construction_erp_http_request_duration_seconds_count{${metricLabels}} ${bucket.count}`);
    }

    lines.push('# HELP construction_erp_process_uptime_seconds Process uptime in seconds.');
    lines.push('# TYPE construction_erp_process_uptime_seconds gauge');
    lines.push(`construction_erp_process_uptime_seconds ${process.uptime().toFixed(3)}`);
    lines.push('# HELP construction_erp_process_resident_memory_bytes Process resident memory in bytes.');
    lines.push('# TYPE construction_erp_process_resident_memory_bytes gauge');
    lines.push(`construction_erp_process_resident_memory_bytes ${process.memoryUsage().rss}`);
    lines.push('# HELP construction_erp_nodejs_heap_used_bytes V8 heap currently used in bytes.');
    lines.push('# TYPE construction_erp_nodejs_heap_used_bytes gauge');
    lines.push(`construction_erp_nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`);

    return `${lines.join('\n')}\n`;
  }
}

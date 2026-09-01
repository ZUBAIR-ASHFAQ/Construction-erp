import type { OutboxDiagnostics } from '@construction-erp/outbox';
import type { QueueDiagnostics } from '@construction-erp/queue';

export type DependencyStatus = 'ok' | 'error' | 'not-configured';

export type DependencyHealth = Readonly<{
  status: DependencyStatus;
  latencyMs: number;
  code?: 'DATABASE_UNAVAILABLE' | 'STORAGE_UNAVAILABLE' | 'DEPENDENCY_TIMEOUT' | 'DEPENDENCY_NOT_CONFIGURED';
}>;

export type LivenessReport = Readonly<{
  status: 'ok';
  service: string;
  checkedAt: string;
  uptimeSeconds: number;
}>;

export type ReadinessReport = Readonly<{
  status: 'ready' | 'not-ready';
  service: string;
  checkedAt: string;
  dependencies: Readonly<{
    database: DependencyHealth;
    storage: DependencyHealth;
  }>;
}>;

export type HttpMetricObservation = Readonly<{
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
}>;

export type OperationalDiagnostics = Readonly<{
  generatedAt: string;
  queue: QueueDiagnostics;
  outbox: OutboxDiagnostics;
}>;

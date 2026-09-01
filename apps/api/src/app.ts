import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import { APP_NAME } from '@construction-erp/shared';
import type { LogLevel, NodeEnvironment, OperationsConfig } from '@construction-erp/config';
import type { DatabaseClient } from '@construction-erp/database';
import type { ObjectStorage } from '@construction-erp/storage';
import { createRequestId } from '@construction-erp/request-context';
import { createStructuredLoggerOptions } from '@construction-erp/logging';
import { registerDatabase } from './plugins/database.js';
import { registerRequestContext } from './plugins/request-context.js';
import { registerStructuredRequestLogging } from './plugins/logging.js';
import { registerErrorHandling } from './plugins/errors.js';
import { registerObjectStorage } from './plugins/storage.js';
import { registerOperations } from './plugins/operations.js';
import { registerAdministrationRoutes } from './modules/administration/index.js';
import { registerDocumentsRoutes, type DocumentsUploadPolicy } from './modules/documents-audit/index.js';
import { registerClientsRoutes } from './modules/clients/index.js';
import { registerProjectsRoutes } from './modules/projects/index.js';
import { registerProjectStagesRoutes } from './modules/project-stages/index.js';
import { registerProjectTeamRoutes } from './modules/project-team/index.js';
import { registerFinanceRoutes } from './modules/finance/index.js';
import { registerBudgetsJobCostRoutes } from './modules/budgets-job-cost/index.js';
import { registerProcurementRoutes } from './modules/procurement/index.js';
import { registerInventoryRoutes } from './modules/inventory/index.js';
import { registerVendorsSubcontractorsRoutes } from './modules/vendors-subcontractors/index.js';
import { registerEquipmentRoutes } from './modules/equipment/index.js';
import { registerEmployeesRoutes } from './modules/employees/index.js';
import { registerLabourPayrollRoutes } from './modules/labour-payroll/index.js';
import { registerSiteExpensesRoutes } from './modules/site-expenses/index.js';
import { registerSupplierPayablesRoutes } from './modules/supplier-payables/index.js';
import { registerClientBillingRoutes } from './modules/client-billing/index.js';
import { registerClientReceiptsRoutes } from './modules/client-receipts/index.js';
import { registerProjectProfitabilityRoutes } from './modules/project-profitability/index.js';
import { registerReportsRoutes } from './modules/reports/index.js';
import { registerDashboardRoutes } from './modules/dashboard/index.js';

export type BuildAppOptions = Readonly<{
  appName?: string;
  nodeEnv?: NodeEnvironment;
  logLevel?: LogLevel;
  database?: DatabaseClient;
  objectStorage?: ObjectStorage;
  operations?: OperationsConfig;
  webOrigins?: readonly string[];
  authActionTokenSecret?: string;
  documentsUploadPolicy?: DocumentsUploadPolicy;
}>;

/**
 * Build the Fastify API with Foundation plugins, OpenAPI metadata, and the
 * business modules whose runtime dependencies were supplied by the caller.
 */
export function buildApp(options: BuildAppOptions = {}) {
  const service = options.appName ?? APP_NAME;
  const documentsUploadPolicy = options.documentsUploadPolicy ?? Object.freeze({
    maxSizeBytes: 50 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ],
    signedUrlTtlSeconds: 300
  });
  const authActionTokenSecret = options.authActionTokenSecret ?? 'development-only-auth-action-secret-change-me';
  const app = Fastify({
    genReqId: createRequestId,
    disableRequestLogging: true,
    logger: createStructuredLoggerOptions({
      level: options.logLevel ?? 'info',
      service,
      environment: options.nodeEnv ?? 'development'
    })
  });

  // Allow browser requests only from the configured web application origins.
  app.register(cors, {
    origin: [...(options.webOrigins ?? ['http://localhost:5173'])]
  });

  // Register Swagger before routes so every later route can be included.
  app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Construction ERP API',
        description: 'Construction ERP modular monolith API.',
        version: '0.38.0'
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'opaque-access-token'
          }
        }
      }
    }
  });

  // Request context must be established before lifecycle/error logging so every
  // record can carry the same request/correlation identifiers.
  registerRequestContext(app);
  registerStructuredRequestLogging(app);
  registerErrorHandling(app);

  if (options.database) {
    app.register(registerDatabase, { client: options.database });
    app.register(registerAdministrationRoutes, {
      database: options.database,
      authActionTokenSecret
    });
    app.register(registerClientsRoutes, { database: options.database });
    app.register(registerVendorsSubcontractorsRoutes, { database: options.database });
    app.register(registerProjectsRoutes, { database: options.database });
    app.register(registerProjectStagesRoutes, { database: options.database });
    app.register(registerProjectTeamRoutes, { database: options.database });
    app.register(registerFinanceRoutes, { database: options.database });
    app.register(registerBudgetsJobCostRoutes, { database: options.database });
    app.register(registerProcurementRoutes, { database: options.database });
    app.register(registerInventoryRoutes, { database: options.database });
    app.register(registerEquipmentRoutes, { database: options.database });
    app.register(registerEmployeesRoutes, { database: options.database });
    app.register(registerLabourPayrollRoutes, { database: options.database });
    app.register(registerSiteExpensesRoutes, { database: options.database });
    app.register(registerSupplierPayablesRoutes, { database: options.database });
    app.register(registerClientBillingRoutes, { database: options.database });
    app.register(registerClientReceiptsRoutes, { database: options.database });
    app.register(registerProjectProfitabilityRoutes, { database: options.database });
    app.register(registerDashboardRoutes, { database: options.database });
  }

  if (options.objectStorage) {
    app.register(registerObjectStorage, { storage: options.objectStorage });
  }

  if (options.database && options.objectStorage) {
    app.register(registerDocumentsRoutes, {
      database: options.database,
      objectStorage: options.objectStorage,
      uploadPolicy: documentsUploadPolicy
    });
    app.register(registerReportsRoutes, {
      database: options.database,
      objectStorage: options.objectStorage,
      signedUrlTtlSeconds: documentsUploadPolicy.signedUrlTtlSeconds
    });
  }

  registerOperations(app, {
    service,
    config: options.operations ?? Object.freeze({
      exposeDiagnostics: (options.nodeEnv ?? 'development') !== 'production',
      readinessTimeoutMs: 2000,
      staleLeaseSeconds: 300
    }),
    ...(options.database ? { database: options.database } : {}),
    ...(options.objectStorage ? { objectStorage: options.objectStorage } : {})
  });

  // Expose the generated specification without adding a Swagger UI dependency.
  app.get('/openapi.json', {
    schema: { hide: true }
  }, async () => app.swagger());

  // Return a small root health-style response for developers and local tooling.
  app.get('/', async () => ({
    service,
    component: 'api',
    status: 'ok'
  }));

  return app;
}

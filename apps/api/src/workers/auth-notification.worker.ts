import { loadServerConfig, type ServerConfig } from '@construction-erp/config';
import { createDatabaseClient, disconnectDatabase, type DatabaseClient } from '@construction-erp/database';
import { createStructuredLogger, toSafeErrorLog } from '@construction-erp/logging';
import {
  claimQueueJobs,
  completeQueueJob,
  failQueueJob,
  type ClaimedQueueJob
} from '@construction-erp/queue';
import {
  createAuthActionToken,
  type AuthActionPurpose
} from '../plugins/authentication.js';

const QUEUE_NAME = 'auth-notifications';
const INVITATION_JOB = 'auth.invitation';
const PASSWORD_RESET_JOB = 'auth.password-reset';
const POLL_INTERVAL_MS = 1_000;
const RETRY_DELAY_MS = 60_000;
const WORKER_ID = `auth-notifications-${process.pid}`;

let stopping = false;

type AuthNotificationJobPayload = Readonly<{
  userId: string;
  actionNonce: string;
}>;

/** Load validated shared server configuration for the notification worker. */
function resolveConfig(): ServerConfig {
  return loadServerConfig(process.env);
}

/** Validate the small queue payload used by authentication notification jobs. */
function readJobPayload(job: ClaimedQueueJob): AuthNotificationJobPayload {
  const payload = job.envelope.payload;
  const userId = payload.userId;
  const actionNonce = payload.actionNonce;

  if (typeof userId !== 'string' || !userId.trim()) {
    throw new Error('AUTH_NOTIFICATION_JOB_INVALID');
  }
  if (typeof actionNonce !== 'string' || !actionNonce.trim()) {
    throw new Error('AUTH_NOTIFICATION_JOB_INVALID');
  }

  return { userId, actionNonce };
}

/** Convert one supported queue job type into its stored authentication purpose. */
function purposeForJob(jobType: string): AuthActionPurpose {
  if (jobType === INVITATION_JOB) return 'INVITATION';
  if (jobType === PASSWORD_RESET_JOB) return 'PASSWORD_RESET';
  throw new Error('AUTH_NOTIFICATION_JOB_INVALID');
}

/** Build the browser URL that consumes the signed invitation or reset token. */
function actionUrl(baseUrl: string, purpose: AuthActionPurpose, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set(purpose === 'INVITATION' ? 'invite' : 'reset', token);
  return url.toString();
}

/** Send one authentication notification through the configured HTTPS webhook. */
async function deliverNotification(
  config: ServerConfig,
  job: ClaimedQueueJob,
  input: Readonly<{
    purpose: AuthActionPurpose;
    email: string;
    name: string;
    actionUrl: string;
    expiresAt: Date;
  }>
): Promise<void> {
  if (!config.authNotificationWebhookUrl) {
    throw new Error('AUTH_NOTIFICATION_WEBHOOK_NOT_CONFIGURED');
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'idempotency-key': job.envelope.jobId
  };
  if (config.authNotificationWebhookToken) {
    headers.authorization = `Bearer ${config.authNotificationWebhookToken}`;
  }

  const response = await fetch(config.authNotificationWebhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: input.purpose === 'INVITATION' ? 'AUTH_INVITATION' : 'AUTH_PASSWORD_RESET',
      recipient: { email: input.email, name: input.name },
      actionUrl: input.actionUrl,
      expiresAt: input.expiresAt.toISOString()
    })
  });

  if (!response.ok) throw new Error('AUTH_NOTIFICATION_DELIVERY_FAILED');
}

/** Deliver one claimed job when its nonce is still the current pending action. */
async function handleJob(
  database: DatabaseClient,
  config: ServerConfig,
  job: ClaimedQueueJob
): Promise<void> {
  const payload = readJobPayload(job);
  const purpose = purposeForJob(job.envelope.jobType);
  const user = await database.user.findFirst({
    where: {
      id: payload.userId,
      companyId: job.envelope.companyId
    },
    select: {
      id: true,
      email: true,
      name: true,
      authActionPurpose: true,
      authActionNonce: true,
      authActionExpiresAt: true
    }
  });

  const now = new Date();
  if (
    !user
    || user.authActionPurpose !== purpose
    || user.authActionNonce !== payload.actionNonce
    || !user.authActionExpiresAt
    || user.authActionExpiresAt <= now
  ) {
    await completeQueueJob(database, { jobId: job.envelope.jobId, workerId: WORKER_ID });
    return;
  }

  const token = createAuthActionToken({
    userId: user.id,
    purpose,
    nonce: user.authActionNonce,
    expiresAt: user.authActionExpiresAt
  }, config.authActionTokenSecret);

  await deliverNotification(config, job, {
    purpose,
    email: user.email,
    name: user.name,
    actionUrl: actionUrl(config.authActionPublicUrl, purpose, token),
    expiresAt: user.authActionExpiresAt
  });

  await completeQueueJob(database, { jobId: job.envelope.jobId, workerId: WORKER_ID });
}

/** Process one small batch and return how many jobs were claimed. */
async function runBatch(
  database: DatabaseClient,
  config: ServerConfig,
  logger: ReturnType<typeof createStructuredLogger>
): Promise<number> {
  const jobs = await claimQueueJobs(database, {
    queueName: QUEUE_NAME,
    workerId: WORKER_ID,
    limit: 10
  });

  for (const job of jobs) {
    try {
      await handleJob(database, config, job);
    } catch (error) {
      const errorCode = error instanceof Error && /^[A-Z][A-Z0-9_]{1,99}$/.test(error.message)
        ? error.message
        : 'AUTH_NOTIFICATION_DELIVERY_FAILED';

      await failQueueJob(database, {
        jobId: job.envelope.jobId,
        workerId: WORKER_ID,
        errorCode,
        retryAt: new Date(Date.now() + RETRY_DELAY_MS)
      });

      logger.error({
        jobId: job.envelope.jobId,
        error: toSafeErrorLog(error)
      }, 'auth-notification.job_failed');
    }
  }

  return jobs.length;
}

/** Wait without keeping a busy loop when the queue has no due work. */
function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Request a graceful stop after the current queue job finishes. */
function requestStop(): void {
  stopping = true;
}

/** Run the durable authentication notification worker until shutdown is requested. */
async function main(): Promise<void> {
  const config = resolveConfig();
  if (!config.authNotificationWebhookUrl) {
    throw new Error('AUTH_NOTIFICATION_WEBHOOK_URL is required for the authentication notification worker.');
  }
  if (config.nodeEnv === 'production' && !config.authNotificationWebhookToken) {
    throw new Error('AUTH_NOTIFICATION_WEBHOOK_TOKEN is required in production.');
  }
  if (config.nodeEnv === 'production' && !config.authNotificationWebhookUrl.startsWith('https://')) {
    throw new Error('AUTH_NOTIFICATION_WEBHOOK_URL must use https:// in production.');
  }

  const logger = createStructuredLogger({
    level: config.logLevel,
    service: 'auth-notification-worker',
    environment: config.nodeEnv
  });

  process.env.DATABASE_URL = config.database.url;
  const database = createDatabaseClient({
    logQueries: config.nodeEnv === 'development' && config.logLevel === 'trace'
  });

  logger.info('auth-notification.worker_started');
  try {
    while (!stopping) {
      const claimed = await runBatch(database, config, logger);
      if (claimed === 0) await wait(POLL_INTERVAL_MS);
    }
  } finally {
    await disconnectDatabase(database);
    logger.info('auth-notification.worker_stopped');
  }
}

process.once('SIGTERM', requestStop);
process.once('SIGINT', requestStop);

main().catch((error) => {
  const logger = createStructuredLogger({
    level: 'error',
    service: 'auth-notification-worker',
    environment: 'startup'
  });
  logger.error({ error: toSafeErrorLog(error) }, 'auth-notification.worker_failed');
  process.exitCode = 1;
});

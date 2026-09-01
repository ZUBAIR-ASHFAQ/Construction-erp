const API_HOST = '127.0.0.1';
const API_PORT = 3000;
const API_URL = `http://${API_HOST}:${API_PORT}`;

/**
 * Tiny in-memory object store used only by the Module 18 browser test.
 * It keeps the Playwright workflow independent from production S3/MinIO.
 */
class BrowserTestObjectStorage {
  constructor() {
    this.objects = new Map();
  }

  async putObject(input) {
    if (this.objects.has(input.key)) throw new Error('OBJECT_ALREADY_EXISTS');

    const body = typeof input.body === 'string'
      ? Buffer.from(input.body)
      : Buffer.from(input.body);

    const object = {
      key: input.key,
      body,
      sizeBytes: body.byteLength,
      eTag: 'browser-test-etag',
      checksumSha256: input.checksumSha256 ?? null,
      contentType: input.contentType ?? null,
      lastModified: new Date(),
      metadata: input.metadata ?? {}
    };

    this.objects.set(input.key, object);
    return this.toInfo(object);
  }

  async headObject(key) {
    const object = this.objects.get(key);
    if (!object) throw new Error('OBJECT_NOT_FOUND');
    return this.toInfo(object);
  }

  async getObject(key) {
    const object = this.objects.get(key);
    if (!object) throw new Error('OBJECT_NOT_FOUND');
    return object;
  }

  async deleteObject(key) {
    this.objects.delete(key);
  }

  async createSignedUploadUrl(input) {
    return {
      url: `${API_URL}/__test-storage/upload?key=${encodeURIComponent(input.key)}&checksum=${encodeURIComponent(input.checksumSha256 ?? '')}`,
      expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 300) * 1000)
    };
  }

  async createSignedDownloadUrl(input) {
    return {
      url: `${API_URL}/__test-storage/download?key=${encodeURIComponent(input.key)}`,
      expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 300) * 1000)
    };
  }

  async checkHealth() {
    return { status: 'ok', checkedAt: new Date() };
  }

  close() {}

  toInfo(object) {
    return {
      key: object.key,
      sizeBytes: object.sizeBytes,
      eTag: object.eTag,
      checksumSha256: object.checksumSha256,
      contentType: object.contentType,
      lastModified: object.lastModified,
      metadata: object.metadata
    };
  }
}

const testing = await import('@construction-erp/testing');
const { buildApp } = await import('../../apps/api/dist/app.js');

const environment = testing.loadFoundationTestEnvironment();
const database = testing.createFoundationTestDatabaseClient(environment);
const storage = new BrowserTestObjectStorage();
await database.$connect();

const app = buildApp({
  database,
  objectStorage: storage,
  nodeEnv: 'test',
  logLevel: 'silent',
  webOrigins: ['http://127.0.0.1:5173'],
  authActionTokenSecret: process.env.AUTH_ACTION_TOKEN_SECRET ?? 'test-only-auth-action-secret-0123456789abcdef',
  documentsUploadPolicy: {
    maxSizeBytes: 1024 * 1024,
    allowedMimeTypes: ['text/plain', 'application/pdf'],
    signedUrlTtlSeconds: 300
  }
});

/** Receive the browser's direct signed upload in the test-only object store. */
app.put('/__test-storage/upload', async (request, reply) => {
  const key = request.query?.key;
  if (typeof key !== 'string' || key.length === 0) return reply.code(400).send({ error: 'Missing key.' });

  const checksumSha256 = typeof request.query?.checksum === 'string' && request.query.checksum.length > 0
    ? request.query.checksum
    : undefined;
  const contentTypeHeader = request.headers['content-type'];
  const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
  const body = typeof request.body === 'string' || Buffer.isBuffer(request.body)
    ? request.body
    : Buffer.from(String(request.body ?? ''));

  await storage.putObject({ key, body, contentType, checksumSha256 });
  return reply.code(200).send();
});

/** Serve a stored object when the UI follows an authorized signed download URL. */
app.get('/__test-storage/download', async (request, reply) => {
  const key = request.query?.key;
  if (typeof key !== 'string' || key.length === 0) return reply.code(400).send({ error: 'Missing key.' });

  const object = await storage.getObject(key);
  if (object.contentType) reply.type(object.contentType);
  return reply.send(object.body);
});

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
}

process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });

await app.listen({ host: API_HOST, port: API_PORT });

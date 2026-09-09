import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  attendanceIdParamsSchema,
  attendanceAssignmentResponseSchema,
  attendanceResponseSchema,
  calculatePayrollRunBodySchema,
  createAttendanceBodySchema,
  createPayrollPaymentBodySchema,
  createPayrollRunBodySchema,
  employeeSalaryLedgerResponseSchema,
  finalizePayrollRunBodySchema,
  listAttendanceQuerySchema,
  listAttendanceAssignmentsQuerySchema,
  listAttendanceResponseSchema,
  listPayrollRunsQuerySchema,
  listPayrollRunsResponseSchema,
  listPayrollPaymentsQuerySchema,
  listPayrollPaymentsResponseSchema,
  payrollCashBankAccountResponseSchema,
  payrollEntityIdParamsSchema,
  payrollPaymentResponseSchema,
  payrollRunIdParamsSchema,
  payrollRunResponseSchema,
  reversePayrollPaymentBodySchema,
  updateAttendanceBodySchema
} from './labour-payroll.schema.js';
import { LabourPayrollService } from './labour-payroll.service.js';

export type LabourPayrollRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const HOURS_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,4})?$' } as const;
const OVERTIME_MULTIPLIER_JSON_SCHEMA = { type: 'string', pattern: '^(?:[1-9]\\d{0,2})(?:\\.\\d{1,4})?$' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_HOURS_JSON_SCHEMA = { anyOf: [HOURS_JSON_SCHEMA, { type: 'null' }] } as const;
const ID_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const PAGE_PROPERTIES = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const ATTENDANCE_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { projectId: UUID_JSON_SCHEMA, employeeId: UUID_JSON_SCHEMA, fromDate: DATE_JSON_SCHEMA, toDate: DATE_JSON_SCHEMA, ...PAGE_PROPERTIES }
} as const;
const PAYROLL_LIST_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: PAGE_PROPERTIES } as const;
const PAYROLL_PAYMENT_LIST_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { employeeId: UUID_JSON_SCHEMA, payrollRunId: UUID_JSON_SCHEMA, status: { type: 'string', enum: ['POSTED', 'REVERSED'] }, ...PAGE_PROPERTIES } } as const;
const ATTENDANCE_BODY_PROPERTIES = {
  stageId: NULLABLE_UUID_JSON_SCHEMA,
  status: { type: 'string', enum: ['PRESENT', 'ABSENT'] },
  hours: NULLABLE_HOURS_JSON_SCHEMA,
  overtimeHours: NULLABLE_HOURS_JSON_SCHEMA
} as const;
const CREATE_ATTENDANCE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['employeeId', 'projectId', 'workDate', 'status'],
  properties: { employeeId: UUID_JSON_SCHEMA, projectId: UUID_JSON_SCHEMA, workDate: DATE_JSON_SCHEMA, ...ATTENDANCE_BODY_PROPERTIES }
} as const;
const UPDATE_ATTENDANCE_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, minProperties: 1, properties: ATTENDANCE_BODY_PROPERTIES } as const;
const CREATE_PAYROLL_RUN_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['periodStart', 'periodEnd'],
  properties: { periodStart: DATE_JSON_SCHEMA, periodEnd: DATE_JSON_SCHEMA }
} as const;
const CALCULATE_PAYROLL_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { overtimeMultiplier: OVERTIME_MULTIPLIER_JSON_SCHEMA } } as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const MONEY_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const NULLABLE_TEXT_JSON_SCHEMA = { anyOf: [{ type: 'string', minLength: 1, maxLength: 200 }, { type: 'null' }] } as const;
const CREATE_PAYROLL_PAYMENT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['payrollLineId', 'paymentDate', 'amount', 'cashBankAccountId'],
  properties: { payrollLineId: UUID_JSON_SCHEMA, paymentDate: DATE_JSON_SCHEMA, amount: MONEY_JSON_SCHEMA, cashBankAccountId: UUID_JSON_SCHEMA, reference: NULLABLE_TEXT_JSON_SCHEMA }
} as const;
const ATTENDANCE_ASSIGNMENTS_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['employeeId', 'workDate'],
  properties: { employeeId: UUID_JSON_SCHEMA, workDate: DATE_JSON_SCHEMA }
} as const;
const REVERSE_PAYROLL_PAYMENT_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['reversalDate'], properties: { reversalDate: DATE_JSON_SCHEMA } } as const;
const SUCCESS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: { type: 'object', additionalProperties: true } } } as const;
const SUCCESS_ARRAY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: { type: 'array', items: { type: 'object', additionalProperties: true } } } } as const;
const ERROR_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA } as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } }
} as const;

/** Parse one Labour/Payroll request segment through its Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query' | 'params'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [source, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the Foundation retry key required by Labour/Payroll write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ code: 'INVALID_REQUEST', message: 'A valid Idempotency-Key header is required.' });
  }
  return value.trim();
}

/** Register the Labour / Attendance, Payroll and Employee salary-settlement routes. */
export async function registerLabourPayrollRoutes(app: FastifyInstance, options: LabourPayrollRoutesOptions): Promise<void> {
  const service = new LabourPayrollService(options.database);

  app.get('/api/v1/attendance', {
    schema: { tags: ['Labour & Payroll'], operationId: 'listAttendance', summary: 'List attendance by project employee and date', security: BEARER_SECURITY, querystring: ATTENDANCE_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listAttendanceResponseSchema.parse(await service.listAttendance(parseRequest(listAttendanceQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/attendance', {
    schema: { tags: ['Labour & Payroll'], operationId: 'createAttendance', summary: 'Create or mark attendance', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_ATTENDANCE_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createAttendanceBodySchema, request.body, 'body');
    const data = attendanceResponseSchema.parse(await service.createAttendance(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/attendance/:id', {
    schema: { tags: ['Labour & Payroll'], operationId: 'correctAttendance', summary: 'Correct unposted attendance', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: UPDATE_ATTENDANCE_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(attendanceIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateAttendanceBodySchema, request.body, 'body');
    const data = attendanceResponseSchema.parse(await service.updateAttendance(params.id, body, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/payroll/runs', {
    schema: { tags: ['Labour & Payroll'], operationId: 'listPayrollRuns', summary: 'List payroll runs', security: BEARER_SECURITY, querystring: PAYROLL_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listPayrollRunsResponseSchema.parse(await service.listPayrollRuns(parseRequest(listPayrollRunsQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/payroll/runs', {
    schema: { tags: ['Labour & Payroll'], operationId: 'createPayrollRun', summary: 'Create payroll run', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_PAYROLL_RUN_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createPayrollRunBodySchema, request.body, 'body');
    const data = payrollRunResponseSchema.parse(await service.createPayrollRun(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/payroll/runs/:id/calculate', {
    schema: { tags: ['Labour & Payroll'], operationId: 'calculatePayrollRun', summary: 'Calculate payroll from effective compensation and attendance', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: CALCULATE_PAYROLL_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(payrollRunIdParamsSchema, request.params, 'params');
    const body = parseRequest(calculatePayrollRunBodySchema, request.body ?? {}, 'body');
    const data = payrollRunResponseSchema.parse(await service.calculatePayrollRun(params.id, body, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/payroll/runs/:id/finalize', {
    schema: { tags: ['Labour & Payroll'], operationId: 'finalizePayrollRun', summary: 'Finalize payroll and post Finance plus Project labour cost', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: EMPTY_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(payrollRunIdParamsSchema, request.params, 'params');
    parseRequest(finalizePayrollRunBodySchema, request.body ?? {}, 'body');
    const data = payrollRunResponseSchema.parse(await service.finalizePayrollRun(params.id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/payroll/runs/:id', {
    schema: { tags: ['Labour & Payroll'], operationId: 'getPayrollRun', summary: 'Read payroll run detail', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(payrollRunIdParamsSchema, request.params, 'params');
    const data = payrollRunResponseSchema.parse(await service.getPayrollRun(params.id));
    return reply.send({ data });
  });

  app.get('/api/v1/attendance/assignments', {
    schema: { tags: ['Labour & Payroll'], operationId: 'listAttendanceAssignments', summary: 'List effective Employee Project and Stage attendance destinations', security: BEARER_SECURITY, querystring: ATTENDANCE_ASSIGNMENTS_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_ARRAY_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listAttendanceAssignmentsQuerySchema, request.query, 'query');
    const data = attendanceAssignmentResponseSchema.array().parse(await service.listAttendanceAssignments(query));
    return reply.send({ data });
  });

  app.get('/api/v1/payroll/cash-bank-accounts', {
    schema: { tags: ['Labour & Payroll'], operationId: 'listPayrollCashBankAccounts', summary: 'List active Cash and Bank accounts for salary payment', security: BEARER_SECURITY, response: { 200: SUCCESS_ARRAY_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = payrollCashBankAccountResponseSchema.array().parse(await service.listPayrollCashBankAccounts());
    return reply.send({ data });
  });

  app.get('/api/v1/payroll/payments', {
    schema: { tags: ['Labour & Payroll'], operationId: 'listPayrollPayments', summary: 'List Employee salary payments', security: BEARER_SECURITY, querystring: PAYROLL_PAYMENT_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listPayrollPaymentsQuerySchema, request.query, 'query');
    const data = listPayrollPaymentsResponseSchema.parse(await service.listPayrollPayments(query));
    return reply.send({ data });
  });

  app.post('/api/v1/payroll/payments', {
    schema: { tags: ['Labour & Payroll'], operationId: 'createPayrollPayment', summary: 'Create and post a partial or full Employee salary payment', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_PAYROLL_PAYMENT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createPayrollPaymentBodySchema, request.body, 'body');
    const data = payrollPaymentResponseSchema.parse(await service.createPayrollPayment(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/payroll/payments/:id/reverse', {
    schema: { tags: ['Labour & Payroll'], operationId: 'reversePayrollPayment', summary: 'Reverse a posted Employee salary payment', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: REVERSE_PAYROLL_PAYMENT_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(payrollEntityIdParamsSchema, request.params, 'params');
    const body = parseRequest(reversePayrollPaymentBodySchema, request.body, 'body');
    const data = payrollPaymentResponseSchema.parse(await service.reversePayrollPayment(params.id, body, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/payroll/employees/:id/ledger', {
    schema: { tags: ['Labour & Payroll'], operationId: 'getEmployeeSalaryLedger', summary: 'Read one Employee salary ledger', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(payrollEntityIdParamsSchema, request.params, 'params');
    const data = employeeSalaryLedgerResponseSchema.parse(await service.getEmployeeSalaryLedger(params.id));
    return reply.send({ data });
  });
}

import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  allocateSupplierPaymentBodySchema,
  createSupplierInvoiceBodySchema,
  createSupplierPaymentBodySchema,
  listSupplierInvoicesQuerySchema,
  listSupplierInvoicesResponseSchema,
  listSupplierPaymentsQuerySchema,
  listSupplierPaymentsResponseSchema,
  postSupplierInvoiceBodySchema,
  reverseSupplierPaymentBodySchema,
  supplierAgingQuerySchema,
  supplierAgingResponseSchema,
  supplierLedgerQuerySchema,
  supplierLedgerResponseSchema,
  supplierInvoiceResponseSchema,
  supplierPayablesIdParamsSchema,
  supplierPaymentAllocationResponseSchema,
  supplierPaymentResponseSchema
} from './supplier-payables.schema.js';
import { SupplierPayablesService } from './supplier-payables.service.js';

export type SupplierPayablesRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const DATE_JSON_SCHEMA = { type: 'string', format: 'date' } as const;
const NULLABLE_DATE_JSON_SCHEMA = { anyOf: [DATE_JSON_SCHEMA, { type: 'null' }] } as const;
const DATE_TIME_JSON_SCHEMA = { type: 'string', format: 'date-time' } as const;
const NULLABLE_TEXT_JSON_SCHEMA = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const POSITIVE_MONEY_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:[1-9]\\d{0,15})(?:\\.\\d{1,2})?$|^0\\.(?:0[1-9]|[1-9]\\d?)$'
} as const;
const NON_NEGATIVE_MONEY_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$'
} as const;
const INVOICE_STATUS_JSON_SCHEMA = { type: 'string', enum: ['DRAFT', 'POSTED'] } as const;
const PAYMENT_STATUS_JSON_SCHEMA = { type: 'string', enum: ['DRAFT', 'POSTED', 'REVERSED'] } as const;
const SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: UUID_JSON_SCHEMA }
} as const;
const PAGINATION_PROPERTIES = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: 100 }
} as const;
const LIST_INVOICES_QUERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    purchaseOrderId: UUID_JSON_SCHEMA,
    goodsReceiptId: UUID_JSON_SCHEMA,
    status: INVOICE_STATUS_JSON_SCHEMA,
    fromDate: DATE_JSON_SCHEMA,
    toDate: DATE_JSON_SCHEMA,
    dueBefore: DATE_JSON_SCHEMA,
    ...PAGINATION_PROPERTIES
  }
} as const;
const INVOICE_LINE_INPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['description', 'amount'],
  properties: {
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    description: { type: 'string', minLength: 1, maxLength: 4000 },
    amount: POSITIVE_MONEY_JSON_SCHEMA,
    expenseOrInventoryAccountId: NULLABLE_UUID_JSON_SCHEMA
  }
} as const;
const CREATE_INVOICE_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['vendorId', 'projectId', 'invoiceNo', 'invoiceDate', 'lines'],
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    invoiceNo: { type: 'string', minLength: 1, maxLength: 150 },
    invoiceDate: DATE_JSON_SCHEMA,
    dueDate: NULLABLE_DATE_JSON_SCHEMA,
    purchaseOrderId: NULLABLE_UUID_JSON_SCHEMA,
    goodsReceiptId: NULLABLE_UUID_JSON_SCHEMA,
    taxAmount: NON_NEGATIVE_MONEY_JSON_SCHEMA,
    lines: { type: 'array', minItems: 1, maxItems: 500, items: INVOICE_LINE_INPUT_JSON_SCHEMA }
  }
} as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const LIST_PAYMENTS_QUERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    status: PAYMENT_STATUS_JSON_SCHEMA,
    fromDate: DATE_JSON_SCHEMA,
    toDate: DATE_JSON_SCHEMA,
    ...PAGINATION_PROPERTIES
  }
} as const;
const CREATE_PAYMENT_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['vendorId', 'paymentDate', 'amount', 'cashBankAccountId'],
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: NULLABLE_UUID_JSON_SCHEMA,
    supplierInvoiceId: NULLABLE_UUID_JSON_SCHEMA,
    paymentDate: DATE_JSON_SCHEMA,
    amount: POSITIVE_MONEY_JSON_SCHEMA,
    cashBankAccountId: UUID_JSON_SCHEMA,
    reference: { anyOf: [{ type: 'string', minLength: 1, maxLength: 200 }, { type: 'null' }] }
  }
} as const;
const ALLOCATION_INPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['supplierInvoiceId', 'amount'],
  properties: {
    supplierInvoiceId: UUID_JSON_SCHEMA,
    amount: POSITIVE_MONEY_JSON_SCHEMA
  }
} as const;
const ALLOCATE_PAYMENT_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['allocations'],
  properties: {
    allocations: { type: 'array', minItems: 1, maxItems: 500, items: ALLOCATION_INPUT_JSON_SCHEMA }
  }
} as const;
const AGING_QUERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    asOfDate: DATE_JSON_SCHEMA,
    ...PAGINATION_PROPERTIES
  }
} as const;

const LEDGER_QUERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['vendorId'],
  properties: {
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA
  }
} as const;
const INVOICE_LINE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'supplierInvoiceId', 'stageId', 'description', 'amount', 'expenseOrInventoryAccountId'],
  properties: {
    id: UUID_JSON_SCHEMA,
    supplierInvoiceId: UUID_JSON_SCHEMA,
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    description: { type: 'string' },
    amount: { type: 'string' },
    expenseOrInventoryAccountId: NULLABLE_UUID_JSON_SCHEMA
  }
} as const;
const INVOICE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'vendorId', 'projectId', 'invoiceNo', 'invoiceDate', 'dueDate', 'purchaseOrderId',
    'goodsReceiptId', 'status', 'subtotal', 'taxAmount', 'totalAmount', 'allocatedAmount', 'outstandingAmount', 'lines'
  ],
  properties: {
    id: UUID_JSON_SCHEMA,
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    invoiceNo: { type: 'string', minLength: 1 },
    invoiceDate: DATE_JSON_SCHEMA,
    dueDate: NULLABLE_DATE_JSON_SCHEMA,
    purchaseOrderId: NULLABLE_UUID_JSON_SCHEMA,
    goodsReceiptId: NULLABLE_UUID_JSON_SCHEMA,
    status: INVOICE_STATUS_JSON_SCHEMA,
    subtotal: { type: 'string' },
    taxAmount: { type: 'string' },
    totalAmount: { type: 'string' },
    allocatedAmount: { type: 'string' },
    outstandingAmount: { type: 'string' },
    lines: { type: 'array', items: INVOICE_LINE_RESPONSE_JSON_SCHEMA }
  }
} as const;
const PAYMENT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'vendorId', 'projectId', 'paymentNo', 'paymentDate', 'amount', 'allocatedAmount', 'remainingAmount', 'cashBankAccountId', 'reference', 'status'],
  properties: {
    id: UUID_JSON_SCHEMA,
    vendorId: UUID_JSON_SCHEMA,
    projectId: NULLABLE_UUID_JSON_SCHEMA,
    paymentNo: { type: 'string', minLength: 1 },
    paymentDate: DATE_JSON_SCHEMA,
    amount: { type: 'string' },
    allocatedAmount: { type: 'string' },
    remainingAmount: { type: 'string' },
    cashBankAccountId: UUID_JSON_SCHEMA,
    reference: NULLABLE_TEXT_JSON_SCHEMA,
    status: PAYMENT_STATUS_JSON_SCHEMA
  }
} as const;
const ALLOCATION_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'supplierPaymentId', 'supplierInvoiceId', 'amount', 'allocatedAt'],
  properties: {
    id: UUID_JSON_SCHEMA,
    supplierPaymentId: UUID_JSON_SCHEMA,
    supplierInvoiceId: UUID_JSON_SCHEMA,
    amount: { type: 'string' },
    allocatedAt: DATE_TIME_JSON_SCHEMA
  }
} as const;
const AGING_ROW_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'supplierInvoiceId', 'vendorId', 'projectId', 'invoiceNo', 'invoiceDate', 'dueDate',
    'totalAmount', 'allocatedAmount', 'outstandingAmount', 'ageDays'
  ],
  properties: {
    supplierInvoiceId: UUID_JSON_SCHEMA,
    vendorId: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    invoiceNo: { type: 'string', minLength: 1 },
    invoiceDate: DATE_JSON_SCHEMA,
    dueDate: NULLABLE_DATE_JSON_SCHEMA,
    totalAmount: { type: 'string' },
    allocatedAmount: { type: 'string' },
    outstandingAmount: { type: 'string' },
    ageDays: { type: 'integer', minimum: 0 }
  }
} as const;

const LEDGER_ENTRY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'entryDate', 'entryType', 'reference', 'projectId', 'projectName', 'debit', 'credit', 'allocationAmount', 'balance', 'note', 'sourceId'],
  properties: {
    id: { type: 'string', minLength: 1 },
    entryDate: DATE_JSON_SCHEMA,
    entryType: { type: 'string', enum: ['INVOICE', 'PAYMENT', 'PAYMENT_REVERSAL', 'ALLOCATION'] },
    reference: { type: 'string', minLength: 1 },
    projectId: NULLABLE_UUID_JSON_SCHEMA,
    projectName: NULLABLE_TEXT_JSON_SCHEMA,
    debit: { type: 'string' },
    credit: { type: 'string' },
    allocationAmount: { type: 'string' },
    balance: { type: 'string' },
    note: NULLABLE_TEXT_JSON_SCHEMA,
    sourceId: UUID_JSON_SCHEMA
  }
} as const;
/** Wrap one response JSON schema in the standard API data envelope. */
function dataEnvelope(data: object) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: { data }
  } as const;
}
const INVOICE_SUCCESS_JSON_SCHEMA = dataEnvelope(INVOICE_RESPONSE_JSON_SCHEMA);
const INVOICE_LIST_SUCCESS_JSON_SCHEMA = dataEnvelope({
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: INVOICE_RESPONSE_JSON_SCHEMA },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
});
const PAYMENT_SUCCESS_JSON_SCHEMA = dataEnvelope(PAYMENT_RESPONSE_JSON_SCHEMA);
const PAYMENT_LIST_SUCCESS_JSON_SCHEMA = dataEnvelope({
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: PAYMENT_RESPONSE_JSON_SCHEMA },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
});
const ALLOCATION_LIST_SUCCESS_JSON_SCHEMA = dataEnvelope({ type: 'array', items: ALLOCATION_RESPONSE_JSON_SCHEMA });
const AGING_SUCCESS_JSON_SCHEMA = dataEnvelope({
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize', 'asOfDate'],
  properties: {
    items: { type: 'array', items: AGING_ROW_RESPONSE_JSON_SCHEMA },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 },
    asOfDate: DATE_JSON_SCHEMA
  }
});

const LEDGER_SUCCESS_JSON_SCHEMA = dataEnvelope({
  type: 'object',
  additionalProperties: false,
  required: ['supplier', 'summary', 'entries'],
  properties: {
    supplier: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'code', 'displayName', 'currency'],
      properties: {
        id: UUID_JSON_SCHEMA,
        code: { type: 'string', minLength: 1 },
        displayName: { type: 'string', minLength: 1 },
        currency: NULLABLE_TEXT_JSON_SCHEMA
      }
    },
    summary: {
      type: 'object',
      additionalProperties: false,
      required: ['totalInvoiced', 'totalPaid', 'totalReversed', 'netPaid', 'balance'],
      properties: {
        totalInvoiced: { type: 'string' },
        totalPaid: { type: 'string' },
        totalReversed: { type: 'string' },
        netPaid: { type: 'string' },
        balance: { type: 'string' }
      }
    },
    entries: { type: 'array', items: LEDGER_ENTRY_RESPONSE_JSON_SCHEMA }
  }
});
const ERROR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['error'],
  properties: { error: { type: 'object', additionalProperties: true } }
} as const;
const COMMON_RESPONSES = {
  400: ERROR_JSON_SCHEMA,
  401: ERROR_JSON_SCHEMA,
  403: ERROR_JSON_SCHEMA,
  404: ERROR_JSON_SCHEMA,
  409: ERROR_JSON_SCHEMA,
  500: ERROR_JSON_SCHEMA
} as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } }
} as const;

/** Parse one Supplier Payables request segment through its frozen Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query' | 'params'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({
      field: [source, ...issue.path.map(String)].join('.'),
      message: issue.message
    }))
  });
}

/** Read the Foundation retry key required by Supplier Payables write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key header is required.'
    });
  }
  return value.trim();
}

/** Register the explicit Supplier Payables HTTP surface. */
export async function registerSupplierPayablesRoutes(app: FastifyInstance, options: SupplierPayablesRoutesOptions): Promise<void> {
  const service = new SupplierPayablesService(options.database);

  app.get('/api/v1/supplier-payables/invoices', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'listSupplierInvoices',
      summary: 'List Supplier Invoices',
      security: BEARER_SECURITY,
      querystring: LIST_INVOICES_QUERY_JSON_SCHEMA,
      response: { 200: INVOICE_LIST_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listSupplierInvoicesQuerySchema, request.query, 'query');
    const data = listSupplierInvoicesResponseSchema.parse(await service.listSupplierInvoices(query));
    return reply.send({ data });
  });

  app.post('/api/v1/supplier-payables/invoices', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'createSupplierInvoice',
      summary: 'Create a draft Supplier Invoice',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      body: CREATE_INVOICE_BODY_JSON_SCHEMA,
      response: { 201: INVOICE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createSupplierInvoiceBodySchema, request.body, 'body');
    const data = supplierInvoiceResponseSchema.parse(await service.createSupplierInvoice(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/supplier-payables/invoices/:id', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'getSupplierInvoice',
      summary: 'Read Supplier Invoice detail',
      security: BEARER_SECURITY,
      params: SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA,
      response: { 200: INVOICE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(supplierPayablesIdParamsSchema, request.params, 'params');
    const data = supplierInvoiceResponseSchema.parse(await service.getSupplierInvoice(params.id));
    return reply.send({ data });
  });

  app.post('/api/v1/supplier-payables/invoices/:id/post', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'postSupplierInvoice',
      summary: 'Post Supplier Invoice to payable and Finance',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 200: INVOICE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(supplierPayablesIdParamsSchema, request.params, 'params');
    parseRequest(postSupplierInvoiceBodySchema, request.body ?? {}, 'body');
    const data = supplierInvoiceResponseSchema.parse(await service.postSupplierInvoice(params.id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/supplier-payables/payments', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'listSupplierPayments',
      summary: 'List Supplier Payments',
      security: BEARER_SECURITY,
      querystring: LIST_PAYMENTS_QUERY_JSON_SCHEMA,
      response: { 200: PAYMENT_LIST_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listSupplierPaymentsQuerySchema, request.query, 'query');
    const data = listSupplierPaymentsResponseSchema.parse(await service.listSupplierPayments(query));
    return reply.send({ data });
  });

  app.post('/api/v1/supplier-payables/payments', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'createSupplierPayment',
      summary: 'Create and post a Supplier Payment',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      body: CREATE_PAYMENT_BODY_JSON_SCHEMA,
      response: { 201: PAYMENT_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createSupplierPaymentBodySchema, request.body, 'body');
    const data = supplierPaymentResponseSchema.parse(await service.createSupplierPayment(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/supplier-payables/payments/:id/allocations', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'allocateSupplierPayment',
      summary: 'Allocate Supplier Payment to posted invoices',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA,
      body: ALLOCATE_PAYMENT_BODY_JSON_SCHEMA,
      response: { 201: ALLOCATION_LIST_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(supplierPayablesIdParamsSchema, request.params, 'params');
    const body = parseRequest(allocateSupplierPaymentBodySchema, request.body, 'body');
    const result = await service.allocateSupplierPayment(params.id, body, readIdempotencyKey(request));
    const data = supplierPaymentAllocationResponseSchema.array().parse(result);
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/supplier-payables/payments/:id/reverse', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'reverseSupplierPayment',
      summary: 'Reverse a posted Supplier Payment',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 200: PAYMENT_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(supplierPayablesIdParamsSchema, request.params, 'params');
    parseRequest(reverseSupplierPaymentBodySchema, request.body ?? {}, 'body');
    const data = supplierPaymentResponseSchema.parse(await service.reverseSupplierPayment(params.id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/supplier-payables/aging', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'getSupplierAging',
      summary: 'Read Supplier payable aging',
      security: BEARER_SECURITY,
      querystring: AGING_QUERY_JSON_SCHEMA,
      response: { 200: AGING_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(supplierAgingQuerySchema, request.query, 'query');
    const data = supplierAgingResponseSchema.parse(await service.getSupplierAging(query));
    return reply.send({ data });
  });


  app.get('/api/v1/supplier-payables/ledger', {
    schema: {
      tags: ['Supplier Payables'],
      operationId: 'getSupplierLedger',
      summary: 'Read one Supplier account ledger',
      security: BEARER_SECURITY,
      querystring: LEDGER_QUERY_JSON_SCHEMA,
      response: { 200: LEDGER_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(supplierLedgerQuerySchema, request.query, 'query');
    const data = supplierLedgerResponseSchema.parse(await service.getSupplierLedger(query));
    return reply.send({ data });
  });
}

export type ErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'infrastructure'
  | 'internal';

export type FieldError = Readonly<{
  field: string;
  message: string;
  code?: string;
}>;

export type AppErrorOptions = Readonly<{
  code: string;
  message: string;
  statusCode: number;
  category: ErrorCategory;
  fieldErrors?: readonly FieldError[] | undefined;
  retryable?: boolean;
  exposeMessage?: boolean;
  cause?: unknown;
}>;

export type ApiErrorBody = Readonly<{
  code: string;
  message: string;
  requestId: string;
  fieldErrors?: readonly FieldError[] | undefined;
}>;

export type ApiErrorEnvelope = Readonly<{
  error: ApiErrorBody;
}>;

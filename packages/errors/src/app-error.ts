import type { AppErrorOptions, ErrorCategory, FieldError } from './types.js';

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly category: ErrorCategory;
  readonly fieldErrors: readonly FieldError[] | undefined;
  readonly retryable: boolean;
  readonly exposeMessage: boolean;

  /** Create a new AppError instance. */
  constructor(options: AppErrorOptions) {
    if (!ERROR_CODE_PATTERN.test(options.code)) {
      throw new TypeError(`Application error code must be stable UPPER_SNAKE_CASE: ${options.code}`);
    }
    if (!Number.isInteger(options.statusCode) || options.statusCode < 400 || options.statusCode > 599) {
      throw new TypeError(`Application error statusCode must be an HTTP error status: ${options.statusCode}`);
    }

    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.code = options.code;
    this.statusCode = options.statusCode;
    this.category = options.category;
    this.fieldErrors = options.fieldErrors ? Object.freeze([...options.fieldErrors]) : undefined;
    this.retryable = options.retryable ?? false;
    this.exposeMessage = options.exposeMessage ?? options.statusCode < 500;
  }
}

# @construction-erp/errors

Foundation Pass 08 common application/API error contract.

## Goals

- one stable machine-readable error code per failure contract;
- consistent HTTP status/category mapping;
- optional field-level validation errors;
- request-ID correlation in every API error envelope;
- no SQL, Prisma internals, stack traces, tokens, secrets, or unknown exception messages in client responses;
- module-specific business codes can reuse the base classes without inventing a new HTTP envelope.

## API envelope

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Request validation failed.",
    "requestId": "req_...",
    "fieldErrors": [
      { "field": "email", "message": "Invalid email" }
    ]
  }
}
```

Unknown exceptions normalize to `INTERNAL_SERVER_ERROR` with a safe public message. The original exception remains attached as `cause` for server-side logging only.

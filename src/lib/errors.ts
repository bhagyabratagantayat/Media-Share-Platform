export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_SERVER_ERROR';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, statusCode = 500, code: ErrorCode = 'INTERNAL_SERVER_ERROR', details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request parameters', details?: Record<string, unknown>) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 401, 'UNAUTHORIZED', details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to access this resource', details?: Record<string, unknown>) {
    super(message, 403, 'FORBIDDEN', details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Requested resource was not found', details?: Record<string, unknown>) {
    super(message, 404, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists or conflict occurred', details?: Record<string, unknown>) {
    super(message, 409, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.', details?: Record<string, unknown>) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
    this.name = 'RateLimitError';
  }
}

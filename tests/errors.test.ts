import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../src/lib/errors';

describe('Error Hierarchy & Status Codes', () => {
  it('should instantiate AppError with correct status code and error code', () => {
    const error = new AppError('Server error', 500, 'INTERNAL_SERVER_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('Server error');
  });

  it('should instantiate ForbiddenError with HTTP 403', () => {
    const error = new ForbiddenError('Tenant mismatch');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.name).toBe('ForbiddenError');
  });

  it('should instantiate UnauthorizedError with HTTP 401', () => {
    const error = new UnauthorizedError('Token expired');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.name).toBe('UnauthorizedError');
  });

  it('should instantiate ConflictError with HTTP 409', () => {
    const error = new ConflictError('Slug already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('should instantiate RateLimitError with HTTP 429', () => {
    const error = new RateLimitError();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('should instantiate BadRequestError with HTTP 400', () => {
    const error = new BadRequestError();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });
});

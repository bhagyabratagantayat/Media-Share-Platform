import { NextResponse } from 'next/server';
import { AppError } from './errors';

// Ensure JSON.stringify never throws on BigInt
if (typeof BigInt !== 'undefined') {
  (BigInt.prototype as any).toJSON = function () {
    const intVal = Number(this);
    return Number.isSafeInteger(intVal) ? intVal : this.toString();
  };
}

export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') {
    const num = Number(obj);
    return (Number.isSafeInteger(num) ? num : obj.toString()) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const res: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      res[key] = serializeBigInt(value);
    }
    return res as unknown as T;
  }
  return obj;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function successResponse<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  const sanitizedData = serializeBigInt(data);
  const sanitizedMeta = meta ? serializeBigInt(meta) : undefined;

  const body: ApiSuccessResponse<T> = {
    success: true,
    data: sanitizedData,
    ...(sanitizedMeta ? { meta: sanitizedMeta } : {}),
  };
  return NextResponse.json(body, { status });
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: serializeBigInt(error.details) } : {}),
      },
    };
    return NextResponse.json(body, { status: error.statusCode });
  }

  // Fallback for unhandled unexpected exceptions
  console.error('Unhandled Server Exception:', error);

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please try again later.',
    },
  };

  return NextResponse.json(body, { status: 500 });
}

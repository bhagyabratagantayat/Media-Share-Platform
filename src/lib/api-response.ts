import { NextResponse } from 'next/server';
import { AppError } from './errors';

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
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta } : {}),
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
        ...(error.details ? { details: error.details } : {}),
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

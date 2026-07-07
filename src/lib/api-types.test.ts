import { describe, it, expect } from 'vitest';
import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse, ApiError } from './api-types';

// Type-level assertions: these lines would cause a compile error if types are wrong.
// We also exercise them at runtime via plain objects that satisfy the shape.

describe('ApiSuccessResponse<T>', () => {
  it('has success:true and a data field', () => {
    const res: ApiSuccessResponse<{ count: number }> = { success: true, data: { count: 42 } };
    expect(res.success).toBe(true);
    expect(res.data.count).toBe(42);
  });

  it('works with a string data payload', () => {
    const res: ApiSuccessResponse<string> = { success: true, data: 'ok' };
    expect(res.success).toBe(true);
    expect(res.data).toBe('ok');
  });
});

describe('ApiErrorResponse<T>', () => {
  it('has success:false and an error message', () => {
    const res: ApiErrorResponse = { success: false, error: 'something went wrong' };
    expect(res.success).toBe(false);
    expect(res.error).toBe('something went wrong');
  });

  it('allows optional errorCode', () => {
    const res: ApiErrorResponse = { success: false, error: 'not found', errorCode: 'club_not_found' };
    expect(res.errorCode).toBe('club_not_found');
  });

  it('allows optional data payload on error', () => {
    const res: ApiErrorResponse<{ partial: boolean }> = {
      success: false,
      error: 'partial failure',
      data: { partial: true },
    };
    expect(res.data?.partial).toBe(true);
  });
});

describe('ApiResponse<T, E> discriminated union', () => {
  it('narrows to success branch when success is true', () => {
    const res: ApiResponse<number> = { success: true, data: 7 };
    if (res.success) {
      expect(res.data).toBe(7);
    } else {
      throw new Error('should not reach error branch');
    }
  });

  it('narrows to error branch when success is false', () => {
    const res: ApiResponse<number> = { success: false, error: 'oops' };
    if (!res.success) {
      expect(res.error).toBe('oops');
    } else {
      throw new Error('should not reach success branch');
    }
  });
});

describe('ApiError (alias for ApiErrorResponse<never>)', () => {
  it('satisfies the ApiErrorResponse shape', () => {
    const err: ApiError = { success: false, error: 'bad request' };
    expect(err.success).toBe(false);
    expect(err.error).toBe('bad request');
  });
});

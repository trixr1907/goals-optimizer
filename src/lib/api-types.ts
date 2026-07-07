/**
 * Standardised API response types used across all route handlers.
 *
 * Every endpoint returns { success: boolean, data?: T, error?: string }.
 * This provides a consistent contract for frontend consumers and makes
 * error handling predictable.
 *
 * On error (success: false), error is always present; data is optional
 * and only included when partial results are still meaningful (e.g. a
 * 404 with the club metadata that was resolved before the failure).
 */

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse<T = never> {
  success: false;
  error: string;
  errorCode?: string;
  data?: T;
}

export type ApiResponse<T, E = never> = ApiSuccessResponse<T> | ApiErrorResponse<E>;

/** An error response with no additional data payload. */
export type ApiError = ApiErrorResponse<never>;

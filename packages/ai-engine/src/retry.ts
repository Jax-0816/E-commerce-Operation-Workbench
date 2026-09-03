export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly shouldRetry: (error: unknown) => boolean;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  if (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1) {
    throw new TypeError('maxAttempts must be a positive safe integer.');
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts || !options.shouldRetry(error)) throw error;
      await options.sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

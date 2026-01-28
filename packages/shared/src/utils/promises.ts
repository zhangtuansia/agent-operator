/**
 * Promise Utilities
 *
 * Utilities for working with promises, including timeout handling and retry logic.
 */

/**
 * Custom error for timeout operations
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * Wrap a promise with a timeout
 *
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param message - Custom timeout error message
 * @returns Promise that rejects if timeout is exceeded
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetchData(),
 *   5000,
 *   'Data fetch timed out'
 * )
 * ```
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(message, timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId)
  })
}

/**
 * Options for retry logic
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number
  /** Base delay between retries in milliseconds */
  delayMs: number
  /** Whether to use exponential backoff (default: true) */
  backoff?: boolean
  /** Maximum delay cap for backoff (default: 30000) */
  maxDelayMs?: number
  /** Called on each retry with attempt number and error */
  onRetry?: (attempt: number, error: Error) => void
  /** Condition to check if error is retryable (default: all errors) */
  isRetryable?: (error: Error) => boolean
}

/**
 * Execute a function with automatic retry on failure
 *
 * @param fn - Async function to execute
 * @param options - Retry options
 * @returns Promise that resolves when function succeeds or all retries exhausted
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => unstableApiCall(),
 *   {
 *     maxRetries: 3,
 *     delayMs: 1000,
 *     backoff: true,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`)
 *   }
 * )
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const {
    maxRetries,
    delayMs,
    backoff = true,
    maxDelayMs = 30000,
    onRetry,
    isRetryable = () => true,
  } = options

  let lastError: Error | undefined
  let attempt = 0

  while (attempt <= maxRetries) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt >= maxRetries || !isRetryable(lastError)) {
        throw lastError
      }

      // Calculate delay with optional exponential backoff
      let delay = delayMs
      if (backoff) {
        delay = Math.min(delayMs * Math.pow(2, attempt), maxDelayMs)
      }

      onRetry?.(attempt + 1, lastError)
      await sleep(delay)
      attempt++
    }
  }

  throw lastError
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a deferred promise that can be resolved/rejected externally
 *
 * @example
 * ```typescript
 * const deferred = createDeferred<string>()
 * setTimeout(() => deferred.resolve('done'), 1000)
 * const result = await deferred.promise
 * ```
 */
export interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

export function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void
  let reject: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  }
}

/**
 * Execute multiple promises with concurrency limit
 *
 * @param tasks - Array of task functions that return promises
 * @param concurrency - Maximum concurrent tasks
 * @returns Promise that resolves with all results
 *
 * @example
 * ```typescript
 * const results = await withConcurrency(
 *   urls.map(url => () => fetch(url)),
 *   5 // Max 5 concurrent fetches
 * )
 * ```
 */
export async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = []
  const executing = new Set<Promise<void>>()

  for (const task of tasks) {
    const p = Promise.resolve().then(() => task()).then(result => {
      results.push(result)
    })

    const e = p.finally(() => executing.delete(e))
    executing.add(e)

    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

/**
 * Race promises with a fallback value if all fail or timeout
 *
 * @param promises - Array of promises to race
 * @param fallback - Fallback value if all fail
 * @param timeoutMs - Optional timeout for the race
 * @returns First successful result or fallback
 */
export async function raceWithFallback<T>(
  promises: Promise<T>[],
  fallback: T,
  timeoutMs?: number
): Promise<T> {
  try {
    const racePromises = promises.map(p =>
      p.catch(() => Promise.reject())
    )

    const racePromise = Promise.any(racePromises)

    if (timeoutMs) {
      return await withTimeout(racePromise, timeoutMs)
    }

    return await racePromise
  } catch {
    return fallback
  }
}

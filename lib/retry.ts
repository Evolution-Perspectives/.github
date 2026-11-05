import type { GraphQL } from './types.ts'

const TRANSIENT = /rate limit|secondary|timeout|timed out|502|503|504|ECONNRESET|ETIMEDOUT/i

export interface RetryOptions {
  attempts?: number
  delayMs?: number
  sleep?: (ms: number) => Promise<void>
  /** Failures worth retrying (default: rate limits, gateway errors, resets). */
  retryOn?: RegExp
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Runs fn, retrying only transient failures (rate limits, gateway errors, resets) with a growing delay. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, delayMs = 1000, sleep = realSleep, retryOn = TRANSIENT } = options
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (attempt >= attempts || !retryOn.test(message)) throw error
      await sleep(delayMs * attempt)
    }
  }
}

/** Wraps a GraphQL function so each call is retried on transient failures. */
export function retrying(graphql: GraphQL, options: RetryOptions = {}): GraphQL {
  return <T = unknown>(query: string, variables?: Record<string, unknown>) =>
    withRetry(() => graphql<T>(query, variables), options)
}

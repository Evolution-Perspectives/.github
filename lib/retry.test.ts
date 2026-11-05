import test from 'node:test'
import assert from 'node:assert/strict'
import { retrying, withRetry } from './retry.ts'
import type { GraphQL } from './types.ts'

const noSleep = async () => {}

test('a transient failure is retried and then succeeds', async () => {
  let calls = 0
  const result = await withRetry(async () => {
    calls++
    if (calls < 3) throw new Error('502 Bad Gateway')
    return 'ok'
  }, { sleep: noSleep })
  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('a non-transient failure is thrown at once', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new Error('Could not resolve to a node') }, { sleep: noSleep }), /Could not resolve/)
  assert.equal(calls, 1)
})

test('gives up after the attempts and rethrows', async () => {
  let calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new Error('secondary rate limit') }, { attempts: 2, sleep: noSleep }), /rate limit/)
  assert.equal(calls, 2)
})

test('the delay grows with each attempt', async () => {
  const waits: number[] = []
  let calls = 0
  await withRetry(async () => { if (++calls < 3) throw new Error('timeout') }, { delayMs: 10, sleep: async (ms) => { waits.push(ms) } })
  assert.deepEqual(waits, [10, 20])
})

test('retrying() wraps a GraphQL function', async () => {
  let calls = 0
  const base = (async () => { if (++calls < 2) throw new Error('503'); return { data: 1 } }) as GraphQL
  const wrapped = retrying(base, { sleep: noSleep })
  assert.deepEqual(await wrapped('query { x }'), { data: 1 })
  assert.equal(calls, 2)
})

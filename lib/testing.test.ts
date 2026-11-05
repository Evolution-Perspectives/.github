import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from './testing.ts'

test('queries go to the query handler and mutations are recorded', async () => {
  const f = fakes(() => ({ node: { id: 'I_1' } }), () => ({ done: true }))
  assert.deepEqual(await f.graphql('query { node { id } }'), { node: { id: 'I_1' } })
  assert.deepEqual(await f.graphql('  mutation($a: ID!) { x }', { a: '1' }), { done: true })
  assert.deepEqual(f.mutations, [{ query: '  mutation($a: ID!) { x }', vars: { a: '1' } }])
})

test('a mutation handler can fail and the failed call is not recorded', async () => {
  const f = fakes(() => ({}), () => { throw new Error('boom') })
  await assert.rejects(f.graphql('mutation { x }'), /boom/)
  assert.equal(f.mutations.length, 0)
})

test('core logs are captured', async () => {
  const f = fakes(() => ({}))
  f.core.info('a'); f.core.warning('b'); f.core.setFailed('c'); f.core.summary.addRaw('d')
  assert.deepEqual(f.logs, { info: ['a'], warning: ['b'], failed: ['c'], summary: ['d'] })
})

// Tests for the close-state-sync action (Status -> issue close/reopen), run against fakes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { statusSync } from './sync.testkit.ts'

test('Pending Release closes an open issue as completed', async () => {
  const { mutations } = await statusSync({ status: '📤 Pending Release', state: 'OPEN' })
  assert.equal(mutations.length, 1)
  assert.match(mutations[0]!.query, /closeIssue/)
  assert.equal(mutations[0]!.vars.reason, 'COMPLETED')
})

test('Pending Release leaves an already closed issue alone, whatever the close reason', async () => {
  for (const stateReason of ['COMPLETED', 'NOT_PLANNED', 'DUPLICATE']) {
    const { mutations } = await statusSync({ status: '📤 Pending Release', state: 'CLOSED', stateReason })
    assert.equal(mutations.length, 0, `reason ${stateReason}`)
  }
})

test('Pending Release in dry-run does not write', async () => {
  const { mutations, results } = await statusSync({ status: '📤 Pending Release', state: 'OPEN' }, { dryRun: true })
  assert.equal(mutations.length, 0)
  assert.deepEqual(results, ['dry-run-no-write'])
})

test('Pending Deploy is always open: it reopens a closed issue and leaves an open one alone', async () => {
  const closed = await statusSync({ status: '📡 Pending Deploy', state: 'CLOSED', stateReason: 'COMPLETED' })
  assert.equal(closed.mutations.length, 1)
  assert.match(closed.mutations[0]!.query, /reopenIssue/)
  const open = await statusSync({ status: '📡 Pending Deploy', state: 'OPEN' })
  assert.equal(open.mutations.length, 0)
})

test('Done and Canceled keep their previous behavior', async () => {
  const done = await statusSync({ status: '🏆 Done', state: 'OPEN' })
  assert.equal(done.mutations[0]!.vars.reason, 'COMPLETED')
  const doneSync = await statusSync({ status: '🏆 Done', state: 'CLOSED', stateReason: 'COMPLETED' })
  assert.equal(doneSync.mutations.length, 0)
  const canceled = await statusSync({ status: '❌ Canceled', state: 'OPEN' })
  assert.equal(canceled.mutations[0]!.vars.reason, 'NOT_PLANNED')
})

test('Done re-closes an issue that was closed for another reason', async () => {
  const { mutations } = await statusSync({ status: '🏆 Done', state: 'CLOSED', stateReason: 'NOT_PLANNED' })
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0]!.vars.reason, 'COMPLETED')
})

test('Other statuses reopen a closed issue and leave an open one alone', async () => {
  for (const status of ['🌱 In Progress', '🧪 In Review', '💎 Ready', '⏳ Paused']) {
    const closed = await statusSync({ status, state: 'CLOSED', stateReason: 'COMPLETED' })
    assert.equal(closed.mutations.length, 1, status)
    assert.match(closed.mutations[0]!.query, /reopenIssue/)
    const open = await statusSync({ status, state: 'OPEN' })
    assert.equal(open.mutations.length, 0, status)
  }
})

test('items of another project, non-items and draft items are skipped', async () => {
  const other = await statusSync({ status: '🏆 Done', state: 'OPEN', project: 'PVT_other' })
  assert.deepEqual([other.mutations.length, other.results], [0, ['skipped-different-project']])
  const notItem = await statusSync({ status: '🏆 Done', state: 'OPEN', typename: 'Issue' })
  assert.deepEqual([notItem.mutations.length, notItem.results], [0, ['skipped-not-a-project-item']])
  const draft = await statusSync({ status: '🏆 Done', content: { __typename: 'DraftIssue' } })
  assert.deepEqual([draft.mutations.length, draft.results], [0, ['skipped-no-linked-issue']])
})

test('malformed or missing inputs fail before any call', async () => {
  for (const inputs of [{ itemNodeId: 'x; y' }, { projectId: '' }, { itemNodeId: 'null' }, { sourceRepository: 'not a repo' }]) {
    const r = await statusSync({ status: '🏆 Done', state: 'OPEN' }, inputs)
    assert.equal(r.mutations.length, 0, JSON.stringify(inputs))
    assert.equal(r.logs.failed.length, 1, JSON.stringify(inputs))
  }
})

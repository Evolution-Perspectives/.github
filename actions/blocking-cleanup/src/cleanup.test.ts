// Tests for the blocking-cleanup action: the source is imported directly and run against fakes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { cleanup, type Inputs } from './cleanup.ts'

const ref = (repo: string, number: number) => ({
  id: `ID_${repo}_${number}`,
  number,
  title: `t${number}`,
  state: 'OPEN',
  repository: { nameWithOwner: `org/${repo}` }
})

interface Scenario {
  blocking?: ReturnType<typeof ref>[]
  blockedBy?: ReturnType<typeof ref>[]
  failOn?: string[]
  inputs?: Partial<Inputs>
}

// `blocking` = issues the closed issue blocks; `blockedBy` = issues that block it.
async function run({ blocking = [], blockedBy = [], failOn = [], inputs = {} }: Scenario) {
  const closed = { id: 'ID_closed', number: 1, title: 'closed', repository: { nameWithOwner: 'org/app' } }
  const f = fakes(
    (query) => {
      const field = /\bblockedBy\(/.test(query) ? 'blockedBy' : 'blocking'
      const nodes = field === 'blockedBy' ? blockedBy : blocking
      return { node: { ...closed, [field]: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } }
    },
    (_query, vars) => {
      if (failOn.includes(`${vars.issueId}>${vars.blockingIssueId}`)) throw new Error('boom')
      return {}
    }
  )
  await cleanup(f, { issueNodeId: 'ID_closed', sourceRepository: 'org/app', dryRun: false, debug: false, ...inputs })
  const removals = f.mutations.map((m) => ({ issueId: m.vars.issueId, blockingIssueId: m.vars.blockingIssueId }))
  return { removals, logs: f.logs }
}

test('removes the issues it blocks: blocked issue is the target, closed issue the blocker', async () => {
  const { removals } = await run({ blocking: [ref('app', 2), ref('app', 3)] })
  assert.deepEqual(removals, [
    { issueId: 'ID_app_2', blockingIssueId: 'ID_closed' },
    { issueId: 'ID_app_3', blockingIssueId: 'ID_closed' }
  ])
})

test('also removes its own blocked-by links: closed issue is the target', async () => {
  const { removals } = await run({ blockedBy: [ref('app', 9)] })
  assert.deepEqual(removals, [{ issueId: 'ID_closed', blockingIssueId: 'ID_app_9' }])
})

test('removes both directions in one run', async () => {
  const { removals } = await run({ blocking: [ref('app', 2)], blockedBy: [ref('app', 9)] })
  assert.equal(removals.length, 2)
})

test('a failing edge is warned about and the others are still removed', async () => {
  const { removals, logs } = await run({ blocking: [ref('app', 2)], blockedBy: [ref('app', 9)], failOn: ['ID_app_2>ID_closed'] })
  assert.deepEqual(removals, [{ issueId: 'ID_closed', blockingIssueId: 'ID_app_9' }])
  assert.equal(logs.warning.length, 1)
})

test('no edges means no write', async () => {
  const { removals, logs } = await run({})
  assert.equal(removals.length, 0)
  assert.ok(logs.summary.some((l) => l.startsWith('Removed edges: 0')))
})

test('a malformed node id is rejected before any call', async () => {
  const { removals, logs } = await run({ blocking: [ref('app', 2)], inputs: { issueNodeId: "x'; throw 1; //" } })
  assert.equal(removals.length, 0)
  assert.equal(logs.failed.length, 1)
})

test('dry-run lists the edges and removes nothing', async () => {
  const { removals, logs } = await run({ blocking: [ref('app', 2)], blockedBy: [ref('app', 9)], inputs: { dryRun: true } })
  assert.equal(removals.length, 0)
  assert.equal(logs.failed.length, 0)
  assert.ok(logs.summary.some((l) => l.startsWith('Dry run: nothing removed, 2 edge(s)')))
})

test('a missing or malformed source repository is handled', async () => {
  const bad = await run({ inputs: { sourceRepository: 'not a repo' } })
  assert.equal(bad.logs.failed.length, 1)
  const unknown = await run({ inputs: { sourceRepository: 'unknown' } })
  assert.equal(unknown.logs.failed.length, 0)
})

test('an unknown issue fails the run', async () => {
  const f = fakes(() => ({ node: null }))
  await cleanup(f, { issueNodeId: 'ID_gone', sourceRepository: '', dryRun: false, debug: false })
  assert.equal(f.logs.failed.length, 1)
  assert.equal(f.mutations.length, 0)
})

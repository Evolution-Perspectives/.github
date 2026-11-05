// Tests of the whole sweep against a stateful fake of the project.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { DEFAULT_OPTIONS, makeBoard, type BoardSpec } from './board.testkit.ts'
import { parseConfig } from './config.ts'
import type { Config } from './model.ts'
import { sweep } from './sweep.ts'

const NOW = Date.parse('2026-11-05T02:00:00Z')
const noSleep = async () => {}
const config = (over: Partial<Config> = {}): Config => ({ projectId: 'PVT_x', dryRun: false, debug: false, maxWrites: 50, recentMs: 10 * 60 * 1000, pauseMs: 0, closePauseMs: 0, ...over })

/** A board with one of each kind of drift. */
const drift = (extra: Partial<BoardSpec> = {}): BoardSpec => ({
  issues: [
    { id: 'I_1', number: 1, state: 'OPEN' }, // Done but still open -> close
    { id: 'I_2', number: 2, state: 'CLOSED', stateReason: 'COMPLETED' }, // closed in the UI, Status In Progress -> Done
    { id: 'I_3', number: 3, state: 'CLOSED', stateReason: 'NOT_PLANNED' }, // -> Canceled
    { id: 'I_4', number: 4, state: 'OPEN', blockedBy: ['I_1', 'X_closed', 'I_5'] }, // blocked by I_1 (closed by the sweep) and X_closed
    { id: 'I_5', number: 5, state: 'OPEN' }, // stays open: its link is kept
    { id: 'I_6', number: 6, state: 'CLOSED', stateReason: 'COMPLETED' } // Canceled by a human: mismatch, untouched
  ],
  items: [
    { id: 'PVTI_1', issue: 'I_1', status: '🏆 Done' },
    { id: 'PVTI_2', issue: 'I_2', status: '🌱 In Progress' },
    { id: 'PVTI_3', issue: 'I_3', status: '🌱 In Progress' },
    { id: 'PVTI_4', issue: 'I_4', status: '🌱 In Progress' },
    { id: 'PVTI_5', issue: 'I_5', status: '📦 Backlog' },
    { id: 'PVTI_6', issue: 'I_6', status: '❌ Canceled' }
  ],
  external: [{ id: 'X_closed', number: 99, state: 'CLOSED' }],
  ...extra
})

async function run(spec: BoardSpec, cfg: Config, board = makeBoard(spec)) {
  const f = fakes(() => ({}))
  await sweep({ graphql: board.graphql, core: f.core }, cfg, { now: NOW, sleep: noSleep })
  return { board, logs: f.logs }
}

test('dry-run plans everything and writes nothing', async () => {
  const { board, logs } = await run(drift(), config({ dryRun: true }))
  assert.equal(board.mutations.length, 0)
  assert.ok(logs.summary.includes('Mode: DRY RUN, nothing was written'))
  assert.ok(logs.summary.some((l) => l.startsWith('Planned writes: 5 ')))
  assert.ok(logs.info.some((l) => l.startsWith('[dry-run] Would close org/app#1')))
  assert.ok(logs.summary.some((l) => l.includes('org/app#6: Status ❌ Canceled but closed as COMPLETED')))
  assert.equal(logs.failed.length, 0)
})

test('a real run applies the three stages in order and a later stage sees an earlier one', async () => {
  const { board, logs } = await run(drift(), config())
  assert.deepEqual(board.mutations.map((m) => m.kind), ['close', 'status', 'status', 'unblock', 'unblock'])
  assert.equal(board.issues.get('I_1')!.state, 'CLOSED')
  assert.equal(board.items.get('PVTI_2')!.status, '🏆 Done')
  assert.equal(board.items.get('PVTI_3')!.status, '❌ Canceled')
  assert.deepEqual(board.issues.get('I_4')!.blockedBy, ['I_5']) // closed I_1 and X_closed gone, open I_5 kept
  assert.equal(board.items.get('PVTI_6')!.status, '❌ Canceled') // mismatch untouched
  assert.equal(logs.failed.length, 0)
})

test('the second run on the resulting state plans zero writes (idempotence)', async () => {
  const board = makeBoard(drift())
  await run(drift(), config(), board)
  const before = board.mutations.length
  const second = await run(drift(), config(), board)
  assert.equal(board.mutations.length, before)
  assert.ok(second.logs.summary.some((l) => l.startsWith('Planned writes: 0 ')))
})

test('a plan over the cap writes nothing and fails a real run', async () => {
  const { board, logs } = await run(drift(), config({ maxWrites: 3 }))
  assert.equal(board.mutations.length, 0)
  assert.equal(logs.failed.length, 1)
  assert.match(logs.failed[0]!, /Planned 5 write\(s\), above the cap of 3/)
})

test('a dry-run over the cap warns instead of failing', async () => {
  const { board, logs } = await run(drift(), config({ dryRun: true, maxWrites: 3 }))
  assert.equal(board.mutations.length, 0)
  assert.equal(logs.failed.length, 0)
  assert.equal(logs.warning.length, 1)
})

test('one failing write does not stop the others, does not cascade and fails the run', async () => {
  const spec = drift({ failOn: (q, vars) => /closeIssue/.test(q) && vars.issueId === 'I_1' })
  const { board, logs } = await run(spec, config())
  assert.equal(board.issues.get('I_1')!.state, 'OPEN') // the failed close left the item unchanged
  assert.equal(board.items.get('PVTI_2')!.status, '🏆 Done') // the others were processed
  // I_1 is still open, so its blocking link must not be removed (no work planned on a false assumption)
  assert.deepEqual(board.issues.get('I_4')!.blockedBy, ['I_1', 'I_5'])
  assert.equal(logs.warning.length, 1)
  assert.deepEqual(logs.failed, ['1 write(s) failed.'])
  assert.ok(logs.summary.some((l) => l.startsWith('Failures: 1')))
})

test('a missing Status option fails before any write', async () => {
  const options = { ...DEFAULT_OPTIONS }
  delete options['🏆 Done']
  const { board, logs } = await run(drift({ options }), config())
  assert.equal(board.mutations.length, 0)
  assert.match(logs.failed[0]!, /Status option "🏆 Done" not found/)
})

test('recently edited items are skipped and listed', async () => {
  const spec = drift()
  spec.items[0]!.updatedAt = new Date(NOW - 60 * 1000).toISOString()
  const { board, logs } = await run(spec, config())
  assert.equal(board.issues.get('I_1')!.state, 'OPEN')
  assert.ok(logs.summary.includes('- skipped org/app#1: recently edited'))
})

test('the whole project is read across pages once per run', async () => {
  const { board } = await run(drift({ pageSize: 2 }), config({ dryRun: true }))
  assert.equal(board.reads, 3) // 6 items, 2 per page
})

test('drafts and pull requests are ignored', async () => {
  const board = makeBoard(drift())
  const base = board.graphql
  board.graphql = (async (query: string, vars?: Record<string, unknown>) => {
    const res = (await base(query, vars)) as { node?: { items?: { nodes: { content: unknown }[] } } }
    if (res.node?.items) res.node.items.nodes.push({ id: 'PVTI_draft', updatedAt: '2020-01-01T00:00:00Z', fieldValueByName: null, content: { __typename: 'DraftIssue' } } as never)
    return res
  }) as typeof base
  const { logs } = await run(drift(), config({ dryRun: true }), board)
  assert.ok(logs.summary.includes('Items read: 6'))
})

test('the configuration is validated and safe by default', () => {
  const raw = { projectId: 'PVT_x', dryRun: '', debug: '', maxWrites: '', recentMinutes: '', pauseMs: '' }
  const c = parseConfig(raw)
  assert.deepEqual([c.dryRun, c.maxWrites, c.recentMs, c.pauseMs, c.closePauseMs], [true, 50, 600000, 250, 4000])
  assert.equal(parseConfig({ ...raw, dryRun: 'false' }).dryRun, false)
  assert.equal(parseConfig({ ...raw, dryRun: 'true' }).dryRun, true)
  for (const bad of [{ projectId: '' }, { projectId: 'a b' }, { maxWrites: '-1' }, { maxWrites: 'x' }, { maxWrites: '1.5' }, { recentMinutes: '-2' }, { pauseMs: 'x' }, { closePauseMs: '-1' }]) {
    assert.throws(() => parseConfig({ ...raw, ...bad }), Error, JSON.stringify(bad))
  }
})

test('closes are paced more slowly than other writes because each one fires workflows in its repository', async () => {
  const sleeps: number[] = []
  const board = makeBoard(drift())
  const f = fakes(() => ({}))
  await sweep({ graphql: board.graphql, core: f.core }, config({ pauseMs: 10, closePauseMs: 500 }), { now: NOW, sleep: async (ms) => { sleeps.push(ms) } })
  // writes in order: close, status, status, unblock, unblock -> the pause after the close is the long one
  assert.deepEqual(sleeps, [500, 10, 10, 10])
})

// Tests of the three planners: one scenario of the spec per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Item, Snapshot } from './model.ts'
import { STATUS, applyWrite, planAll, planBlocking, planClose, planStatus } from './plan.ts'

const NOW = Date.parse('2026-11-05T02:00:00Z')
const OLD = '2020-01-01T00:00:00Z'
const ctx = { now: NOW, recentMs: 10 * 60 * 1000 }
const OPTIONS: Record<string, string> = Object.fromEntries(Object.values(STATUS).map((name, i) => [name, `opt-${i}`]))

interface ItemSpec {
  n: number
  status: string | null
  state: 'OPEN' | 'CLOSED'
  reason?: string | null
  updatedAt?: string
  blockedBy?: { id: string; state: string }[]
}

function snapshot(specs: ItemSpec[]): Snapshot {
  const items: Item[] = specs.map((s) => ({
    id: `PVTI_${s.n}`,
    updatedAt: s.updatedAt ?? OLD,
    status: s.status,
    issue: {
      id: `I_${s.n}`,
      number: s.n,
      ref: `org/app#${s.n}`,
      state: s.state,
      stateReason: s.reason ?? null,
      updatedAt: s.updatedAt ?? OLD,
      blockedBy: (s.blockedBy ?? []).map((b) => ({ id: b.id, ref: `org/app#${b.id}`, state: b.state }))
    }
  }))
  return { projectId: 'PVT_x', statusField: { id: 'F', options: { ...OPTIONS } }, items, truncated: [] }
}

// ---------- close stage

test('an open issue with Done or Pending Release is closed as completed, with Canceled as not planned', () => {
  const plan = planClose(snapshot([
    { n: 1, status: STATUS.done, state: 'OPEN' },
    { n: 2, status: STATUS.pendingRelease, state: 'OPEN' },
    { n: 3, status: STATUS.canceled, state: 'OPEN' }
  ]), ctx)
  assert.deepEqual(plan.writes.map((w) => w.type === 'close' && [w.ref, w.reason]), [
    ['org/app#1', 'COMPLETED'],
    ['org/app#2', 'COMPLETED'],
    ['org/app#3', 'NOT_PLANNED']
  ])
})

test('a closed issue is never reopened, whatever its Status', () => {
  const plan = planClose(snapshot([
    { n: 1, status: '🌱 In Progress', state: 'CLOSED', reason: 'COMPLETED' },
    { n: 2, status: null, state: 'CLOSED', reason: 'COMPLETED' },
    { n: 3, status: STATUS.pendingRelease, state: 'CLOSED', reason: 'NOT_PLANNED' }
  ]), ctx)
  assert.equal(plan.writes.length, 0)
})

test('open issues with a non-closing Status are left alone', () => {
  const plan = planClose(snapshot([{ n: 1, status: '🌱 In Progress', state: 'OPEN' }, { n: 2, status: null, state: 'OPEN' }]), ctx)
  assert.equal(plan.writes.length, 0)
})

// ---------- status stage

test('closed from In Review sets Pending Release, closed completed elsewhere sets Done', () => {
  const plan = planStatus(snapshot([
    { n: 1, status: STATUS.inReview, state: 'CLOSED', reason: 'COMPLETED' },
    { n: 2, status: '🌱 In Progress', state: 'CLOSED', reason: 'COMPLETED' },
    { n: 3, status: null, state: 'CLOSED', reason: 'COMPLETED' }
  ]), ctx)
  assert.deepEqual(plan.writes.map((w) => w.type === 'status' && [w.ref, w.optionName]), [
    ['org/app#1', STATUS.pendingRelease],
    ['org/app#2', STATUS.done],
    ['org/app#3', STATUS.done]
  ])
})

test('closed as not planned or duplicate sets Canceled', () => {
  const plan = planStatus(snapshot([
    { n: 1, status: '🌱 In Progress', state: 'CLOSED', reason: 'NOT_PLANNED' },
    { n: 2, status: STATUS.inReview, state: 'CLOSED', reason: 'DUPLICATE' }
  ]), ctx)
  assert.deepEqual(plan.writes.map((w) => w.type === 'status' && w.optionName), [STATUS.canceled, STATUS.canceled])
})

test('a closing Status is kept, and a disagreement with the close reason is reported, not changed', () => {
  const plan = planStatus(snapshot([
    { n: 1, status: STATUS.pendingRelease, state: 'CLOSED', reason: 'COMPLETED' },
    { n: 2, status: STATUS.done, state: 'CLOSED', reason: 'COMPLETED' },
    { n: 3, status: STATUS.canceled, state: 'CLOSED', reason: 'COMPLETED' },
    { n: 4, status: STATUS.done, state: 'CLOSED', reason: 'NOT_PLANNED' },
    { n: 5, status: STATUS.done, state: 'CLOSED', reason: 'DUPLICATE' }
  ]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.deepEqual(plan.mismatches.map((m) => m.ref), ['org/app#3', 'org/app#4', 'org/app#5'])
})

test('an unknown close reason is skipped and listed', () => {
  const plan = planStatus(snapshot([{ n: 1, status: null, state: 'CLOSED', reason: null }, { n: 2, status: null, state: 'CLOSED', reason: 'REOPENED' }]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.equal(plan.skipped.length, 2)
})

test('a missing Status option throws instead of planning a write', () => {
  const snap = snapshot([{ n: 1, status: null, state: 'CLOSED', reason: 'COMPLETED' }])
  delete snap.statusField.options[STATUS.done]
  assert.throws(() => planStatus(snap, ctx), /Status option .* not found/)
})

// ---------- blocking stage

test('a link to a closed blocker is removed, a link to an open blocker is kept', () => {
  const plan = planBlocking(snapshot([
    { n: 1, status: null, state: 'OPEN', blockedBy: [{ id: 'X_closed', state: 'CLOSED' }, { id: 'X_open', state: 'OPEN' }] }
  ]), ctx)
  assert.deepEqual(plan.writes.map((w) => w.type === 'unblock' && w.blockingIssueId), ['X_closed'])
})

test('links of closed blocked issues are removed too', () => {
  const plan = planBlocking(snapshot([{ n: 1, status: STATUS.done, state: 'CLOSED', reason: 'COMPLETED', blockedBy: [{ id: 'X_closed', state: 'CLOSED' }] }]), ctx)
  assert.equal(plan.writes.length, 1)
})

test('a blocker closed by the close stage of the same run counts as closed', () => {
  const snap = snapshot([
    { n: 1, status: STATUS.done, state: 'OPEN' }, // will be closed by the close stage
    { n: 2, status: null, state: 'OPEN', blockedBy: [{ id: 'I_1', state: 'OPEN' }] } // stale view of the blocker
  ])
  assert.equal(planBlocking(snap, ctx).writes.length, 0) // before the close, the blocker is open
  const stages = planAll(snap, ctx)
  assert.deepEqual(stages.map((s) => [s.name, s.writes.length]), [['close', 1], ['status', 0], ['blocking', 1]])
  assert.equal(snap.items[0]!.issue.state, 'OPEN') // planAll works on a copy
})

// ---------- skipping and application

test('recently edited items are skipped and listed in every stage', () => {
  const recent = new Date(NOW - 2 * 60 * 1000).toISOString()
  const snap = snapshot([
    { n: 1, status: STATUS.done, state: 'OPEN', updatedAt: recent },
    { n: 2, status: null, state: 'CLOSED', reason: 'COMPLETED', updatedAt: recent },
    { n: 3, status: null, state: 'OPEN', updatedAt: recent, blockedBy: [{ id: 'X', state: 'CLOSED' }] }
  ])
  for (const plan of [planClose(snap, ctx), planStatus(snap, ctx), planBlocking(snap, ctx)]) {
    assert.equal(plan.writes.length, 0)
    assert.equal(plan.skipped.length, 1)
  }
})

test('applyWrite patches the snapshot for each write type', () => {
  const snap = snapshot([
    { n: 1, status: STATUS.done, state: 'OPEN' },
    { n: 2, status: null, state: 'CLOSED', reason: 'COMPLETED', blockedBy: [{ id: 'X', state: 'CLOSED' }] }
  ])
  for (const stage of planAll(snap, ctx)) for (const w of stage.writes) applyWrite(snap, w)
  assert.equal(snap.items[0]!.issue.state, 'CLOSED')
  assert.equal(snap.items[1]!.status, STATUS.done)
  assert.equal(snap.items[1]!.issue.blockedBy.length, 0)
})

// Tests of the four planners: one scenario of the spec per test.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Item, Snapshot } from './model.ts'
import { STATUS, applyWrite, planAll, planBlocking, planClose, planEndDate, planStatus, sprintEnd } from './plan.ts'

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
  return { projectId: 'PVT_x', statusField: { id: 'F', options: { ...OPTIONS } }, endDateField: { id: 'D' }, items, truncated: [] }
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
  assert.deepEqual(stages.map((s) => [s.name, s.writes.length]), [['close', 1], ['status', 0], ['blocking', 1], ['endDate', 0]])
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

// ---------- end date stage

interface TreeSpec {
  n: number
  type?: string | null
  state?: 'OPEN' | 'CLOSED'
  subs?: number[]
  sprint?: { startDate: string; duration: number } | null
  endDate?: string | null
  updatedAt?: string
}

const S = (startDate: string) => ({ startDate, duration: 7 })

function tree(specs: TreeSpec[]): Snapshot {
  const items: Item[] = specs.map((s) => ({
    id: `PVTI_${s.n}`,
    updatedAt: s.updatedAt ?? OLD,
    status: null,
    sprint: s.sprint ?? null,
    endDate: s.endDate ?? null,
    issue: {
      id: `I_${s.n}`,
      number: s.n,
      ref: `org/app#${s.n}`,
      state: s.state ?? 'OPEN',
      stateReason: null,
      updatedAt: s.updatedAt ?? OLD,
      blockedBy: [],
      issueType: s.type ?? null,
      subIssueIds: (s.subs ?? []).map((n) => `I_${n}`)
    }
  }))
  return { projectId: 'PVT_x', statusField: { id: 'F', options: { ...OPTIONS } }, endDateField: { id: 'D' }, items, truncated: [] }
}

const endWrites = (plan: ReturnType<typeof planEndDate>) => plan.writes.map((w) => w.type === 'endDate' && [w.ref, w.from, w.to])

test('a sprint ends on its start date plus its duration minus one day', () => {
  assert.equal(sprintEnd('2027-01-22', 7), '2027-01-28') // Sprint 12
  assert.equal(sprintEnd('2026-11-06', 7), '2026-11-12') // Sprint 1
  assert.equal(sprintEnd('2026-12-28', 7), '2027-01-03') // across a year boundary
  assert.equal(sprintEnd('2027-02-26', 7), '2027-03-04') // across a month boundary
})

test('the latest sprint among the leaves sets the End date of an open Projet', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2, 3, 4] },
    { n: 2, sprint: S('2026-11-20') },
    { n: 3, sprint: S('2027-01-22') },
    { n: 4 }
  ]), ctx)
  assert.deepEqual(endWrites(plan), [['org/app#1', null, '2027-01-28']])
})

test('leaves are found at any depth and parents are ignored even when they carry a sprint', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2] },
    { n: 2, subs: [3], sprint: S('2027-06-04') }, // a parent: its sprint does not count
    { n: 3, subs: [4, 5] },
    { n: 4, sprint: S('2026-12-04') },
    { n: 5, sprint: S('2026-12-11') }
  ]), ctx)
  assert.deepEqual(endWrites(plan), [['org/app#1', null, '2026-12-17']])
})

test('a hand-set End date is overwritten, later or earlier', () => {
  const later = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2], endDate: '2026-12-17' },
    { n: 2, sprint: S('2027-01-22') }
  ]), ctx)
  assert.deepEqual(endWrites(later), [['org/app#1', '2026-12-17', '2027-01-28']])
  const earlier = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2], endDate: '2027-09-30' },
    { n: 2, sprint: S('2026-11-06') }
  ]), ctx)
  assert.deepEqual(endWrites(earlier), [['org/app#1', '2027-09-30', '2026-11-12']])
})

test('an End date that already matches plans nothing', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2], endDate: '2026-11-12' },
    { n: 2, sprint: S('2026-11-06') }
  ]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.equal(plan.skipped.length, 0)
})

test('a project without a planned leaf is left untouched, never cleared, and listed', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2, 3], endDate: '2026-05-29' },
    { n: 2 },
    { n: 3, state: 'CLOSED' },
    { n: 4, type: 'Projet', endDate: '2026-06-01', sprint: S('2026-11-06') } // no sub-issues: no leaf, its own sprint is not one
  ]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.deepEqual(plan.skipped.map((s) => [s.ref, s.reason]), [['org/app#1', 'no planned leaf'], ['org/app#4', 'no planned leaf']])
})

test('closed projects, other types and untyped issues are not touched', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', state: 'CLOSED', subs: [4] },
    { n: 2, type: 'Tâche', subs: [4] },
    { n: 3, subs: [4] },
    { n: 4, sprint: S('2026-11-06') }
  ]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.equal(plan.skipped.length, 0)
})

test('a closed leaf with a sprint counts, a sub-issue outside the project is an unplanned leaf, a cycle ends', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2, 99, 3] },
    { n: 2, state: 'CLOSED', sprint: S('2026-11-06') },
    { n: 3, subs: [1, 3] } // points back to the project and to itself
  ]), ctx)
  assert.deepEqual(endWrites(plan), [['org/app#1', null, '2026-11-12']])
})

test('a recently edited project is skipped and listed', () => {
  const plan = planEndDate(tree([
    { n: 1, type: 'Projet', subs: [2], updatedAt: new Date(NOW - 60 * 1000).toISOString() },
    { n: 2, sprint: S('2026-11-06') }
  ]), ctx)
  assert.equal(plan.writes.length, 0)
  assert.deepEqual(plan.skipped, [{ ref: 'org/app#1', reason: 'recently edited' }])
})

test('planAll runs the end date stage last and a project closed by the close stage is not written', () => {
  const snap = tree([
    { n: 1, type: 'Projet', subs: [3] },
    { n: 2, type: 'Projet', subs: [3] },
    { n: 3, sprint: S('2026-11-06') }
  ])
  snap.items[0]!.status = STATUS.done // open but Done: the close stage closes it
  const stages = planAll(snap, ctx)
  assert.deepEqual(stages.map((s) => s.name), ['close', 'status', 'blocking', 'endDate'])
  assert.deepEqual(endWrites(stages[3]!), [['org/app#2', null, '2026-11-12']])
})

test('applyWrite patches the End date so a second plan is empty', () => {
  const snap = tree([{ n: 1, type: 'Projet', subs: [2] }, { n: 2, sprint: S('2026-11-06') }])
  const plan = planEndDate(snap, ctx)
  for (const w of plan.writes) applyWrite(snap, w)
  assert.equal(planEndDate(snap, ctx).writes.length, 0)
})

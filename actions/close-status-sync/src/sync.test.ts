// Tests for the close-status-sync action (issue close -> project Status), run against fakes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { statusSync } from '../../close-state-sync/src/sync.testkit.ts'
import { closeStatusSync, type Inputs } from './sync.ts'

const PROJECT = 'PVT_kwDOtestproject'

const OPTION = { done: 'opt-done', canceled: 'opt-canceled', pendingRelease: 'opt-pending-release' }

interface Field {
  id: string
  options: { id: string; name: string }[]
}

const STATUS_FIELD: Field = {
  id: 'PVTSSF_status',
  options: [
    { id: OPTION.done, name: '🏆 Done' },
    { id: OPTION.canceled, name: '❌ Canceled' },
    { id: OPTION.pendingRelease, name: '📤 Pending Release' },
    { id: 'opt-in-review', name: '🧪 In Review' }
  ]
}

interface Opts {
  status: string | null
  optionId?: string
  statusField?: Field | null
  node?: unknown
}

const baseInputs = (stateReason: string): Inputs => ({
  issueNodeId: 'I_issue1',
  stateReason,
  sourceRepository: 'org/repo',
  projectId: PROJECT,
  dryRun: false,
  debug: false
})

/** Runs the action on an issue tracked in the project with the given current Status. */
async function closeSync(stateReason: string, opts: Opts, inputs: Partial<Inputs> = {}) {
  const { status, optionId = 'x', statusField = STATUS_FIELD, node } = opts
  const f = fakes((query) => {
    if (/field\(name: "Status"\)/.test(query)) return { node: { field: statusField } }
    if (node !== undefined) return { node }
    return {
      node: {
        __typename: 'Issue',
        id: 'I_issue1',
        number: 7,
        repository: { nameWithOwner: 'org/repo' },
        projectItems: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [{ id: 'PVTI_item1', project: { id: PROJECT }, fieldValueByName: status ? { optionId, name: status } : null }]
        }
      }
    }
  })
  await closeStatusSync(f, { ...baseInputs(stateReason), ...inputs })
  const results = f.logs.summary.map((l) => /^Status: (skipped-.+|updated|dry-run-no-write)$/.exec(l)?.[1]).filter((r): r is string => Boolean(r))
  return { mutations: f.mutations, logs: f.logs, results }
}

test('closing from In Review sets Pending Release', async () => {
  const { mutations } = await closeSync('completed', { status: '🧪 In Review', optionId: 'opt-in-review' })
  assert.equal(mutations.length, 1)
  assert.equal(mutations[0]!.vars.optionId, OPTION.pendingRelease)
})

test('closing never overwrites Pending Release', async () => {
  const { mutations, results } = await closeSync('completed', { status: '📤 Pending Release', optionId: OPTION.pendingRelease })
  assert.equal(mutations.length, 0)
  assert.ok(results.includes('skipped-keep-pending-release'))
})

test('closing from any other status still sets Done', async () => {
  for (const status of ['🌱 In Progress', '💎 Ready', '📡 Pending Deploy', '📦 Backlog', null]) {
    const { mutations } = await closeSync('completed', { status })
    assert.equal(mutations.length, 1, String(status))
    assert.equal(mutations[0]!.vars.optionId, OPTION.done, String(status))
  }
})

test('closing when already Done writes nothing', async () => {
  const { mutations } = await closeSync('completed', { status: '🏆 Done', optionId: OPTION.done })
  assert.equal(mutations.length, 0)
})

test('not planned and duplicate close to Canceled, even from Pending Release or In Review', async () => {
  for (const stateReason of ['not_planned', 'duplicate']) {
    for (const status of ['📤 Pending Release', '🧪 In Review', '🌱 In Progress']) {
      const { mutations } = await closeSync(stateReason, { status })
      assert.equal(mutations.length, 1, `${stateReason} ${status}`)
      assert.equal(mutations[0]!.vars.optionId, OPTION.canceled, `${stateReason} ${status}`)
    }
  }
})

test('close from In Review in dry-run does not write', async () => {
  const { mutations } = await closeSync('completed', { status: '🧪 In Review' }, { dryRun: true })
  assert.equal(mutations.length, 0)
})

test('unrecognized close reason writes nothing', async () => {
  const { mutations } = await closeSync('something_else', { status: '🧪 In Review' })
  assert.equal(mutations.length, 0)
})

test('the close reason is matched case-insensitively', async () => {
  const { mutations } = await closeSync('COMPLETED', { status: '🌱 In Progress' })
  assert.equal(mutations[0]!.vars.optionId, OPTION.done)
})

test('the Status field and option IDs are resolved live by name, not stored in the code', async () => {
  const { mutations } = await closeSync('completed', { status: '🌱 In Progress' })
  assert.equal(mutations[0]!.vars.fieldId, 'PVTSSF_status')
  const renumbered: Field = { id: 'PVTSSF_other', options: STATUS_FIELD.options.map((o) => ({ ...o, id: `${o.id}x` })) }
  const live = await closeSync('completed', { status: '🌱 In Progress', statusField: renumbered })
  assert.equal(live.mutations[0]!.vars.fieldId, 'PVTSSF_other')
  assert.equal(live.mutations[0]!.vars.optionId, `${OPTION.done}x`)
})

test('a missing Status option fails before any write', async () => {
  const incomplete: Field = { id: 'PVTSSF_status', options: STATUS_FIELD.options.filter((o) => o.name !== '🏆 Done') }
  const { mutations, logs } = await closeSync('completed', { status: '🌱 In Progress', statusField: incomplete })
  assert.equal(mutations.length, 0)
  assert.equal(logs.failed.length, 1)
})

test('an issue not tracked in the project, or not an issue, is skipped', async () => {
  const notTracked = await closeSync('completed', {
    status: null,
    node: { __typename: 'Issue', id: 'I_issue1', number: 7, repository: { nameWithOwner: 'org/repo' }, projectItems: { pageInfo: { hasNextPage: false }, nodes: [] } }
  })
  assert.deepEqual([notTracked.mutations.length, notTracked.results], [0, ['skipped-not-in-project']])
  const notIssue = await closeSync('completed', { status: null, node: { __typename: 'PullRequest' } })
  assert.deepEqual([notIssue.mutations.length, notIssue.results], [0, ['skipped-not-an-issue']])
})

test('malformed or missing inputs fail before any call', async () => {
  for (const inputs of [{ issueNodeId: 'x; y' }, { issueNodeId: '' }, { projectId: '' }, { sourceRepository: 'not a repo' }]) {
    const r = await closeSync('completed', { status: '🌱 In Progress' }, inputs)
    assert.equal(r.mutations.length, 0, JSON.stringify(inputs))
    assert.equal(r.logs.failed.length, 1, JSON.stringify(inputs))
  }
})

// ---------- with close-state-sync: the two directions must not loop ----------

test('closing from In Review then syncing the new Status does not reopen or rewrite', async () => {
  // 1. issue closed while In Review -> Status becomes Pending Release
  const first = await closeSync('completed', { status: '🧪 In Review' })
  assert.equal(first.mutations[0]!.vars.optionId, OPTION.pendingRelease)
  // 2. the Status change fires the other action; the issue is closed (completed)
  const second = await statusSync({ status: '📤 Pending Release', state: 'CLOSED', stateReason: 'COMPLETED' })
  assert.equal(second.mutations.length, 0)
})

test('setting Pending Release on an open issue closes it and the close does not overwrite the Status', async () => {
  const closeIt = await statusSync({ status: '📤 Pending Release', state: 'OPEN' })
  assert.match(closeIt.mutations[0]!.query, /closeIssue/)
  const afterClose = await closeSync('completed', { status: '📤 Pending Release', optionId: OPTION.pendingRelease })
  assert.equal(afterClose.mutations.length, 0)
})

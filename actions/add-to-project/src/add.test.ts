// Tests for the add-to-project action: the source is imported directly and run against fakes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { addToProject, type Inputs } from './add.ts'

const PROJECT = 'PVT_kwDOtest'
const FIELD = { id: 'PVTSSF_status', options: [{ id: 'opt-backlog', name: '📦 Backlog' }, { id: 'opt-ready', name: '💎 Ready' }] }

interface Scenario {
  inputs?: Partial<Inputs>
  inProject?: boolean
  field?: typeof FIELD | null
  issue?: unknown
}

async function run({ inputs = {}, inProject = false, field = FIELD, issue }: Scenario) {
  const f = fakes(
    (query) => {
      if (/field\(name: "Status"\)/.test(query)) return { node: { field } }
      if (issue !== undefined) return { node: issue }
      return {
        node: {
          id: 'I_1',
          number: 5,
          repository: { nameWithOwner: 'org/app' },
          projectItems: { nodes: inProject ? [{ project: { id: PROJECT } }] : [] }
        }
      }
    },
    (query) => (/addProjectV2ItemById/.test(query) ? { addProjectV2ItemById: { item: { id: 'PVTI_new' } } } : {})
  )
  await addToProject(f, {
    projectId: PROJECT,
    issueNodeId: 'I_1',
    issueNumber: '5',
    sourceRepository: 'org/app',
    dryRun: false,
    debug: false,
    statusName: '',
    ...inputs
  })
  return { mutations: f.mutations, logs: f.logs }
}

test('adds the issue and sets the Status resolved by name', async () => {
  const { mutations } = await run({ inputs: { statusName: '📦 Backlog' } })
  assert.equal(mutations.length, 2)
  assert.match(mutations[0]!.query, /addProjectV2ItemById/)
  assert.equal(mutations[1]!.vars.fieldId, 'PVTSSF_status')
  assert.equal(mutations[1]!.vars.optionId, 'opt-backlog')
  assert.equal(mutations[1]!.vars.itemId, 'PVTI_new')
})

test('no status name means the issue is added with no Status write', async () => {
  const { mutations } = await run({})
  assert.equal(mutations.length, 1)
})

test('an unknown Status name fails before the issue is added', async () => {
  const { mutations, logs } = await run({ inputs: { statusName: 'Nope' } })
  assert.equal(mutations.length, 0)
  assert.equal(logs.failed.length, 1)
})

test('an issue already in the project is left alone', async () => {
  const { mutations, logs } = await run({ inputs: { statusName: '📦 Backlog' }, inProject: true })
  assert.equal(mutations.length, 0)
  assert.ok(logs.summary.includes('Status: already-present'))
})

test('dry-run writes nothing', async () => {
  const { mutations, logs } = await run({ inputs: { statusName: '📦 Backlog', dryRun: true } })
  assert.equal(mutations.length, 0)
  assert.ok(logs.summary.includes('Status: dry-run'))
})

test('a malformed node id is rejected before any call', async () => {
  const { mutations, logs } = await run({ inputs: { issueNodeId: "x'; throw 1; //" } })
  assert.equal(mutations.length, 0)
  assert.equal(logs.failed.length, 1)
})

test('missing project or issue ids fail before any call', async () => {
  for (const inputs of [{ projectId: '' }, { issueNodeId: 'null' }, { projectId: 'a b' }]) {
    const { mutations, logs } = await run({ inputs })
    assert.equal(mutations.length, 0, JSON.stringify(inputs))
    assert.equal(logs.failed.length, 1, JSON.stringify(inputs))
  }
})

test('an unknown issue fails the run', async () => {
  const { mutations, logs } = await run({ issue: null })
  assert.equal(mutations.length, 0)
  assert.equal(logs.failed.length, 1)
})

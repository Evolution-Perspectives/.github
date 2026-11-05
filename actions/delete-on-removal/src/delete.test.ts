// Tests for the delete-on-removal action, run against fakes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { deleteOnRemoval, type Inputs } from './delete.ts'

const PROJECT = 'PVT_kwDOtest'

const baseInputs: Inputs = {
  projectId: PROJECT,
  issueNodeId: 'I_1',
  itemNodeId: 'PVTI_1',
  eventAction: 'removed',
  sourceRepository: 'org/app',
  dryRun: false,
  debug: false
}

const issueNode = (projects: string[]) => ({
  node: {
    __typename: 'Issue',
    id: 'I_1',
    number: 9,
    title: 't',
    state: 'OPEN',
    repository: { nameWithOwner: 'org/app' },
    projectItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: projects.map((id) => ({ id: 'PVTI_x', project: { id } })) }
  }
})

async function go(inputs: Partial<Inputs>, onQuery: () => unknown) {
  const f = fakes(onQuery)
  await deleteOnRemoval(f, { ...baseInputs, ...inputs })
  const status = f.logs.summary.map((l) => /^Status: (.+)$/.exec(l)?.[1]).find(Boolean)
  return { mutations: f.mutations, logs: f.logs, status }
}

test('deletes an issue that is no longer in the project', async () => {
  const { mutations, logs, status } = await go({}, () => issueNode(['PVT_other']))
  assert.equal(mutations.length, 1)
  assert.match(mutations[0]!.query, /deleteIssue/)
  assert.equal(mutations[0]!.vars.issueId, 'I_1')
  assert.equal(logs.failed.length, 0)
  assert.equal(status, 'deleted')
})

test('skip path: keeps an issue that is still in the project', async () => {
  const { mutations, status } = await go({}, () => issueNode([PROJECT]))
  assert.equal(mutations.length, 0)
  assert.equal(status, 'skipped-still-in-project')
})

test('dry-run reports but does not delete', async () => {
  const { mutations, status } = await go({ dryRun: true }, () => issueNode([]))
  assert.equal(mutations.length, 0)
  assert.equal(status, 'dry-run-no-delete')
})

test('a non-issue node is skipped', async () => {
  const { mutations, status } = await go({}, () => ({ node: { __typename: 'PullRequest' } }))
  assert.equal(mutations.length, 0)
  assert.equal(status, 'skipped-non-issue')
})

test('an already-missing issue is not an error', async () => {
  const { mutations, logs, status } = await go({}, () => ({ node: null }))
  assert.equal(mutations.length, 0)
  assert.equal(logs.failed.length, 0)
  assert.equal(status, 'already-missing')
})

test('a "could not resolve" API error counts as already deleted, other errors are thrown', async () => {
  const gone = await go({}, () => { throw new Error('Could not resolve to a node with the global id of X') })
  assert.equal(gone.status, 'already-missing')
  await assert.rejects(go({}, () => { throw new Error('Bad credentials') }), /Bad credentials/)
})

test('malformed inputs fail before any API call', async () => {
  for (const inputs of [{ issueNodeId: 'I_1`; rm -rf /' }, { projectId: 'a b' }, { itemNodeId: "x'y" }, { sourceRepository: 'not a repo' }]) {
    let called = false
    const { logs } = await go(inputs, () => { called = true; return issueNode([]) })
    assert.equal(called, false, JSON.stringify(inputs))
    assert.equal(logs.failed.length, 1, JSON.stringify(inputs))
  }
})

test('missing required inputs fail', async () => {
  for (const inputs of [{ issueNodeId: '' }, { issueNodeId: 'null' }, { projectId: '' }]) {
    const { logs } = await go(inputs, () => issueNode([]))
    assert.equal(logs.failed.length, 1, JSON.stringify(inputs))
  }
})

test('an issue listed on several pages is checked across all pages', async () => {
  let page = 0
  const f = fakes(() => {
    page++
    const { node } = issueNode(page === 1 ? ['PVT_a'] : [PROJECT])
    const pageInfo: { hasNextPage: boolean; endCursor: string | null } = { hasNextPage: page === 1, endCursor: page === 1 ? 'c1' : null }
    return { node: { ...node, projectItems: { ...node.projectItems, pageInfo } } }
  })
  await deleteOnRemoval(f, baseInputs)
  assert.equal(page, 2)
  assert.equal(f.mutations.length, 0)
})

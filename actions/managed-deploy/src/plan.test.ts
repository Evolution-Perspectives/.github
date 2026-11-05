// Scenarios of the managed-workflow-deployment spec, on the pure planning functions.
import test from 'node:test'
import assert from 'node:assert/strict'
import type { Manifest, RepoInfo } from './model.ts'
import { desiredFiles, planRepo, selectRepos } from './plan.ts'
import { MANAGED_PREFIX } from './render.ts'

const H = `${MANAGED_PREFIX} (x).\n`
const TEMPLATES = new Map([
  ['org-a.yml', `${H}uses: x@__REF__\n  runner: __RUNNER__\n`],
  ['org-b.yml', `${H}uses: y@__REF__\n`]
])
const manifest = (over: Partial<Manifest> = {}): Manifest => ({ callers: ['org-a.yml', 'org-b.yml'], exclude: [], manageSecret: false, repos: {}, ...over })
const repo = (name: string, archived = false, over: Partial<RepoInfo> = {}): RepoInfo => ({ name, archived, private: true, fork: false, defaultBranch: 'main', ...over })
const cfg = (over = {}) => ({ name: 'r', ref: 'v1', runner: 'ep-github-runner', callers: ['org-a.yml', 'org-b.yml'], manageSecret: false, ...over })

test('archived repos, the source repo and excluded repos are skipped; a new repo is picked up', () => {
  const selected = selectRepos([repo('b'), repo('.github'), repo('old', true), repo('skip'), repo('new')], manifest({ exclude: ['skip'] }))
  assert.deepEqual(selected.map((r) => r.name), ['b', 'new'])
})

test('public repositories and forks are skipped unless the manifest lists them', () => {
  const orgRepos = [repo('priv'), repo('pub', false, { private: false }), repo('fork', false, { fork: true })]
  assert.deepEqual(selectRepos(orgRepos, manifest()).map((r) => r.name), ['priv'])
  assert.deepEqual(selectRepos(orgRepos, manifest({ repos: { pub: {}, fork: {} } })).map((r) => r.name), ['fork', 'priv', 'pub'])
})

test('storing the secret is opt-in: off by default, on through the manifest default or a repo override', () => {
  assert.deepEqual(selectRepos([repo('a'), repo('b')], manifest()).map((r) => r.manageSecret), [false, false])
  assert.deepEqual(selectRepos([repo('a'), repo('b')], manifest({ manageSecret: true, repos: { b: { manageSecret: false } } })).map((r) => r.manageSecret), [true, false])
})

test('defaults come from the manifest and can be overridden per repo', () => {
  const [a, b] = selectRepos([repo('a'), repo('b')], manifest({ repos: { b: { ref: 'main', runner: '', callers: ['org-a.yml'] } } }))
  assert.deepEqual([a!.ref, a!.runner, a!.callers], ['v1', 'ep-github-runner', ['org-a.yml', 'org-b.yml']])
  assert.deepEqual([b!.ref, b!.runner, b!.callers], ['main', '', ['org-a.yml']])
})

test('the repo filter restricts the targets', () => {
  assert.deepEqual(selectRepos([repo('a'), repo('b')], manifest(), ['b']).map((r) => r.name), ['b'])
})

test('a repo with nothing gets every caller added', () => {
  const plan = planRepo(desiredFiles(TEMPLATES, cfg()), new Map())
  assert.deepEqual(plan, { add: ['org-a.yml', 'org-b.yml'], update: [], remove: [], conflicts: [] })
})

test('repo-owned workflows are never part of the plan', () => {
  const existing = new Map([['ci.yml', 'name: ci\n'], ['deploy.yml', 'name: deploy\n']]) // not org-*: not even read by the client
  const plan = planRepo(desiredFiles(TEMPLATES, cfg()), existing)
  assert.deepEqual(plan.remove, [])
  assert.deepEqual(plan.add, ['org-a.yml', 'org-b.yml'])
})

test('a look-alike org- file without the header is a conflict, never overwritten or deleted', () => {
  const existing = new Map([['org-a.yml', 'name: a repo-owned org-a\n'], ['org-mine.yml', 'name: mine\n']])
  const plan = planRepo(desiredFiles(TEMPLATES, cfg()), existing)
  assert.deepEqual(plan.conflicts, ['org-a.yml'])
  assert.deepEqual(plan.add, ['org-b.yml'])
  assert.deepEqual(plan.remove, []) // org-mine.yml has no header: left alone
})

test('a retired managed caller is removed, a changed one is updated', () => {
  const desired = desiredFiles(TEMPLATES, cfg({ callers: ['org-a.yml'] }))
  const existing = new Map([
    ['org-a.yml', `${H}uses: x@v0\n  runner: ep-github-runner\n`], // older ref
    ['org-b.yml', `${H}uses: y@v1\n`] // retired from the callers
  ])
  const plan = planRepo(desired, existing)
  assert.deepEqual(plan, { add: [], update: ['org-a.yml'], remove: ['org-b.yml'], conflicts: [] })
})

test('planning the applied state again is empty (idempotence)', () => {
  const desired = desiredFiles(TEMPLATES, cfg())
  assert.deepEqual(planRepo(desired, new Map(desired)), { add: [], update: [], remove: [], conflicts: [] })
})

test('a pilot repo following main renders main, a hosted repo has no runner line', () => {
  const files = desiredFiles(TEMPLATES, cfg({ ref: 'main', runner: '' }))
  assert.match(files.get('org-a.yml')!, /x@main/)
  assert.doesNotMatch(files.get('org-a.yml')!, /runner:/)
})

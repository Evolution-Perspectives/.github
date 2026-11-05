// Tests of the deploy orchestration against a fake org.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fakes } from '../../../lib/testing.ts'
import { deploy, describeResult, reportResults, type DeployOptions } from './deploy.ts'
import { makeClient, type FakeRepo } from './fake-client.testkit.ts'
import type { Manifest } from './model.ts'
import { MANAGED_PREFIX } from './render.ts'

const H = `${MANAGED_PREFIX} (x).\n`
const TEMPLATES = new Map([['org-a.yml', `${H}uses: x@__REF__\n  runner: __RUNNER__\n`]])
const MANIFEST: Manifest = { callers: ['org-a.yml'], exclude: [], repos: {} }
const SECRET = 'ghp_SUPERSECRETVALUE'
const options = (over: Partial<DeployOptions> = {}): DeployOptions => ({ dryRun: false, repoFilter: [], rotateSecret: false, secretValue: SECRET, ...over })
const repo = (name: string, extra: Partial<FakeRepo> = {}): FakeRepo => ({ info: { name, archived: false, defaultBranch: 'main' }, secret: 'missing', ...extra })
const rendered = `${H}uses: x@v1\n  runner: ep-github-runner\n`

async function run(repos: FakeRepo[], opts: Partial<DeployOptions> = {}, manifest = MANIFEST) {
  const client = makeClient(repos)
  const f = fakes(() => ({}))
  const results = await deploy(f.core, client, TEMPLATES, manifest, options(opts))
  await reportResults(f.core, results, Boolean(opts.dryRun))
  return { client, f, results }
}

test('dry-run reports the plan and writes nothing', async () => {
  const { client, results, f } = await run([repo('r1')], { dryRun: true })
  assert.deepEqual(client.calls.filter((c) => !c.startsWith('readCallers')), [])
  assert.equal(results[0]!.mode, 'dry-run')
  assert.deepEqual(results[0]!.plan.add, ['org-a.yml'])
  assert.ok(f.logs.summary.includes('Mode: DRY RUN, nothing was written'))
})

test('a new repo gets the secret first, then a branch, the file and a pull request', async () => {
  const { client, results } = await run([repo('r1')])
  const order = client.calls.filter((c) => !c.startsWith('readCallers') && !c.startsWith('secret-length'))
  assert.deepEqual(order, ['setSecret:r1', 'resetBranch:r1:org/managed-workflows', 'writeFile:r1:org/managed-workflows:org-a.yml', 'openOrUpdatePullRequest:r1:org/managed-workflows'])
  assert.equal(client.repos.get('r1')!.branchFiles.get('org-a.yml'), rendered)
  assert.equal(results[0]!.mode, 'pull-request')
  assert.equal(results[0]!.secretSet, true)
})

test('a repo already in sync with its secret present is left alone', async () => {
  const { client, results } = await run([repo('r1', { files: { 'org-a.yml': rendered }, secret: 'present' })])
  assert.equal(client.calls.filter((c) => !c.startsWith('readCallers')).length, 0)
  assert.equal(results[0]!.mode, 'in-sync')
})

test('running the deploy again after it applied changes does nothing (idempotence)', async () => {
  const repos = [repo('r1', { files: { 'org-a.yml': `${H}uses: x@v0\n  runner: ep-github-runner\n` }, secret: 'present' })]
  const first = await run(repos)
  assert.deepEqual(first.results[0]!.plan.update, ['org-a.yml'])
  const second = await run([repo('r1', { files: { 'org-a.yml': first.client.repos.get('r1')!.branchFiles.get('org-a.yml')! }, secret: 'present' })])
  assert.equal(second.results[0]!.mode, 'in-sync')
})

test('an existing pull request is updated, not duplicated', async () => {
  const client = makeClient([repo('r1', { secret: 'present' })])
  const f = fakes(() => ({}))
  await deploy(f.core, client, TEMPLATES, MANIFEST, options())
  await deploy(f.core, client, TEMPLATES, MANIFEST, options())
  assert.equal(client.repos.get('r1')!.prUpdates, 1)
})

test('an empty repo gets the files as its first commit, with no pull request', async () => {
  const { client, results } = await run([repo('IT', { empty: true })])
  assert.equal(results[0]!.mode, 'first-commit')
  assert.ok(client.calls.includes('writeFile:IT:main:org-a.yml'))
  assert.ok(!client.calls.some((c) => c.startsWith('resetBranch') || c.startsWith('openOrUpdatePullRequest')))
})

test('a retired managed caller is deleted on the branch and a look-alike is reported but not touched', async () => {
  const { client, results } = await run([repo('r1', { secret: 'present', files: { 'org-old.yml': `${H}retired\n`, 'org-a.yml': 'name: mine\n' } })])
  assert.deepEqual(results[0]!.plan.remove, ['org-old.yml'])
  assert.deepEqual(results[0]!.plan.conflicts, ['org-a.yml'])
  assert.ok(client.calls.includes('deleteFile:r1:org/managed-workflows:org-old.yml'))
  assert.ok(!client.calls.some((c) => c.includes('writeFile:r1') && c.endsWith('org-a.yml')))
})

test('only conflicts means nothing is written', async () => {
  const { client, results } = await run([repo('r1', { secret: 'present', files: { 'org-a.yml': 'name: mine\n' } })])
  assert.equal(results[0]!.mode, 'conflicts-only')
  assert.equal(client.calls.filter((c) => !c.startsWith('readCallers')).length, 0)
})

test('the secret is set only when missing, or on rotate, and its value is masked and never logged', async () => {
  const present = await run([repo('r1', { secret: 'present', files: { 'org-a.yml': rendered } })])
  assert.ok(!present.client.calls.includes('setSecret:r1'))
  const rotate = await run([repo('r1', { secret: 'present', files: { 'org-a.yml': rendered } })], { rotateSecret: true })
  assert.ok(rotate.client.calls.includes('setSecret:r1'))
  assert.equal(rotate.results[0]!.mode, 'in-sync')
  const unknown = await run([repo('r1', { secret: 'unknown', files: { 'org-a.yml': rendered } })], { rotateSecret: true })
  assert.ok(!unknown.client.calls.includes('setSecret:r1')) // cannot verify: not overwritten blindly
  const everything = [...rotate.f.logs.info, ...rotate.f.logs.warning, ...rotate.f.logs.summary, ...rotate.f.logs.failed].join('\n')
  assert.ok(!everything.includes(SECRET))
  assert.deepEqual(rotate.f.logs.secrets, [SECRET])
})

test('one failing repo does not stop the others and fails the run', async () => {
  const client = makeClient([repo('a'), repo('b'), repo('c')])
  client.failOn.add('resetBranch:b')
  const f = fakes(() => ({}))
  const results = await deploy(f.core, client, TEMPLATES, MANIFEST, options())
  await reportResults(f.core, results, false)
  assert.deepEqual(results.map((r) => r.mode), ['pull-request', 'failed', 'pull-request'])
  assert.deepEqual(f.logs.failed, ['1 repository failed: b.'])
  assert.match(describeResult(results[1]!), /ERROR resetBranch failed for b/)
})

test('excluded and archived repos and the filter are honored', async () => {
  const { results } = await run([repo('a'), repo('b'), repo('skip'), { ...repo('old'), info: { name: 'old', archived: true, defaultBranch: 'main' } }], { repoFilter: ['a', 'skip', 'old'] }, { ...MANIFEST, exclude: ['skip'] })
  assert.deepEqual(results.map((r) => r.repo), ['a'])
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { MANAGED_PREFIX, isManaged, renderCaller } from './render.ts'

const TEMPLATE = `${MANAGED_PREFIX} (x). Do not edit.
jobs:
  j:
    uses: Evolution-Perspectives/.github/.github/workflows/engine-a.yml@__REF__
    with:
      runner: __RUNNER__
      x: 1
`

test('the ref and the runner are substituted', () => {
  const out = renderCaller(TEMPLATE, { ref: 'v1', runner: 'ep-github-runner' })
  assert.match(out, /engine-a\.yml@v1\n/)
  assert.match(out, /^ {6}runner: ep-github-runner$/m)
  assert.doesNotMatch(out, /__REF__|__RUNNER__/)
})

test('an empty runner removes the runner line (hosted runner)', () => {
  const out = renderCaller(TEMPLATE, { ref: 'main', runner: '' })
  assert.doesNotMatch(out, /runner:/)
  assert.match(out, /engine-a\.yml@main/)
})

test('rendering is deterministic', () => {
  assert.equal(renderCaller(TEMPLATE, { ref: 'v1', runner: 'r' }), renderCaller(TEMPLATE, { ref: 'v1', runner: 'r' }))
})

test('managed means an org- name and the header', () => {
  assert.equal(isManaged('org-a.yml', TEMPLATE), true)
  assert.equal(isManaged('org-a.yml', 'name: mine\n'), false) // look-alike without the header
  assert.equal(isManaged('ci.yml', TEMPLATE), false) // not in the namespace
  assert.equal(isManaged('org-a.txt', TEMPLATE), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { isMissing, isNodeId, isSourceRepositoryValid } from './validate.ts'

test('node IDs accept the GitHub shapes and reject anything else', () => {
  for (const ok of ['I_kwDOabc123', 'PVT_kwDOCIcusc4BOGrD', 'PVTI_x-y_z=', 'MDU6SXNzdWUx+/=']) assert.equal(isNodeId(ok), true, ok)
  for (const bad of ['', 'a b', "I_1'; drop", 'I_1`x', 'I_1$(id)', 'x\ny']) assert.equal(isNodeId(bad), false, JSON.stringify(bad))
})

test('missing values include the strings null and undefined', () => {
  assert.equal(isMissing(''), true)
  assert.equal(isMissing('null'), true)
  assert.equal(isMissing('undefined'), true)
  assert.equal(isMissing('I_1'), false)
})

test('source repository is optional but must look like owner/name', () => {
  for (const ok of ['', 'unknown', 'org/repo', 'Evolution-Perspectives/.github']) assert.equal(isSourceRepositoryValid(ok), true, ok)
  for (const bad of ['not a repo', 'org/repo/extra', 'org/', '/repo']) assert.equal(isSourceRepositoryValid(bad), false, bad)
})

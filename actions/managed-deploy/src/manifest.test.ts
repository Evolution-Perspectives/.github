import test from 'node:test'
import assert from 'node:assert/strict'
import { parseManifest } from './manifest.ts'

const TEMPLATES = ['org-a.yml', 'org-b.yml']

test('a valid manifest is accepted and defaults are filled', () => {
  const m = parseManifest({ callers: ['org-a.yml', 'org-b.yml'] }, TEMPLATES)
  assert.deepEqual(m, { callers: ['org-a.yml', 'org-b.yml'], exclude: [], manageSecret: false, repos: {} })
})

test('per-repo overrides are accepted', () => {
  const m = parseManifest({ callers: ['org-a.yml', 'org-b.yml'], exclude: ['x'], repos: { 'it-lab': { ref: 'main', callers: ['org-a.yml'], runner: '' } } }, TEMPLATES)
  assert.deepEqual(m.repos['it-lab'], { ref: 'main', callers: ['org-a.yml'], runner: '' })
})

test('unknown keys, unknown templates and bad refs are rejected', () => {
  const bad: unknown[] = [
    { callers: ['org-a.yml'], extra: 1 },
    { callers: ['org-zzz.yml'] },
    { callers: ['a.yml'] },
    { callers: ['org-a.yml', 'org-a.yml'] },
    { callers: ['org-a.yml'], repos: { r: { ref: 'feat/x' } } },
    { callers: ['org-a.yml'], repos: { r: { callers: ['org-b.yml'] } } },
    { callers: ['org-a.yml'], repos: { r: { runner: 'a b' } } },
    { callers: ['org-a.yml'], repos: { r: { unknown: true } } },
    { callers: ['org-a.yml'], manageSecret: 'yes' },
    { callers: ['org-a.yml'], repos: { r: { manageSecret: 1 } } },
    { callers: 'org-a.yml' },
    [],
    null
  ]
  for (const m of bad) assert.throws(() => parseManifest(m, TEMPLATES), /Invalid manifest/, JSON.stringify(m))
})

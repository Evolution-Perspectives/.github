// Guards the real templates and manifest of this repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseManifest } from './manifest.ts'
import { MANAGED_PREFIX, isManaged } from './render.ts'
import { ROOT, expectedOwnCallers } from './sync-callers.ts'

const TEMPLATES = join(ROOT, '.github', 'managed-workflows')
const names = readdirSync(TEMPLATES).filter((n) => /^org-[a-z0-9-]+\.yml$/.test(n))

test('the real manifest is valid and lists every template', () => {
  const manifest = parseManifest(JSON.parse(readFileSync(join(TEMPLATES, 'manifest.json'), 'utf8')), names)
  assert.deepEqual([...manifest.callers].sort(), [...names].sort())
})

test('every template carries the managed header, the ref and runner placeholders, and no literal ref or runner', () => {
  for (const name of names) {
    const text = readFileSync(join(TEMPLATES, name), 'utf8')
    assert.ok(isManaged(name, text), `${name} must start with ${MANAGED_PREFIX}`)
    assert.match(text, /engine-[a-z-]+\.yml@__REF__/, name)
    assert.match(text, /^\s+runner: __RUNNER__$/m, name)
    assert.doesNotMatch(text, /ep-github-runner|@main\b|vars\./, name)
    assert.match(text, /secrets\.EP_AUTOMATION_PAT/, name)
  }
})

test('the .github repo runs exactly what the deploy would send: its org-*.yml equal the rendered templates (run npm run sync-callers)', () => {
  for (const [name, expected] of expectedOwnCallers()) {
    assert.equal(readFileSync(join(ROOT, '.github', 'workflows', name), 'utf8'), expected, `${name} differs from its template; run: npm run sync-callers`)
  }
})

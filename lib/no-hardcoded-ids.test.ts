// Guard: automation code must resolve project field/option IDs live, never embed them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const FORBIDDEN = /PVTSSF_|PVT_kw|98236657|69f90333|ba8247ce|f75ad846/

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

test('sources, lib and engine workflows contain no project field or option ID literals', () => {
  const actionSources = readdirSync(join(ROOT, 'actions'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => walk(join(ROOT, 'actions', d.name, 'src')))
  const engines = readdirSync(join(ROOT, '.github', 'workflows'))
    .filter((n) => n.startsWith('engine-'))
    .map((n) => join(ROOT, '.github', 'workflows', n))
  const files = [...actionSources, ...walk(join(ROOT, 'lib')), ...engines].filter((f) => /\.(ts|yml)$/.test(f) && !/\.test(kit)?\.ts$/.test(f))
  assert.ok(files.length >= 15, `expected to scan the action sources and engines, got ${files.length}`)
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), FORBIDDEN, relative(ROOT, f))
})

test('the committed bundles contain no project field or option ID literals either', () => {
  const bundles = readdirSync(join(ROOT, 'actions'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => join(ROOT, 'actions', d.name, 'dist', 'index.js'))
  for (const f of bundles) assert.doesNotMatch(readFileSync(f, 'utf8'), FORBIDDEN, relative(ROOT, f))
})

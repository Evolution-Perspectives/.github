// Regenerates this repository's own org-*.yml callers from the managed templates, so the
// `.github` repo dogfoods exactly what the deploy sends elsewhere (ref main, hosted runner).
// Run with: npm run sync-callers
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseManifest } from './manifest.ts'
import { renderCaller } from './render.ts'

export const ROOT = join(import.meta.dirname, '..', '..', '..')
const TEMPLATES = join(ROOT, '.github', 'managed-workflows')
const WORKFLOWS = join(ROOT, '.github', 'workflows')

/** What `.github/workflows` should hold for the managed callers: name -> content. */
export function expectedOwnCallers(): Map<string, string> {
  const names = readdirSync(TEMPLATES).filter((n) => /^org-[a-z0-9-]+\.yml$/.test(n))
  const manifest = parseManifest(JSON.parse(readFileSync(join(TEMPLATES, 'manifest.json'), 'utf8')), names)
  return new Map(manifest.callers.map((name) => [name, renderCaller(readFileSync(join(TEMPLATES, name), 'utf8'), { ref: 'main', runner: '' })] as const))
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  for (const [name, content] of expectedOwnCallers()) {
    writeFileSync(join(WORKFLOWS, name), content)
    console.log(`wrote .github/workflows/${name}`)
  }
}

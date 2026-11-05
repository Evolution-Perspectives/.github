// Parses and validates the manifest that lists the managed callers and the per-repo exceptions.
import type { Manifest, RepoOverride } from './model.ts'

const ALLOWED_REF = /^(main|v\d+(\.\d+){0,2}|[0-9a-f]{40})$/
const CALLER_NAME = /^org-[a-z0-9-]+\.yml$/
const RUNNER_LABEL = /^[A-Za-z0-9._-]*$/

function fail(message: string): never {
  throw new Error(`Invalid manifest: ${message}`)
}

function stringList(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) fail(`${where} must be a list of strings`)
  return value as string[]
}

function onlyKeys(object: Record<string, unknown>, allowed: string[], where: string): void {
  for (const key of Object.keys(object)) if (!allowed.includes(key)) fail(`unknown key "${key}" in ${where}`)
}

/** `templates` are the file names found in the templates directory. */
export function parseManifest(json: unknown, templates: string[]): Manifest {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) fail('the manifest must be an object')
  const raw = json as Record<string, unknown>
  onlyKeys(raw, ['callers', 'exclude', 'repos'], 'the manifest')

  const callers = stringList(raw.callers, 'callers')
  for (const c of callers) {
    if (!CALLER_NAME.test(c)) fail(`caller "${c}" must be named org-<name>.yml`)
    if (!templates.includes(c)) fail(`caller "${c}" has no template`)
  }
  if (new Set(callers).size !== callers.length) fail('callers contains duplicates')

  const exclude = raw.exclude === undefined ? [] : stringList(raw.exclude, 'exclude')

  const repos: Record<string, RepoOverride> = {}
  const rawRepos = raw.repos ?? {}
  if (typeof rawRepos !== 'object' || rawRepos === null || Array.isArray(rawRepos)) fail('repos must be an object')
  for (const [name, value] of Object.entries(rawRepos)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`repos.${name} must be an object`)
    const o = value as Record<string, unknown>
    onlyKeys(o, ['ref', 'callers', 'runner'], `repos.${name}`)
    const override: RepoOverride = {}
    if (o.ref !== undefined) {
      if (typeof o.ref !== 'string' || !ALLOWED_REF.test(o.ref)) fail(`repos.${name}.ref must be main, a v<number> tag or a full commit SHA`)
      override.ref = o.ref
    }
    if (o.callers !== undefined) {
      override.callers = stringList(o.callers, `repos.${name}.callers`)
      for (const c of override.callers) if (!callers.includes(c)) fail(`repos.${name}.callers lists "${c}" which is not in the top-level callers`)
    }
    if (o.runner !== undefined) {
      if (typeof o.runner !== 'string' || !RUNNER_LABEL.test(o.runner)) fail(`repos.${name}.runner must be a runner label or an empty string`)
      override.runner = o.runner
    }
    repos[name] = override
  }
  return { callers, exclude, repos }
}

// Rendering of the caller templates and recognition of managed files.
export const MANAGED_PREFIX = '# MANAGED by Evolution-Perspectives/.github'

export interface RenderOptions {
  ref: string
  /** Runner label; empty means a GitHub-hosted runner (the runner line is removed). */
  runner: string
}

export function renderCaller(template: string, { ref, runner }: RenderOptions): string {
  const lines = template.split('\n')
  const out: string[] = []
  for (const line of lines) {
    if (/^\s*runner:\s*__RUNNER__\s*$/.test(line)) {
      if (runner) out.push(line.replace('__RUNNER__', runner))
      continue
    }
    out.push(line.replaceAll('__REF__', ref))
  }
  return out.join('\n')
}

/** A file is managed only if its name starts with org- AND it begins with the managed header. */
export function isManaged(name: string, content: string): boolean {
  return name.startsWith('org-') && name.endsWith('.yml') && content.trimStart().startsWith(MANAGED_PREFIX)
}

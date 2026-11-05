// Pure planning: which repositories are targeted, which files they should have, and the diff.
import type { Manifest, RepoConfig, RepoInfo, RepoPlan } from './model.ts'
import { DEFAULT_REF, DEFAULT_RUNNER } from './model.ts'
import { isManaged, renderCaller } from './render.ts'

/**
 * Repositories to deploy to: not archived, not the source repo, not excluded, matching the optional filter.
 * Public repositories and forks are skipped unless the manifest lists them explicitly in `repos`.
 */
export function selectRepos(orgRepos: RepoInfo[], manifest: Manifest, filter: string[] = [], sourceRepo = '.github'): RepoConfig[] {
  const selected: RepoConfig[] = []
  for (const repo of orgRepos) {
    if (repo.archived || repo.name === sourceRepo || manifest.exclude.includes(repo.name)) continue
    if (filter.length > 0 && !filter.includes(repo.name)) continue
    const o = manifest.repos[repo.name]
    if ((!repo.private || repo.fork) && !o) continue
    selected.push({
      name: repo.name,
      ref: o?.ref ?? DEFAULT_REF,
      runner: o?.runner ?? DEFAULT_RUNNER,
      callers: o?.callers ?? manifest.callers,
      manageSecret: o?.manageSecret ?? manifest.manageSecret
    })
  }
  return selected.sort((a, b) => a.name.localeCompare(b.name))
}

/** The exact files a repository should hold. */
export function desiredFiles(templates: Map<string, string>, config: RepoConfig): Map<string, string> {
  const files = new Map<string, string>()
  for (const name of config.callers) {
    const template = templates.get(name)
    if (template === undefined) throw new Error(`No template for caller ${name}`)
    files.set(name, renderCaller(template, { ref: config.ref, runner: config.runner }))
  }
  return files
}

/**
 * Diff between the desired callers and the org-*.yml files a repository has now.
 * Only names starting with org- are ever considered; a file without the managed header is a conflict
 * and is never written or deleted.
 */
export function planRepo(desired: Map<string, string>, existing: Map<string, string>): RepoPlan {
  const plan: RepoPlan = { add: [], update: [], remove: [], conflicts: [] }
  for (const [name, content] of desired) {
    const current = existing.get(name)
    if (current === undefined) plan.add.push(name)
    else if (!isManaged(name, current)) plan.conflicts.push(name)
    else if (current !== content) plan.update.push(name)
  }
  for (const [name, content] of existing) {
    if (!desired.has(name) && isManaged(name, content)) plan.remove.push(name)
  }
  for (const list of Object.values(plan)) list.sort()
  return plan
}

export const isEmptyPlan = (plan: RepoPlan): boolean => plan.add.length + plan.update.length + plan.remove.length === 0

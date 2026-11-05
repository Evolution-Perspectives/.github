// Deploys the managed callers (and the repo secret) to the org repositories through one pull request each.
import type { CoreLike } from '../../../lib/types.ts'
import type { Client } from './client.ts'
import type { Manifest, RepoResult } from './model.ts'
import { BRANCH, SECRET_NAME } from './model.ts'
import { desiredFiles, isEmptyPlan, planRepo, selectRepos } from './plan.ts'

export interface DeployOptions {
  dryRun: boolean
  repoFilter: string[]
  rotateSecret: boolean
  /** The value stored as the repo secret; masked in all logs. */
  secretValue: string
}

// The marker keeps the repositories' own push and pull_request workflows (CI, and above all the deploys
// that run on every push to the default branch) from running because of this change. It is in the commit
// messages and in the pull request title, so it also reaches the merge commit whatever the merge strategy.
export const SKIP_MARKER = '[skip ci]'
const MESSAGE = `chore: sync the org managed workflows ${SKIP_MARKER}`

const prBody = (names: { add: string[]; update: string[]; remove: string[] }): string =>
  [
    'Synced from `Evolution-Perspectives/.github` (`.github/managed-workflows`). Only `.github/workflows/org-*.yml` files carrying the managed header are touched; your own workflows are not.',
    '',
    ...names.add.map((n) => `- add \`${n}\``),
    ...names.update.map((n) => `- update \`${n}\``),
    ...names.remove.map((n) => `- remove \`${n}\``),
    '',
    'These callers react to issue events and delegate to the reusable workflows in `.github`. Do not edit them here: the next deploy overwrites them.'
  ].join('\n')

export async function deploy(core: CoreLike, client: Client, templates: Map<string, string>, manifest: Manifest, options: DeployOptions): Promise<RepoResult[]> {
  if (options.secretValue) core.setSecret(options.secretValue)
  const orgRepos = await client.listRepos()
  const repos = selectRepos(orgRepos, manifest, options.repoFilter)
  const infoByName = new Map(orgRepos.map((r) => [r.name, r] as const))
  const results: RepoResult[] = []

  for (const config of repos) {
    const defaultBranch = infoByName.get(config.name)?.defaultBranch ?? 'main'
    let result: RepoResult = { repo: config.name, plan: { add: [], update: [], remove: [], conflicts: [] }, secret: 'unknown', secretSet: false, mode: 'in-sync' }
    try {
      const empty = await client.isEmpty(config.name)
      const existing = empty ? new Map<string, string>() : await client.readCallers(config.name, defaultBranch)
      const desired = desiredFiles(templates, config)
      const plan = planRepo(desired, existing)
      const secret = await client.secretStatus(config.name, SECRET_NAME)
      result = { ...result, plan, secret }

      const needsSecret = config.manageSecret && Boolean(options.secretValue) && (secret === 'missing' || (options.rotateSecret && secret !== 'unknown'))
      const needsFiles = !isEmptyPlan(plan)

      if (options.dryRun) {
        result.mode = 'dry-run'
      } else {
        // The secret goes first, so a caller never fires without it.
        if (needsSecret) {
          await client.setSecret(config.name, SECRET_NAME, options.secretValue)
          result.secretSet = true
        }
        if (!needsFiles) {
          result.mode = plan.conflicts.length > 0 ? 'conflicts-only' : 'in-sync'
        } else if (empty) {
          for (const name of [...plan.add, ...plan.update]) await client.writeFile(config.name, defaultBranch, name, desired.get(name)!, MESSAGE)
          result.mode = 'first-commit'
        } else {
          const write = new Map([...plan.add, ...plan.update].map((name) => [name, desired.get(name)!] as const))
          await client.commitToBranch(config.name, BRANCH, defaultBranch, { write, remove: plan.remove }, MESSAGE)
          result.pr = await client.openOrUpdatePullRequest(config.name, BRANCH, defaultBranch, MESSAGE, prBody(plan))
          result.mode = 'pull-request'
        }
      }
    } catch (error) {
      result.mode = 'failed'
      result.error = error instanceof Error ? error.message : String(error)
      core.warning(`${config.name}: ${result.error}`)
    }
    results.push(result)
  }
  return results
}

export function describeResult(r: RepoResult): string {
  const { add, update, remove, conflicts } = r.plan
  const parts = [`+${add.length} ~${update.length} -${remove.length}`]
  if (conflicts.length > 0) parts.push(`conflicts: ${conflicts.join(', ')}`)
  parts.push(`secret ${r.secret}${r.secretSet ? ' (set)' : ''}`)
  if (r.pr) parts.push(r.pr)
  if (r.error) parts.push(`ERROR ${r.error}`)
  return `${r.repo}: ${r.mode} | ${parts.join(' | ')}`
}

export async function reportResults(core: CoreLike, results: RepoResult[], dryRun: boolean): Promise<void> {
  const summary = core.summary.addHeading('Managed workflows deploy')
  summary.addRaw(dryRun ? 'Mode: DRY RUN, nothing was written' : 'Mode: write').addEOL()
  summary.addRaw(`Repositories: ${results.length}`).addEOL()
  for (const r of results) summary.addRaw(`- ${describeResult(r)}`).addEOL()
  await summary.write()
  for (const r of results) core.info(describeResult(r))
  const failed = results.filter((r) => r.mode === 'failed')
  if (failed.length > 0) core.setFailed(`${failed.length} repositor${failed.length === 1 ? 'y' : 'ies'} failed: ${failed.map((r) => r.repo).join(', ')}.`)
}

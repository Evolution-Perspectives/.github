// The real Client, on Octokit. The secret is written by the `gh` CLI (it handles the encryption),
// injected as a function so this module stays free of child processes.
import type { getOctokit } from '@actions/github'
import { WORKFLOWS_DIR, type Client } from './client.ts'
import { withRetry } from '../../../lib/retry.ts'
import type { SecretStatus } from './model.ts'

type Octokit = ReturnType<typeof getOctokit>
export type SecretSetter = (repo: string, name: string, value: string) => Promise<void>

/** Arguments of `gh secret set` for a repository of the org (gh requires the OWNER/REPO form). */
export const secretSetArgs = (org: string, repo: string, name: string): string[] => ['secret', 'set', name, '--repo', `${org}/${repo}`]

const statusOf = (error: unknown): number | undefined => (typeof error === 'object' && error !== null ? (error as { status?: number }).status : undefined)
const decode = (data: unknown): string => Buffer.from((data as { content: string }).content, 'base64').toString('utf8')
const path = (name: string): string => `${WORKFLOWS_DIR}/${name}`

export function createGithubClient(octokit: Octokit, org: string, setSecret: SecretSetter): Client {
  const rest = octokit.rest
  const base = (repo: string) => ({ owner: org, repo })

  async function fileSha(repo: string, branch: string, name: string): Promise<string | undefined> {
    try {
      const res = await rest.repos.getContent({ ...base(repo), path: path(name), ref: branch })
      return Array.isArray(res.data) ? undefined : res.data.sha
    } catch (error) {
      if (statusOf(error) === 404) return undefined
      throw error
    }
  }

  return {
    async listRepos() {
      const repos = await octokit.paginate(rest.repos.listForOrg, { org, per_page: 100, type: 'all' })
      return repos.map((r) => ({ name: r.name, archived: Boolean(r.archived), private: Boolean(r.private), fork: Boolean(r.fork), defaultBranch: r.default_branch ?? 'main' }))
    },

    async isEmpty(repo) {
      try {
        await rest.repos.listCommits({ ...base(repo), per_page: 1 })
        return false
      } catch (error) {
        if (statusOf(error) === 409) return true // "Git Repository is empty"
        throw error
      }
    },

    async readCallers(repo, branch) {
      const files = new Map<string, string>()
      let listing
      try {
        listing = await rest.repos.getContent({ ...base(repo), path: WORKFLOWS_DIR, ref: branch })
      } catch (error) {
        if (statusOf(error) === 404) return files
        throw error
      }
      if (!Array.isArray(listing.data)) return files
      for (const entry of listing.data) {
        if (entry.type !== 'file' || !entry.name.startsWith('org-') || !entry.name.endsWith('.yml')) continue
        const file = await rest.repos.getContent({ ...base(repo), path: entry.path, ref: branch })
        files.set(entry.name, decode(file.data))
      }
      return files
    },

    async secretStatus(repo, name): Promise<SecretStatus> {
      try {
        await rest.actions.getRepoSecret({ ...base(repo), secret_name: name })
        return 'present'
      } catch (error) {
        const status = statusOf(error)
        if (status === 404) return 'missing'
        if (status === 403) return 'unknown'
        throw error
      }
    },

    async setSecret(repo, name, value) {
      await setSecret(repo, name, value)
    },

    async commitToBranch(repo, branch, baseBranch, changes, message) {
      const baseRef = await rest.git.getRef({ ...base(repo), ref: `heads/${baseBranch}` })
      const baseSha = baseRef.data.object.sha
      const baseCommit = await rest.git.getCommit({ ...base(repo), commit_sha: baseSha })
      const entries = [
        ...[...changes.write].map(([name, content]) => ({ path: path(name), mode: '100644' as const, type: 'blob' as const, content })),
        ...changes.remove.map((name) => ({ path: path(name), mode: '100644' as const, type: 'blob' as const, sha: null }))
      ]
      const tree = await rest.git.createTree({ ...base(repo), base_tree: baseCommit.data.tree.sha, tree: entries })
      const commit = await rest.git.createCommit({ ...base(repo), message, tree: tree.data.sha, parents: [baseSha] })
      const sha = commit.data.sha
      // GitHub intermittently answers 422 "Reference update failed" for a ref that is fine a moment later
      // (seen once on a large repository), so the whole create-or-reset is retried a few times.
      await withRetry(async () => {
        try {
          await rest.git.updateRef({ ...base(repo), ref: `heads/${branch}`, sha, force: true })
        } catch (error) {
          if (statusOf(error) !== 422 && statusOf(error) !== 404) throw error
          await rest.git.createRef({ ...base(repo), ref: `refs/heads/${branch}`, sha })
        }
      }, { attempts: 4, delayMs: 2000, retryOn: /Reference update failed/ })
    },

    async writeFile(repo, branch, name, content, message) {
      const sha = await fileSha(repo, branch, name)
      await rest.repos.createOrUpdateFileContents({
        ...base(repo),
        path: path(name),
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {})
      })
    },

    async openOrUpdatePullRequest(repo, branch, baseBranch, title, body) {
      const open = await rest.pulls.list({ ...base(repo), head: `${org}:${branch}`, state: 'open', per_page: 1 })
      const existing = open.data[0]
      if (existing) {
        await rest.pulls.update({ ...base(repo), pull_number: existing.number, title, body })
        return existing.html_url
      }
      const created = await rest.pulls.create({ ...base(repo), head: branch, base: baseBranch, title, body })
      return created.data.html_url
    }
  }
}

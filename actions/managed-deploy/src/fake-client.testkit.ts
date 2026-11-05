// A stateful fake of the org for the deploy tests.
import type { Client } from './client.ts'
import type { RepoInfo, SecretStatus } from './model.ts'

export interface FakeRepo {
  info: RepoInfo
  empty?: boolean
  files?: Record<string, string> // org-*.yml of the default branch
  secret?: SecretStatus
}

export interface FakeClient extends Client {
  repos: Map<string, FakeRepo & { branchFiles: Map<string, string>; branchExists: boolean; pr?: string; prUpdates: number }>
  calls: string[]
  messages: string[] // commit messages and pull request titles sent
  commits: string[] // one entry per commit made on a sync branch
  failOn: Set<string> // "<method>:<repo>"
}

export function makeClient(repos: FakeRepo[]): FakeClient {
  const state: FakeClient['repos'] = new Map(repos.map((r) => [r.info.name, { ...r, branchFiles: new Map(), branchExists: false, prUpdates: 0 }] as const))
  const calls: string[] = []
  const messages: string[] = []
  const commits: string[] = []
  const failOn = new Set<string>()
  const get = (repo: string) => state.get(repo)!
  const record = (method: string, repo: string, extra = ''): void => {
    calls.push(`${method}:${repo}${extra ? `:${extra}` : ''}`)
    if (failOn.has(`${method}:${repo}`)) throw new Error(`${method} failed for ${repo}`)
  }

  return {
    repos: state,
    calls,
    messages,
    commits,
    failOn,
    async listRepos() { return [...state.values()].map((r) => r.info) },
    async isEmpty(repo) { return Boolean(get(repo).empty) },
    async readCallers(repo, branch) {
      record('readCallers', repo, branch)
      return new Map(Object.entries(get(repo).files ?? {}))
    },
    async secretStatus(repo) { return get(repo).secret ?? 'missing' },
    async setSecret(repo, _name, value) {
      record('setSecret', repo)
      get(repo).secret = 'present'
      calls.push(`secret-length:${value.length}`)
    },
    async commitToBranch(repo, branch, _base, changes, message) {
      record('commitToBranch', repo, branch)
      messages.push(message)
      const r = get(repo)
      r.branchExists = true
      r.branchFiles = new Map(changes.write)
      for (const name of changes.remove) r.branchFiles.set(name, '<deleted>')
      commits.push(`${repo}:${changes.write.size}w${changes.remove.length}d`)
    },
    async writeFile(repo, branch, name, content, message) {
      record('writeFile', repo, `${branch}:${name}`)
      messages.push(message)
      const r = get(repo)
      r.files = { ...(r.files ?? {}), [name]: content }
      r.empty = false
    },
    async openOrUpdatePullRequest(repo, branch, _base, title) {
      record('openOrUpdatePullRequest', repo, branch)
      messages.push(title)
      const r = get(repo)
      if (r.pr) r.prUpdates++
      r.pr = r.pr ?? `https://github.com/org/${repo}/pull/1`
      return r.pr
    }
  }
}

// Types of the managed-workflow deploy.

export const DEFAULT_REF = 'v1'
export const DEFAULT_RUNNER = 'ep-github-runner'
export const BRANCH = 'org/managed-workflows'
export const SECRET_NAME = 'EP_AUTOMATION_PAT'

export interface RepoOverride {
  ref?: string
  callers?: string[]
  runner?: string
}

export interface Manifest {
  callers: string[]
  exclude: string[]
  repos: Record<string, RepoOverride>
}

export interface RepoInfo {
  name: string
  archived: boolean
  defaultBranch: string
}

/** The resolved settings of one repository. */
export interface RepoConfig {
  name: string
  ref: string
  runner: string // '' means a GitHub-hosted runner
  callers: string[]
}

export interface RepoPlan {
  add: string[]
  update: string[]
  remove: string[]
  conflicts: string[]
}

export type SecretStatus = 'present' | 'missing' | 'unknown'

export interface RepoResult {
  repo: string
  plan: RepoPlan
  secret: SecretStatus
  secretSet: boolean
  pr?: string
  mode: 'dry-run' | 'in-sync' | 'pull-request' | 'first-commit' | 'conflicts-only' | 'failed'
  error?: string
}

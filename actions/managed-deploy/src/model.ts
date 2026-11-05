// Types of the managed-workflow deploy.

export const DEFAULT_REF = 'v1'
export const DEFAULT_RUNNER = 'ep-github-runner'
export const BRANCH = 'org/managed-workflows'
export const SECRET_NAME = 'EP_AUTOMATION_PAT'

export interface RepoOverride {
  ref?: string
  callers?: string[]
  runner?: string
  /** Store the repo secret in this repository (overrides the manifest default). */
  manageSecret?: boolean
}

export interface Manifest {
  callers: string[]
  exclude: string[]
  /** Whether the deploy stores the repo secret by default. Opt-in: false unless set. */
  manageSecret: boolean
  repos: Record<string, RepoOverride>
}

export interface RepoInfo {
  name: string
  archived: boolean
  private: boolean
  fork: boolean
  defaultBranch: string
}

/** The resolved settings of one repository. */
export interface RepoConfig {
  name: string
  ref: string
  runner: string // '' means a GitHub-hosted runner
  callers: string[]
  manageSecret: boolean
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

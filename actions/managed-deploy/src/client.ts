// The GitHub operations the deploy needs, behind an interface so the logic is tested with a fake.
import type { RepoInfo, SecretStatus } from './model.ts'

export const WORKFLOWS_DIR = '.github/workflows'

export interface Client {
  listRepos(): Promise<RepoInfo[]>
  /** True when the repository has no commit yet (it cannot hold a pull request). */
  isEmpty(repo: string): Promise<boolean>
  /** The org-*.yml files of `.github/workflows` on a branch (name -> content). Other files are never read. */
  readCallers(repo: string, branch: string): Promise<Map<string, string>>
  secretStatus(repo: string, name: string): Promise<SecretStatus>
  setSecret(repo: string, name: string, value: string): Promise<void>
  /** Creates the branch from `base`, or force-resets it to the tip of `base` when it exists. */
  resetBranch(repo: string, branch: string, base: string): Promise<void>
  writeFile(repo: string, branch: string, name: string, content: string, message: string): Promise<void>
  deleteFile(repo: string, branch: string, name: string, message: string): Promise<void>
  /** Opens the pull request, or updates the open one for the same branch. Returns its URL. */
  openOrUpdatePullRequest(repo: string, branch: string, base: string, title: string, body: string): Promise<string>
}

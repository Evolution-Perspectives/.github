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
  /**
   * Creates the branch, or force-moves it, so that it points at ONE new commit on top of `base` that adds or
   * updates `write` files and deletes `remove` files. The branch never points at a commit without the marker
   * of `message`: creating it at the tip of the default branch would be a push whose head commit has no
   * skip marker, and that push would fire the repository's own push workflows.
   */
  commitToBranch(repo: string, branch: string, base: string, changes: { write: Map<string, string>; remove: string[] }, message: string): Promise<void>
  /** Writes one file straight to a branch; only used for the first commit of an empty repository. */
  writeFile(repo: string, branch: string, name: string, content: string, message: string): Promise<void>
  /** Opens the pull request, or updates the open one for the same branch. Returns its URL. */
  openOrUpdatePullRequest(repo: string, branch: string, base: string, title: string, body: string): Promise<string>
}

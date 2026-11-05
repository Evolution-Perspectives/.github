# managed-deploy

Deploys the managed `org-*.yml` caller workflows (and the repo secret they need) from `.github/managed-workflows/` to the organization's repositories, through one pull request per repository, without touching anything the repositories own.

- **Called by:** `.github/workflows/engine-managed-deploy.yml` (reusable engine). Runner: `.github/workflows/ops-deploy-managed-workflows.yml` (manual dispatch; weekly and on-push runs are always dry runs).
- **Source:** TypeScript in `src/` (`index.ts` wiring, `deploy.ts` orchestration and report, `plan.ts` and `render.ts` pure planning and rendering, `manifest.ts` validation, `client.ts` the GitHub operations as an interface, `github-client.ts` the Octokit implementation), bundled to the committed `dist/index.js` and run on `node24`.
- **Tests:** `src/*.test.ts` (`npm test`) use a stateful fake org (`fake-client.testkit.ts`). `callers.test.ts` guards the real templates and checks that this repository's own `org-*.yml` equal the rendered templates (`npm run sync-callers` regenerates them).
- **Dry run:** the default. Anything but `dry_run: "false"` plans and reports without writing.

## Safety boundary

- A file is managed only if its name starts with `org-` **and** it starts with the managed header. The deploy only reads, writes or deletes such files. Everything else in `.github/workflows` (CI, deploy, build) is never read or touched.
- An `org-*.yml` file without the header (a look-alike) is a **conflict**: reported, never overwritten or deleted.
- One pull request per repository on the fixed branch `org/managed-workflows`, force-reset to the default branch each run; no push to default branches. An empty repository (no commit yet, so no pull request is possible) receives the files as its first commit.
- The repo secret `EP_AUTOMATION_PAT` is set before the files, only when it is missing or on `rotate_secret`; its value is masked and passed to `gh secret set` through stdin only. When the secret cannot be read (no permission) it is reported as `unknown` and never overwritten blindly.
- A failure on one repository does not stop the others; the run ends failed.

## Manifest (`.github/managed-workflows/manifest.json`)

```json
{
  "callers": ["org-issue-closed-remove-blocking.yml", "org-issue-closed-sync-status.yml", "org-issue-opened-add-to-project.yml"],
  "exclude": ["repo-to-skip"],
  "repos": { "it-lab": { "ref": "main", "callers": ["org-issue-opened-add-to-project.yml"], "runner": "" } }
}
```

- `callers`: templates deployed everywhere by default. `exclude`: repositories never touched (archived repositories and `.github` itself are always skipped).
- `repos.<name>`: `ref` (`main`, a `v<number>` tag or a full SHA; default `v1`), `callers` (a subset) and `runner` (a label; empty means a hosted runner; default `ep-github-runner`). Unknown keys are rejected.

## Inputs

| Input | Required | Description |
|---|---|---|
| `token` | yes | Token with repo and workflow scope, able to write repo secrets. |
| `secret_value` | no | Value stored as the repo secret `EP_AUTOMATION_PAT`. Empty means the secret is not managed. |
| `dry_run` | no (default "true") | Plan and report without writing. |
| `repos` | no | Comma-separated repository names to restrict the run to. |
| `rotate_secret` | no (default "false") | Overwrite the repo secret even when it exists. |
| `org` | no | Organization (defaults to the owner of the running repository). |
| `templates_dir`, `manifest_path` | no | Locations relative to the workspace. |

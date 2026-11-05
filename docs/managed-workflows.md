# Managed workflows

The org's issue automations (add to project, close → Status, blocking cleanup) are reusable workflows in this repository, but a repository only reacts to its own issue events, and the org has no webhook or relay. So every repository gets three thin caller workflows, `org-*.yml`, kept in sync from here by one deploy job, without touching the repositories' own CI, deploy and build workflows.

## Pieces

| Piece | Where |
|---|---|
| Caller templates (with the managed header and `__REF__`, `__RUNNER__` placeholders) and the manifest | `.github/managed-workflows/` |
| Deploy action (TypeScript) | `actions/managed-deploy/` |
| Reusable engine and the runner of it | `.github/workflows/engine-managed-deploy.yml`, `.github/workflows/ops-deploy-managed-workflows.yml` |
| Moves the `v1` tag | `.github/workflows/ops-promote-v1.yml` |
| This repository's own callers (rendered from the templates with ref `main`, hosted runner) | `.github/workflows/org-*.yml`, regenerate with `npm run sync-callers` |

## Rules

- A file is managed only if its name starts with `org-` and it begins with the managed header; the deploy ignores everything else. A look-alike `org-*.yml` without the header is reported as a conflict and never overwritten.
- Callers pin the engines to the moving tag **`v1`** (a repository can follow another ref through the manifest, to act as a pilot). Engines call their action at `main`, a `v<number>` tag or a SHA; the layout check enforces it for every engine call.
- Callers pass the label of the self-hosted pool (`ep-github-runner`, see `runner-pool.md`) as a literal; the manifest can override it per repository (empty means a hosted runner). `.github`'s own callers use hosted runners.
- The callers are **event-driven only**: no `workflow_dispatch` and no inputs, because these files run with the org token in every repository and anyone who can run workflows there must not be able to point the token at another issue or project. A test guards the templates.
- The automation token is stored as a **repo-level secret** `EP_AUTOMATION_PAT` (organization secrets do not reach private repositories on the Free plan), but **only where the manifest enables it**: `manageSecret` is `false` by default (top level) and can be switched on per repository. Public repositories and forks are skipped unless the manifest lists them explicitly.

## Tokens

- `EP_DEPLOY_PAT` (secret of this repository): `repo` and `workflow` scope and permission to write repo secrets. Required to write; a real run never falls back to another token. A dry run may read with `EP_AUTOMATION_PAT`.
- `EP_AUTOMATION_PAT`: the token the callers use at run time; prefer a fine-grained token limited to issues and projects for the stored copies.
- If a scope is missing, the repository fails with the API error, the others continue, and the run ends failed.

## Operating it

1. Dry run: `gh workflow run ops-deploy-managed-workflows.yml` (the default), read the summary. The weekly run and every push touching `.github/managed-workflows/` produce the same report.
2. Promote: after a change is merged and dogfooded here, move `v1` with `gh workflow run ops-promote-v1.yml` (empty sha means the head of `main`). The run records the previous commit; rollback is running it again with that sha.
3. Pilot: set `repos.<name>.ref` to `main` in the manifest for one small repository, deploy to it with `repos=<name>`, close and open a test issue there, check the project, delete the test issue.
4. Roll out: run with `dry_run=false` (optionally `rotate_secret=true`), merge the pull requests with each team, run again and expect every repository `in-sync`.
5. Rollback per repository: remove it from the callers (or add it to `exclude`) and deploy: the managed files are deleted through the pull request. Globally: move `v1` back.

Phase 1 (everything above built and proven inside this repository, with a fake org in the tests) is done; writing to the other repositories starts only on the owner's go.

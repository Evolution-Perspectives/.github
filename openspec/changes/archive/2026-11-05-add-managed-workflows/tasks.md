# Tasks

> Phase 1 (groups 1 to 5) happens only inside the `.github` repo and includes dogfooding: `.github` runs the managed callers on its own issues. Phase 2 (group 6) leaves the zone and deploys to other repos; it starts only on the owner's go.

## Phase 1: inside .github

## 1. Callers and manifest

- [x] 1.1 Create `.github/managed-workflows/` with the three callers (`org-issue-opened-add-to-project.yml`, `org-issue-closed-sync-status.yml`, `org-issue-closed-remove-blocking.yml`), each with the managed header, `workflow_dispatch` inputs (dry_run, debug), the literal `runner: ep-github-runner` once the `add-ep-github-runner` pool is live (no `vars.` expression; the manifest can override it, empty meaning hosted), `uses: …/.github/workflows/engine-*.yml@__REF__` and `secrets.EP_AUTOMATION_PAT`. Verify: YAML parses and each `uses:` target (an `engine-*.yml`) and input names exist in `.github/workflows`.
- [x] 1.2 Create `managed-workflows/manifest.json` (callers list, `exclude`, per-repo `ref`/`callers` overrides) and document its schema. Verify: a schema check in the script tests rejects an unknown key.

## 2. Pure deployment logic (tested here, no API calls)

- [x] 2.1 Create `actions/managed-deploy/` (`action.yml` with `using: node24`, `src/index.ts`, `src/deploy.ts`, `README.md`) on the TypeScript toolchain; `src/deploy.ts` exports `renderCaller(template, ref)`, `isManaged(name, content)`, `planRepo(desired, existing)` returning `{ add, update, remove, conflicts }`, and `selectRepos(orgRepos, manifest)`. Verify: `node --test` cases for the scenarios "Repo-owned workflows untouched", "Look-alike file without header", "Retired caller", "Excluded repo", "New repo", and idempotence (a second plan on the applied state is empty).

## 3. Writers and secret (behind a fake client, still no real API)

- [x] 3.1 Implement the API client (list repos, read `org-*` files, create/refresh the fixed branch, put/delete contents, open or update the PR, first-commit path for an empty repo) behind an injectable interface with the `gh` retry helper. Verify: tests against a fake client for branch reuse, PR create vs update, and the empty-repo path.
- [x] 3.2 Implement secret provisioning (`gh secret set --repo`, only when missing or `rotate_secret`) without logging the value. Verify: test that the value never appears in captured logs; dry-run reports the action without calling the API.
- [x] 3.3 Implement the report (per repo: files to add/update/remove, conflicts, secret status, PR link), the dry-run banner, per-repo failure isolation and a failed exit when any repo failed. Verify: test with one failing repo: the others are processed and the exit status is failure.

## 4. Workflow and docs

- [x] 4.1 Add `.github/workflows/engine-managed-deploy.yml` (reusable wrapper) and `.github/workflows/ops-deploy-managed-workflows.yml` (`workflow_dispatch` with `dry_run` default true, `repos` filter, `rotate_secret`; weekly drift schedule in report-only mode; push trigger on `managed-workflows/**` in dry-run), own concurrency group, `EP_AUTOMATION_PAT`. Verify: `gh workflow list` shows both, `node .github/scripts/check-actions-layout.js` passes and a manual dry-run succeeds.
- [x] 4.2 Confirm `ci-workflow-scripts.yml` runs `actions/managed-deploy/src/*.test.ts`, the type check, `check-dist` and the layout check on pull requests (no separate validation workflow). Verify: the check runs on the PR.
- [x] 4.3 Document the model in `usecases.md` and a runbook (`v1` tag policy, pilot, rollback, token scopes, the exclusion rule). Verify: sections present and consistent with the specs.

## 5. Guardrails and dogfooding

- [x] 5.1 Convert `.github`'s own triggers (`org-issue-opened-add-to-project.yml`, `org-issue-closed-sync-status.yml`, `org-issue-closed-remove-blocking.yml`) into the `org-*` callers following `main`, and remove the bespoke copies. Verify: open and close a test issue in `.github`; Status, project add and unblocking behave as before; record the run ids and the final state through `gh api`; the test issue is removed afterwards and its removal verified.
- [x] 5.2 Clean the reusable workflows' contracts: resolve Status option IDs by name instead of constants, declare minimal `permissions`, document inputs and secrets. Done in the harmonization and `restructure-to-actions` work. Verified by `lib/no-hardcoded-ids.test.js` (no field or option ID literal in `actions/`, `lib/` or `engine-*.yml`) and a README per action listing inputs.
- [x] 5.3 Add a promote workflow that moves the `v1` tag to a chosen commit after checks, and document the rollback. Verify: a manual run moves `v1` and records the old commit.

## Phase 2: leaving the zone (on the owner's go)

## 6. Rollout

- [x] 6.1 Create the `v1` tag on the merged commit and run a dry-run for all repos; review the report with the owner. Verify: report lists every non-archived repo and no conflicts.
- [x] 6.2 Pilot on `it-lab` following `main`: deploy, open and close a test issue, confirm the project add, Status and unblocking; also confirm the skip path (a repo-owned workflow and an excluded repo stay untouched). Verify: run ids and project state recorded; test artifacts removed afterwards and their removal verified.
- [x] 6.3 Deploy to all repos in one run and merge the pull requests; run the deploy again. Verify: the second run reports every repo in sync and each repo has the secret.

## Not performed in phase 1

- 5.4 (branch protection for `main` and a ruleset for the `v1` tag): a repository-settings change left to the owner. A "require passing checks" rule would block documentation-only pull requests, because the check workflows are path-filtered and never run for them; a ruleset for the `v1` tag must allow the `ops-promote-v1` workflow to move it.

## Workflow follow-up

- Decide whether to retire `.github/workflow-templates/` once the managed callers exist; `.github/copilot-instructions.md` still lists the template pair in its mandatory artifact set and must change with that decision.
- Add the `ref` rule to the runbook: managed callers use `@v1`; engines call their action at `main`, a `v<number>` tag or a SHA (enforced by `check-actions-layout.js`).
- Enable the `runner: ep-github-runner` label in the caller templates only after `add-ep-github-runner` task group 5 has passed, and keep the redeploy-to-hosted rollback documented in the runbook.

## Phase 2 record (2026-11-05)

- Wave 0 (`it-lab`) done: dry run, real run (the first attempt failed before writing anything because `gh secret set` needs OWNER/REPO; fixed in #61), sync PR #1 with `[skip ci]` in all three commits and the title, merged with a merge commit. Result: zero workflow runs for the PR head and for the merge commit although `it-lab`'s CI runs on every push to `main`. A disposable issue then ran the callers on the self-hosted pool (runners 2 and 3, group default) with the reusable workflows from the public `.github` at `@v1`: added to the project (Backlog), closed to Done, blocking cleanup succeeded; the issue was deleted and the sync branch removed.
- Waves 1 to 3 (the other nine repositories) are not done; they follow the order in the study and wait for the owner's go.
- `EP_DEPLOY_PAT` is a copy of the value of `EP_AUTOMATION_PAT` (scopes project, read:org, repo, workflow), stored through a one-off workflow that has been deleted; the existing automation token was already broad and already stored in nine repositories. Replace both with dedicated tokens (see the report).

## Rollout record (all ten repositories)

Done 2026-11-05 in the order it-lab, coach-mobile-app, coach-app-backend, IT, maquette-demo-sites-web, mylea, intercobot, template-formations, hubspot-theme, way2be. For each: zero workflow runs triggered by the sync PR head and by the merge commit (verified through the run count), disposable-issue dogfood on the self-hosted pool, test issue deleted. Findings and fixes: the sync branch must be created by one marked commit (way2be's CI Dev fired on the branch creation; cancelled), intermittent 422 on ref update retried, public repos and forks need allowPublic, gh secret set needs OWNER/REPO. Per-issue concurrency (queue: max) and job timeouts added for bursts. A full dry run now reports every repository in-sync.

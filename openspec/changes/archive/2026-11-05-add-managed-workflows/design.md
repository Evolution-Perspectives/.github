# Design

## Context

See proposal.md for motivation. Facts that shape the approach:

- `.github` is public, so any repo can call its reusable workflows with no access setting. All 10 product repos are private; `.github` has 13 workflows (flat, role-prefixed) and the others 0 to 7 of their own (`ci-*`, `deploy-*`, `build`).
- The org is on the Free plan: organization secrets are not accessible to private repos, there are no org rulesets or required workflows, and branch protection is unavailable on private repos. The org default workflow permission is read-only.
- The org has no webhooks and no relay (verified); `repository_dispatch` into `.github` has never occurred. Actions has no org-wide trigger for issues, so per-repo callers are the only no-hosting way to react instantly.
- Existing trigger workflows (`org-issue-opened-add-to-project.yml`, `org-issue-closed-sync-status.yml`, `org-issue-closed-remove-blocking.yml`) already pass `github.repository` and `secrets.EP_AUTOMATION_PAT` to the `engine-*.yml` reusable workflows, so they port to other repos almost verbatim. Each engine is a thin wrapper around an action in `actions/<name>/` (change `restructure-to-actions`, which lands first); a managed caller pinned to `@v1` therefore pins wrapper, action and `lib/` together.
- `.github/workflow-templates/` holds starter templates that only surface as suggestions and were never adopted.

## Goals / Non-Goals

**Goals:**
- One source of truth in `.github`; all repos converge to it with one command.
- Repo-owned workflows and history are never altered.
- A bad change can be contained to a pilot before it reaches every repo.

**Non-Goals:**
- Reacting to project board events (Status → close): there is no trigger without a hosted receiver; the sweep covers it.
- Enforcing that repos keep the managed files (no rulesets on Free); drift is detected and reported.
- Managing repo-owned CI, deploy or build workflows.
- A hosted webhook receiver (a possible later change).

## Decisions

**Thin callers, logic stays in `.github`.** A caller is a trigger plus `uses: Evolution-Perspectives/.github/.github/workflows/action-<name>.yml@<ref>` and the secret. Alternative: copy full logic into each repo. Rejected: every logic change would need a redeploy and repos would diverge. Callers change only when a trigger, input or secret name changes.

**Namespace plus header as the safety boundary.** Managed files are `org-<name>.yml` and start with a header (`# MANAGED by Evolution-Perspectives/.github …`). The deploy only ever lists, writes or deletes files matching both. Alternative: a separate directory. Rejected: GitHub only runs workflows in `.github/workflows/`, so a prefix is the only separation available.

**Pull requests on one fixed branch.** `org/managed-workflows`, one PR per repo, force-updated when the source changes. No push to default branches. Alternative: direct push (possible since no protection). Rejected: a PR runs the repo's own checks and gives its team a review point. An empty repo (the `IT` repo) cannot hold a PR, so it gets the files as its first commit.

**Pin to a moving `v1` tag, per-repo override.** A merge to `.github/main` does not reach repos until `v1` is moved after validation on a pilot repo that follows `main` through the manifest. Alternative: `@main` everywhere (as the current triggers do). Rejected: one bad merge would break issue handling in all repos at once.

**An action plus workflows, not a matrix of reusable jobs.** `actions/managed-deploy/src/deploy.ts` (bundled to `dist/index.js`, written in TypeScript on the `migrate-actions-to-typescript` toolchain) loops over repos with the typed retry helper; pure functions compute the desired file set and the diff and are unit-tested, and the API writes sit behind an injectable client. It is called through `engine-managed-deploy.yml` (reusable wrapper) and run by `ops-deploy-managed-workflows.yml` with `dry_run` (default true on manual runs), a weekly drift schedule and a push trigger on `managed-workflows/**`.

**Repo list from the API, manifest for exceptions.** `GET /orgs/{org}/repos` excluding archived and `.github` itself, minus a manifest `exclude` list. New repos are picked up automatically. Callers per repo default to all; overrides are `ref` and `callers`.

**Secret handled by the same job, as a separate step.** The job sets the repo secret from the token it holds with `gh secret set --repo`, only when missing or on an explicit `rotate_secret` input. Free-plan constraint: no org-level secret is possible for private repos. A narrower token (fine-grained, limited to issues and projects) is preferable to a classic one for the stored copy.

**Concurrency.** The deploy uses its own group; callers share no group with the sweep (groups are per repository, see `add-project-sweep`).

**Runner label hardcoded in the callers.** Once the `add-ep-github-runner` change is live, the caller templates pass the literal `runner: ep-github-runner` to the engines; no variable is used, and the manifest may override it per repo (an empty value means a hosted runner). The `.github` repo's own callers omit it, because `.github` is public and cannot use the pool. Switching a repo back to hosted runners is a redeploy of its callers, done in one run of the deploy tool.

**Hardening decided after a security review.** Managed callers are event-driven only (no `workflow_dispatch`, no inputs, fixed project ID): a manual input in a file that runs with the org token in every repo would let anyone who can run workflows there redirect the token (confused deputy). Distributing the repo secret is opt-in (`manageSecret` is false by default, enabled in the manifest at top level or per repo), public repositories and forks are skipped unless the manifest lists them, and a real deploy never falls back to another token than `EP_DEPLOY_PAT` (only a dry run may read with the automation PAT). A possible later hardening is a check in the engines that the issue belongs to `source_repository`.

## Risks / Trade-offs

- [Token stored in 10 repos] → fine-grained token, minimum scopes for the callers (issues read, project write); rotation by the `rotate_secret` input; the deploy token is separate and stronger, kept only in `.github`.
- [The deploy token needs `workflow` scope to write workflow files] → document the scope; validate it in dry-run before any write.
- [A repo disables Actions or removes `org-*.yml`] → the weekly drift report lists it; the next deploy restores it through a PR.
- [Repo CI triggers on the managed PR] → the PR touches only `org-*.yml`; repos using path filters are unaffected, others run their normal PR checks, which is intended.
- [Callers fire with no secret yet] → the reusable workflow fails clearly; deploy orders secret before files.
- [A runaway tag move] → `v1` moves only after a pilot success, recorded in the runbook; rollback is moving the tag back.

## Migration Plan

**Phase 1 stays inside `.github`.** The callers are first used by `.github` itself (dogfooding), so every piece is proven on real events here. The deploy script is built and tested against a fake client. Guardrails (branch protection, protected `v1` tag, promote workflow) are set on this repo only. Phase 2 (below) starts only on the owner's go.

1. Merge the managed callers, manifest, script and deploy workflow. Nothing deploys yet.
2. Move `v1` to the current `main` commit.
3. Dry-run the deploy for all repos; review the report.
4. Pilot: deploy to one small repo (`it-lab`) with `ref: main`; close and open a test issue there and confirm Status and project add; clean up the test issue.
5. Deploy to all repos in one run; merge the PRs with each team.
6. Rollback per repo: delete the `org-*.yml` through the deploy (remove from the manifest) or close the PR; globally: move `v1` back or disable the callers.

## Open Questions

- Which token type and scopes to store per repo (classic `repo`+`project` vs fine-grained); decide before provisioning.
- Whether to keep or remove the unused `.github/workflow-templates/` once the callers exist.
- Whether `new-page-web` and `delete-issue-on-project-removal` workflows belong in this set (the latter is board-event driven and has no trigger without a receiver).

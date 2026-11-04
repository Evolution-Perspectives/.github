## Context

The main org project (`Projets Digitaux`) is the single planning surface for the org. Issue intake is currently manual. This repo already runs the same two-tier shape for other automations: a central reusable `workflow_call` action in `.github/workflows/`, consumed by a thin per-repo trigger, published as a workflow template under `.github/workflow-templates/` so any repo can adopt it (e.g. `remove-blocking-on-close`, `delete-issue-on-project-removal`).

Two other real-time-capable options were considered and rejected:
- **Native GitHub Projects "Auto-add to project" workflow**: fires instantly, zero Actions cost, but has no public GraphQL/REST mutation to configure (`createProjectV2Workflow` does not exist in the schema) — UI-only, not scriptable/auditable as code. Rejected for this change; can be layered on top manually later without conflict (adding the same item twice is a no-op).
- **org webhook → repository_dispatch relay** (the mechanism `projects-v2-item-updated` etc. already use): would need an org-admin-only change to the webhook config outside this repo, to forward `issues` events. Out of reach from this repo alone; not pursued here.

Decision: use the per-repo `issues: opened` trigger pattern already established in this repo, and close the "who adopts it" gap by pushing the trigger file to every existing repo in the org as part of this change, in addition to publishing the workflow template for future/manual adoption.

## Goals / Non-Goals

**Goals:**
- Any issue opened in a repo carrying the trigger workflow is added to the main project in the same Actions run — no polling delay.
- Idempotent: re-running never creates duplicate project items.
- Every existing repo in the org gets the trigger workflow as part of this change's rollout.
- Consistent with existing automation conventions (naming, `EP_AUTOMATION_PAT`, `dry_run`/`debug` inputs, `core.summary` reporting, workflow-template publishing).

**Non-Goals:**
- Setting project field values (Status, Prio, etc.) on the new item — handled elsewhere.
- Adding pull requests to the project.
- Adding closed issues.
- Removing items from the project (already covered by `delete-issue-on-project-removal`).
- Covering repos created *after* this change's rollout automatically — no org webhook or repo-creation hook is available from this repo to push the workflow into brand-new repos. Documented as a known gap.

## Decisions

- **Per-repo `issues: opened` trigger + central reusable action**: mirrors `remove-blocking-on-close` and `delete-issue-on-project-removal` exactly — same job shape (`uses: Evolution-Perspectives/.github/.github/workflows/<name>-action.yml@main`), same secret, same summary conventions.
- **Bulk rollout to existing repos**: a one-time script (via `gh api`/`gh repo list` + per-repo commit or PR) adds `.github/workflows/add-issue-to-org-project.yml` to every existing repo in the org, using the exact content published in the workflow template. This is a cross-repo, shared-state change and requires explicit confirmation before execution (per-repo PRs or direct commits — user to decide at apply time).
- **Workflow template publishing**: also publish under `.github/workflow-templates/` so it shows up in the Actions "New workflow" picker for any repo, covering manual adoption for repos the bulk rollout misses or that are created later.
- **Idempotency via `addProjectV2ItemById`**: the mutation is idempotent — adding an already-present item returns the existing item without creating a duplicate. `dry_run` still short-circuits before the mutation for observability.
- **No cron / no org-wide search scan**: explicitly rejected per requirement for real, event-driven automation only.

## Risks / Trade-offs

- [New repos created after rollout are not covered] → Documented gap; no cron fallback by design. Mitigation: repo-creation checklist/README should reference the workflow template; revisit with an org webhook or GitHub App if this becomes a recurring pain point.
- [Bulk rollout touches every repo in the org] → Highest-blast-radius part of this change. Mitigation: batch as individual PRs (not direct pushes) per repo where feasible, review before merging, execute only after explicit user confirmation.
- [Repos with branch protection or required-status-check configs may reject the new workflow file via PR] → Handle case-by-case during rollout; not a blocker for the core capability.

## Migration Plan

1. Add the reusable action + trigger + workflow-template files to this repo on a feature branch.
2. Validate `add-issue-to-org-project-action.yml` via `workflow_dispatch` with `dry_run: true` against a real issue node ID; confirm summary output and no mutation.
3. Validate with `dry_run: false` against a disposable test issue in this repo; confirm it appears in the project; delete the test issue per validation cleanup policy.
4. Merge to default branch in this repo; this repo's own issues are now covered.
5. Roll the trigger workflow out to other existing repos (separate, explicitly-confirmed step — one PR per repo or a batch, user's call).
6. No rollback data risk — disabling/removing the workflow files stops future auto-adds; no destructive state is created.

## Open Questions

- Bulk rollout mechanics (direct commit vs. PR per repo, and how many repos) to be confirmed with the user at apply time before any cross-repo write happens.

# Proposal

## Why

The org's issue automations (add to project, close → Status, blocking cleanup) are written as reusable workflows in `.github`, but their triggers (`issues: opened/closed`) fire only for issues of the repo that holds the workflow. Run history confirms it: all 1,511 runs are for `.github` itself, and the org has no webhook or relay (the hook list is empty), so nothing reaches the 10 product repos. The existing `.github/workflow-templates/` are only suggestions in each repo's "New workflow" screen and were never adopted. Instant reaction in every repo needs a thin caller workflow in each repo, kept in sync from one place without disturbing the repos' own CI, deploy and build workflows.

## What Changes

- Add thin **caller workflows** (`org-*.yml`) that trigger on repo events and call the reusable workflows in `.github` pinned to a version tag.
- Add a **deploy job** in `.github` that creates, updates and removes only managed files (`org-` prefix plus a managed header) in every non-excluded org repo, through one pull request per repo, with dry-run, a drift report and a per-repo manifest.
- Provision the automation token as a **repo-level secret** in each repo, because organization secrets are not available to private repos on the Free plan.
- Roll out through a **moving `v1` tag** so a bad merge in `.github` cannot break every repo at once; a pilot repo can follow a different ref.
- The sweep (`add-project-sweep`) stays the safety net for missed events and for board-driven reactions, which have no live trigger.

## Capabilities

### New Capabilities
- `repo-event-callers`: the thin per-repo callers, their triggers, inputs and version pinning.
- `managed-workflow-deployment`: how managed callers and the repo secret are deployed, updated and removed across the org without touching repo-owned files.

### Modified Capabilities

## Impact

- New: `.github/managed-workflows/` (caller templates and manifest), `actions/managed-deploy/` (`action.yml`, `src/*.ts` with tests, committed `dist/index.js`, README), `.github/workflows/engine-managed-deploy.yml` and `.github/workflows/ops-deploy-managed-workflows.yml`. CI validation comes from the existing `ci-workflow-scripts.yml`.
- Depends on `migrate-actions-to-typescript` (toolchain and typed `lib/`, its task groups 1 and 2); the actions layout has landed.
- Touches every org repo through PRs limited to `.github/workflows/org-*.yml`, plus one repo secret each.
- Needs a token with `repo` and `workflow` scope and permission to write repo secrets.
- Replaces the unused `.github/workflow-templates/` starters for the same workflows (kept or removed per design).
- `usecases.md` and the README document the model and the exclusion rules.

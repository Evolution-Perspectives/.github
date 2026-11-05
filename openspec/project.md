# OpenSpec Project Context

## Repository Focus

This repository holds the Evolution-Perspectives organization automation for the GitHub Project "Projets Digitaux": reusable workflows, the actions that implement them, and the maintenance and deployment tooling around them.
Workflow changes may have destructive side effects (for example deleting issues), so validation must be staged and evidence-driven.

## Layout

- `actions/<name>/`: one composite action per automation (`action.yml`, source `.js`, `*.test.js`, `README.md`). Shared code lives in `lib/`.
- `.github/workflows/`: flat (GitHub requirement), grouped by file name prefix: `engine-` reusable wrapper (one per action), `org-` issue-event caller, `hook-` fed by `repository_dispatch` (no sender exists today), `ops-` maintenance and schedules, `ci-` validation.
- An `engine-*.yml` calls exactly one action by full path at `main`, a `v<number>` tag or a full SHA, never a feature branch. `node .github/scripts/check-actions-layout.js` enforces this in CI.
- Workflows resolve project field and option IDs live by name; `docs/project-schema/` is a cached snapshot, never read at runtime.
- Board events (Status change, item removed) have no live trigger: there is no org webhook or relay and none is hosted. The scheduled sweep (`add-project-sweep`) is the safety net, and per-repo callers (`add-managed-workflows`) cover issue events.

## OpenSpec state

- Main specs in `openspec/specs/` describe the shipped automations (add to project, Status and close sync, blocking cleanup, delete on removal).
- Active changes: `add-project-sweep` (built; waits for its first real run), `add-managed-workflows` (phase 1 built; phase 2, the rollout to the other repositories, waits for the owner). Archived and live: `restructure-to-actions` (layout), `migrate-actions-to-typescript` (every action is a bundled TypeScript action), `add-ep-github-runner` (self-hosted runner pool on the VPS, label `ep-github-runner`).
- Abandoned changes (estimation rollup, capacity scheduling, new page web flow) are archived with an Outcome note and without spec sync.

## Safe Validation Playbook

1. Create a dedicated validation branch.
2. Commit only the artifacts for the current workflow change.
3. Push branch and validate what is possible before default-branch rollout.
4. If GitHub prevents `workflow_dispatch` before default-branch registration:
   - Run API-equivalent checks (mutation contract, guard conditions, final state checks).
   - Then run full workflow validation immediately after pushing to default branch.
5. For destructive workflows, always execute:
   - Skip scenario: target still in scope, destructive action must not run.
   - Execute scenario: target out of scope, destructive action must run.
6. Collect proof for each scenario:
   - Workflow run ID
   - Run conclusion
   - Log proof line confirming behavior
   - Final resource state from API/CLI
7. Use deterministic output capture (`GH_PAGER=cat`) and short commands if terminal buffering is unstable.
8. Check token scopes early. If required scope is missing, document the limitation and complete full validation with proper credentials after rollout.
9. Clean up temporary issues/items and record cleanup evidence.

## Required Evidence Checklist

- Commit range and pushed ref
- Runtime runs with IDs and conclusions
- One proof line for skip behavior
- One proof line for destructive behavior
- Final API/CLI verification of target state
- Cleanup confirmation for temporary test artifacts

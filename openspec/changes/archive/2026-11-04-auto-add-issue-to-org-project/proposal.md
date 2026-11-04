## Why

Issues opened anywhere in the Evolution-Perspectives org are not automatically visible in the main org project (`Projets Digitaux`, `PVT_kwDOCIcusc4BOGrD`). Team leads currently rely on manual adds, so issues get missed or triaged late. Automating the add closes that gap and gives the org a single, reliable intake point for planning.

## What Changes

- Add a reusable workflow (`add-issue-to-org-project-action.yml`) that adds a given issue (by node ID) to the main org project via `addProjectV2ItemById`, skipping issues already in the project (idempotent).
- Add a real-time trigger workflow (`add-issue-to-org-project.yml`) that reacts to `issues: opened` and calls the reusable workflow. No cron, no polling — the add happens in the same run as the issue-opened event.
- Publish the trigger as an org workflow template (`.github/workflow-templates/add-issue-to-org-project.yml` + `.properties.json`), matching the existing distribution pattern (`remove-blocking-on-close`, `delete-issue-on-project-removal`, etc.), so any repo in the org can adopt it from the Actions "New workflow" picker.
- Roll the trigger workflow out to every existing repo in the org (bulk commit via script/PR) so org-wide coverage is real from day one, not just for repos that manually adopt the template later.
- Support `dry_run` and `debug` inputs consistent with existing automations in this repo.

## Capabilities

### New Capabilities
- `add-issue-to-org-project`: Automatically add any issue opened in an org repo carrying the trigger workflow to the main org project (`Projets Digitaux`), in real time, without duplicating items already in the project.

### Modified Capabilities
(none)

## Impact

- New files in this repo: `.github/workflows/add-issue-to-org-project-action.yml`, `.github/workflows/add-issue-to-org-project.yml`, `.github/workflow-templates/add-issue-to-org-project.yml`, `.github/workflow-templates/add-issue-to-org-project.properties.json`.
- New file pushed to every other existing repo in the org: `.github/workflows/add-issue-to-org-project.yml` (calls the central reusable workflow in this repo).
- Uses the existing `EP_AUTOMATION_PAT` secret and the existing `PVT_kwDOCIcusc4BOGrD` project ID from `project-structure.json`.
- New repos created after rollout are NOT covered automatically — they must adopt the published workflow template. This is a known gap, not solved by this change (no cron scan, no org webhook available to fill it).
- No changes to existing workflows or specs.

## Outcome (archived 2026-11-04)

Shipped. Engine `.github/workflows/engine-add-issue-to-project.yml` (was `add-issue-to-org-project-action.yml`), logic in `actions/add-to-project/`, caller `.github/workflows/org-issue-opened-add-to-project.yml` (was `add-issue-to-org-project.yml`). Tests: `actions/add-to-project/add.test.js`.

Differences from what was proposed:

- The project ID is a caller input, not hard-coded in the engine.
- The optional initial Status is given by name (`status_name`) and resolved live; the old `status_field_id` / `status_option_id` inputs are gone.
- The engine is `workflow_call` only (no `workflow_dispatch`), runs on `ubuntu-latest`, and supports `dry_run`.
- Distribution by organization workflow template and per-repo pushes was never done; it is replaced by the `add-managed-workflows` change.

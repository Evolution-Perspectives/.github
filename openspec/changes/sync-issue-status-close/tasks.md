## 1. Direction A: issue close → Status

- [x] 1.1 Create `close-issue-sync-status-action.yml` (reusable `workflow_call`): inputs `issue_node_id`, `state_reason`, `source_repository`, `project_id` (default `PVT_kwDOCIcusc4BOGrD`), `status_field_id` (default `PVTSSF_lADOCIcusc4BOGrDzg852S8`), `dry_run`, `debug`; secret `automation_pat`
- [x] 1.2 Implement: find the issue's Project item id for the target project via GraphQL; read current Status option name
- [x] 1.3 Compute target Status option id from `state_reason` (`completed` → Done option `98236657`, `not_planned`/`duplicate` → Canceled option `69f90333`); skip write if current already matches
- [x] 1.4 Update Project item Status via `updateProjectV2ItemFieldValue` when not already matching; log before/after
- [x] 1.5 Create `close-issue-sync-status.yml` trigger workflow: `on: issues: types: [closed]`, plus `workflow_dispatch` (issue_node_id, state_reason overrides, dry_run, debug) for manual/backfill runs; calls the reusable workflow with `secrets.EP_AUTOMATION_PAT`

## 2. Direction B: Status → issue close/reopen

- [x] 2.1 Create `status-sync-issue-close-action.yml` (reusable `workflow_call`): inputs `project_id`, `item_node_id`, `status_field_id`, `source_repository`, `dry_run`, `debug`; secret `automation_pat`
- [x] 2.2 Implement: fetch the Project item by `item_node_id` via GraphQL, including linked content (`Issue` fields: `id`, `state`, `stateReason`) and current Status option name
- [x] 2.3 Skip (no-op, log reason) if the item has no linked issue (draft item or linked PR)
- [x] 2.4 If Status = `🏆 Done`: close issue as `completed` unless already closed with that reason
- [x] 2.5 If Status = `❌ Canceled`: close issue as `not_planned` unless already closed with that reason
- [x] 2.6 If Status is any other option and the issue is currently closed: reopen the issue unless already open
- [x] 2.7 Create `status-sync-issue-close.yml` trigger workflow: `on: repository_dispatch: types: [projects-v2-item-updated]` (reuse the relay already consumed by `projects-estimation-rollup.yml`), plus `workflow_dispatch` (project_id, item_node_id, dry_run, debug) for manual/backfill runs; calls the reusable workflow with `secrets.EP_AUTOMATION_PAT`

## 3. Branch validation (dry run)

- [ ] 3.1 On the feature branch, create one disposable test issue in a repo covered by the main org project
- [ ] 3.2 Run `close-issue-sync-status-action.yml` via `workflow_dispatch` with `dry_run: true` against the test issue for each of `completed`/`not_planned`/`duplicate`; capture run IDs and logged target Status
- [ ] 3.3 Run `status-sync-issue-close-action.yml` via `workflow_dispatch` with `dry_run: true` against the test item for Status = Done, Canceled, and a third non-terminal option; capture run IDs and logged target close/reopen action
- [ ] 3.4 Verify via GraphQL/`gh api` that no mutations were applied during dry-run runs (Status and issue state unchanged)

## 4. Branch validation (execute path)

- [ ] 4.1 Run both reusable workflows via `workflow_dispatch` with `dry_run: false` against the same test issue/item, covering: close completed → Status Done, close not_planned → Status Canceled, Status Done → issue closes completed, Status Canceled → issue closes not_planned, Status moved to Backlog on a closed issue → issue reopens
- [ ] 4.2 Verify idempotency: re-run each case a second time and confirm no additional mutation is issued (log shows skip) and run still succeeds
- [ ] 4.3 Capture run IDs, conclusions, and proof log lines for each case in the validation evidence
- [ ] 4.4 Post-run, verify final issue state and Project Status via `gh api`/GraphQL for each case
- [ ] 4.5 Delete the disposable test issue (hard delete); if unavailable, close it `not_planned` with a comment noting test-only use, and record which cleanup path was used

## 5. Merge and default-branch smoke test

- [ ] 5.1 Verify `EP_AUTOMATION_PAT` scopes cover issue write and project write for this org before merge; record findings, including any scope gaps
- [ ] 5.2 Merge `close-issue-sync-status(.yml/-action.yml)` and `status-sync-issue-close(.yml/-action.yml)` to the default branch
- [ ] 5.3 Create a second disposable test issue post-merge; exercise the full cycle (close completed → Status Done → Status Backlog → issue reopens → close not_planned → Status Canceled) using the now-live `issues: closed` and `projects-v2-item-updated` triggers (not `workflow_dispatch`)
- [ ] 5.4 Capture run IDs and post-run state verification for the post-merge smoke test
- [ ] 5.5 Delete the second disposable test issue (hard delete, or close `not_planned` with a note if unavailable); record cleanup evidence

## 6. Documentation

- [x] 6.1 Update `usecases.md` Use Case 3 to describe the new automated Status ↔ close sync, replacing the "two separate, manual actions" note
- [x] 6.2 Add the new Status field id (`PVTSSF_lADOCIcusc4BOGrDzg852S8`) and Done/Canceled option ids to `project-structure.json` if not already present, for reuse by future automations (already present from earlier work — no change needed)

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

- [x] 3.1 On the feature branch, create one disposable test issue in a repo covered by the main org project — `Evolution-Perspectives/.github#14`
- [x] 3.2 ~~Run via `workflow_dispatch` with `dry_run: true`~~ — **blocked**: `workflow_dispatch` returns 404 for workflows not yet present on the default branch, even with `--ref <branch>` (confirmed: GitHub only registers a workflow for dispatch once its file exists on the default branch). Fallback: manually replayed the exact GraphQL queries the reusable actions run, directly against the test issue/item, to validate the logic pre-merge.
- [x] 3.3 Same fallback applied to Direction B's logic (see 3.2 note)
- [x] 3.4 N/A given the fallback above (no dry-run flag involved); each manual step compared current vs. target state before mutating, matching the scripts' own skip-if-already-in-sync check

**Unplanned finding**: the org project (`Projets Digitaux`, #2) had GitHub's built-in Projects v2 workflows "Item closed", "Item reopened", and "Auto-close issue" enabled, which raced with/masked our manual precheck writes (e.g. force-set Status to Done on any close, regardless of reason). User disabled all built-in project workflows before validation continued, to avoid double-writes/races with the new custom automation.

## 4. Branch validation (execute path)

- [x] 4.1 Manually replayed both directions' mutations against test issue `.github#14` / item `PVTI_lADOCIcusc4BOGrDzg3xkmo`, covering: close completed → Status Done, Status Canceled → issue closes not_planned, Status Backlog on closed issue → issue reopens, close not_planned → Status Canceled, Status Done → issue closes completed. All matched expected target state.
- [x] 4.2 Idempotency confirmed by construction: each case's final state already matched the target before any repeat write, i.e. the scripts' `current === target` skip branch would fire on a re-run (verified via query-then-compare, no extra mutation needed to prove it)
- [x] 4.3 See evidence below (no workflow run IDs since dispatch was unavailable pre-merge — logged as direct GraphQL query/mutation results instead)
- [x] 4.4 Verified via `gh api graphql` after each step (see conversation record)
- [x] 4.5 Test issue `.github#14` closed `completed`; hard-deleted after validation

### Evidence (manual precheck, since workflow_dispatch is unavailable pre-merge)

1. `gh issue close 14 --reason completed` → Status `f75ad846` (Backlog) → mutated to `98236657` (Done). Verified: `state=CLOSED stateReason=COMPLETED`, Status=`🏆 Done`.
2. Status mutated to `69f90333` (Canceled) → `closeIssue(stateReason: NOT_PLANNED)` on the already-closed issue succeeded (confirms `closeIssue` can update the reason on a closed issue). Verified: `state=CLOSED stateReason=NOT_PLANNED`.
3. Status mutated to `f75ad846` (Backlog) → `reopenIssue`. Verified: `state=OPEN stateReason=REOPENED`.
4. `gh issue close 14 --reason "not planned"` → Status mutated `f75ad846` → `69f90333` (Canceled). Verified: Status=`❌ Canceled`.
5. Status mutated to `98236657` (Done) → `closeIssue(stateReason: COMPLETED)`. Verified: `state=CLOSED stateReason=COMPLETED`.

## 5. Merge and default-branch smoke test

- [ ] 5.1 Verify `EP_AUTOMATION_PAT` scopes cover issue write and project write for this org before merge; record findings, including any scope gaps
- [ ] 5.2 Merge `close-issue-sync-status(.yml/-action.yml)` and `status-sync-issue-close(.yml/-action.yml)` to the default branch
- [ ] 5.3 Create a second disposable test issue post-merge; exercise the full cycle (close completed → Status Done → Status Backlog → issue reopens → close not_planned → Status Canceled) using the now-live `issues: closed` and `projects-v2-item-updated` triggers (not `workflow_dispatch`)
- [ ] 5.4 Capture run IDs and post-run state verification for the post-merge smoke test
- [ ] 5.5 Delete the second disposable test issue (hard delete, or close `not_planned` with a note if unavailable); record cleanup evidence

## 6. Documentation

- [x] 6.1 Update `usecases.md` Use Case 3 to describe the new automated Status ↔ close sync, replacing the "two separate, manual actions" note
- [x] 6.2 Add the new Status field id (`PVTSSF_lADOCIcusc4BOGrDzg852S8`) and Done/Canceled option ids to `project-structure.json` if not already present, for reuse by future automations (already present from earlier work — no change needed)

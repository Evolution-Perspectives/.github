## 1. Capacity Config

- [x] 1.1 Create `.github/capacity.yml` schema definition (users map, non_working_days list)
- [x] 1.2 Add capacity config loader to `projects-rollup.js` (read, parse, validate YAML)
- [x] 1.3 Handle missing file (skip scheduling, warn in summary)
- [x] 1.4 Handle malformed file (fail scheduling phase with clear error, preserve rollup writes)
- [x] 1.5 Write unit tests for capacity config loader (valid, missing, malformed, non-working days)

## 2. Scheduling Algorithm

- [x] 2.1 Implement per-person sequential scheduler function (drain estimate bucket day by day against daily capacity, skipping weekends and non-working days)
- [x] 2.2 Implement parallel track runner (one track per assignee, independent execution)
- [x] 2.3 Implement parent date derivation (start = min child start, end = max child end, bottom-up)
- [x] 2.4 Handle unassigned leaf issues (skip with warning, do not fail run)
- [x] 2.5 Handle zero-estimate leaf issues (start = end = anchor date, consume no capacity)
- [x] 2.6 Handle multiple assignees on a single issue (use first assignee, log info)
- [x] 2.7 Write unit tests: single assignee single issue, multi-issue sequential, multi-assignee parallel, span across weekend, unassigned skip, zero-estimate
- [x] 2.8 Support configurable anchor date (`schedule_start_date` input, default today UTC)

## 3. Workflow Integration

- [x] 3.1 Add `start_date_field_id` input to `projects-estimation-rollup-action.yml`
- [x] 3.2 Add `end_date_field_id` input to `projects-estimation-rollup-action.yml`
- [x] 3.3 Add `schedule_start_date` input to `projects-estimation-rollup-action.yml`
- [x] 3.4 Pass new inputs through trigger workflow (`projects-estimation-rollup.yml`)
- [x] 3.5 Update org template (`projects-estimation-rollup.yml`) to expose new inputs
- [x] 3.6 Wire new env vars to JS engine invocation in reusable workflow step

## 4. Field Writes

- [x] 4.1 Implement date field write via GitHub Project V2 GraphQL mutation (`updateProjectV2ItemFieldValue` with date type)
- [x] 4.2 Skip date field writes when field IDs are not configured (safe no-op)
- [x] 4.3 Respect dry-run mode: compute dates but skip writes
- [x] 4.4 Write unit tests for date field write gating (configured, not configured, dry-run)

## 5. Observability

- [x] 5.1 Add scheduling section to Actions run summary: scheduled count, skipped count, write count, per-issue warnings
- [x] 5.2 Add debug logging for per-assignee schedule timeline (day-by-day drain visible in debug mode)
- [x] 5.3 Validate reference integrity via `validate-rollup-references.ps1` still passes after changes

## 6. Pilot Validation

- [ ] 6.1 Populate `.github/capacity.yml` in Evolution-Perspectives/.github with real assignee calendars
- [ ] 6.2 Create two date fields in Projets Digitaux project V2 (Start Date, End Date)
- [ ] 6.3 Configure `start_date_field_id` and `end_date_field_id` in trigger workflow
- [ ] 6.4 Run dry-run mode: verify computed dates in logs match expected schedule
- [ ] 6.5 Run write mode: verify date fields appear correctly on project board
- [ ] 6.6 Validate single-item path, multi-item path, no-op path, partial-failure path (unassigned issue)
- [ ] 6.7 Document pilot results in rollout notes

## 7. Test-Data Cleanup

- [ ] 7.1 Record IDs of any GitHub issues or project items created specifically for pilot validation
- [ ] 7.2 Delete temporary validation items (hard delete via GraphQL where possible; close with reason as fallback)
- [ ] 7.3 Verify no temporary items remain (re-query by ID and confirm 404 or closed state)
- [ ] 7.4 Record cleanup evidence in rollout notes (created IDs, deletion method, final verification result)

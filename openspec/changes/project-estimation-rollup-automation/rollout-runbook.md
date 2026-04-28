## Rollout Runbook

### Prerequisites

1. Configure secret `EP_AUTOMATION_PAT` in the target repository or org with required project and issue read/write permissions.
2. Configure required repository variables:
- `EP_PROJECT_V2_ID`
- `EP_ESTIMATE_FIELD_ID`
- Optional: `EP_REMAINING_HOURS_FIELD_ID`, `EP_FORECAST_DATE_FIELD_ID`, `EP_FORECAST_STATE_FIELD_ID`, `EP_INCOMPLETE_FORECAST_OPTION_ID`
- Optional behavior flags: `EP_STRICT_MODE`, `EP_CAPACITY_HOURS_PER_DAY`, `EP_NON_WORKING_WEEKDAYS`, `EP_NON_WORKING_DATES`, `EP_MAX_PROJECT_ITEMS`, `EP_FAIL_FAST`, `EP_ROLLUP_DEBUG`

### Pilot Rollout Steps

1. Add workflow from template `projects-estimation-rollup.yml` in one pilot repository.
2. Dispatch a dry run:
- `workflow_dispatch` with `dry_run=true`
3. Validate summary metrics:
- Items discovered
- Roots processed
- Items changed
- No-op roots
- Roots failed
4. Dispatch a write run (`dry_run=false`) after dry run review.
5. Validate that parent estimates and forecast fields match expected rollups.

### Rollback Plan

1. Disable or remove trigger workflow `.github/workflows/projects-estimation-rollup.yml` in consumer repositories.
2. Keep reusable workflow in central repo unchanged for forensics.
3. Run one final dry run to confirm no pending writes before complete disablement.

### Replay Diagnostics

Use the correlation identifier in Actions summary to match run logs and manually replay with:

- `workflow_dispatch` + `root_item_id`
- `workflow_dispatch` + `event_item_node_id`

### Pilot Metrics Capture Template

- Pilot repository:
- Run URL:
- Correlation ID:
- Items discovered:
- Roots processed:
- Items changed:
- No-op roots:
- Roots failed:
- Forecast incomplete roots:
- Readiness decision (go / no-go):
- Notes:

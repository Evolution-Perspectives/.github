## Context

The rollup engine (`projects-rollup.js`) already traverses the issue hierarchy and computes estimate hours bottom-up. Forecast date derivation exists in the design but was scoped to a single global capacity calendar applied at the root level. The organization needs per-issue start and end dates driven by who is assigned to each issue and how many hours per weekday that person is available.

Current state: no scheduling phase exists in the engine. Field writes are limited to estimate hours.

Constraints:
- Must remain repository-agnostic and fit the organization workflow template pattern.
- Must integrate into the existing rollup run (no separate workflow required for the initial version).
- Capacity data must be defined in the repository, not an external service.

## Goals / Non-Goals

**Goals:**

- Compute a start date and end date for every leaf issue based on the assignee's per-weekday capacity and the estimate hours.
- Schedule each person's issues sequentially (one after another per person, in priority or project order).
- Schedule issues in parallel across different assignees.
- Derive parent start/end dates as: start = earliest child start, end = latest child end.
- Write start and end dates to configurable GitHub Project V2 date fields.
- Skip weekend days and respect configured non-working days.

**Non-Goals:**

- Real-time scheduling updates on every keystroke or edit.
- Multi-project capacity aggregation across different project boards.
- Dependency-constrained scheduling (issue B cannot start until issue A ends) in the first version.
- Leave or vacation tracking integration.
- UI for editing capacity calendars.

## Decisions

### 1. Capacity calendar storage

Store capacity calendars in a YAML config file in the repository (e.g., `.github/capacity.yml`), keyed by GitHub login.

```yaml
users:
  nicolas:
    monday: 6
    tuesday: 6
    wednesday: 6
    thursday: 7
    friday: 4
  alice:
    monday: 8
    tuesday: 8
    wednesday: 8
    thursday: 8
    friday: 8
```

Alternatives considered:
- GitHub Project custom field per assignee: rejected because date fields on project items are per-item, not per-user; no native per-user capacity field exists.
- External config service: rejected due to added dependency and complexity for no gain.
- Single global capacity calendar: rejected because it cannot model different schedules per person.

### 2. Scheduling algorithm — per person

For each assignee, collect all leaf issues assigned to them and sort by item order in the project (existing project item order or `priority` field if present). Then drain the estimate bucket sequentially:

```
for each working day starting from today (or configured start date):
  for each issue in the person's queue (in order):
    while issue has remaining hours and day has capacity:
      consume min(remaining_issue_hours, remaining_day_capacity)
    if issue fully consumed:
      record end date = current day
      move to next issue
      set next issue start = same day if capacity remains, else next working day
```

Alternatives considered:
- Sort by due date: rejected because due dates are what we are computing, not inputs.
- Parallel within a person (split day across issues): rejected because splitting focus in a single day is unrealistic and harder to reason about.

### 3. Scheduling algorithm — across people

Each assignee runs an independent scheduling track starting from the same anchor date. Tracks run in parallel. No cross-person coordination is needed at the leaf level.

Parent date derivation: parent start = min(all child start dates), parent end = max(all child end dates). This propagates bottom-up after all leaf schedules are computed.

### 4. Anchor date

The scheduler starts from today (UTC) by default. A configurable `schedule_start_date` input can override this for what-if planning.

Alternatives considered:
- Use the earliest existing start date already on the project: rejected because it mixes computed and manual values and complicates idempotency.

### 5. Unassigned issues

If a leaf issue has no assignee, it cannot be scheduled. The scheduler skips it and logs a warning. Parent dates are derived only from children that have computed dates; if no children have dates, the parent date is left empty.

Alternatives considered:
- Default unassigned issues to a "team" calendar: rejected because it hides the missing assignment and produces misleading dates.

### 6. Field write targets

Two new configurable inputs added to the reusable workflow:
- `start_date_field_id`: Project V2 date field ID for start date.
- `end_date_field_id`: Project V2 date field ID for end date.

If either field ID is not configured, the scheduling phase computes dates but does not write them (safe no-op).

### 7. Non-working days

Non-working days are defined as weekends (Saturday, Sunday) plus an optional list of dates in the config file:

```yaml
non_working_days:
  - "2026-05-01"
  - "2026-07-14"
```

### 8. Integration with rollup run

The scheduling phase runs after the estimate rollup phase in the same workflow execution. Estimate hours must be finalized before scheduling begins. Scheduling reads the computed estimate values (not project field values) to avoid a round-trip.

## Risks / Trade-offs

- [Issue ordering in project may not reflect true priority] → Mitigation: document that project item order drives scheduling; users should reorder items in the project board to reflect priority.
- [Multiple assignees on a single issue] → Mitigation: use the first assignee listed; document this limitation. Multi-assignee splitting is a future enhancement.
- [Capacity config file missing or malformed] → Mitigation: fail the scheduling phase with a clear error; estimate rollup phase results are still written.
- [Unassigned leaves leave parent dates incomplete] → Mitigation: log warning per unassigned issue; emit count in Actions summary so operators can see what was skipped.
- [Date field overwrites user-entered dates] → Mitigation: scheduling always recomputes from scratch; document that start/end date fields are fully automation-owned, same as parent estimate fields.

## Migration Plan

1. Add `.github/capacity.yml` to the pilot repository with assignee calendars.
2. Create two new date fields in the GitHub Project V2 for start date and end date.
3. Configure `start_date_field_id` and `end_date_field_id` in the trigger workflow.
4. Run in dry-run mode first to validate computed dates.
5. Run in write mode to apply dates.
6. Validate via project board view that dates appear correctly.
7. Rollback: remove field IDs from workflow inputs to disable scheduling phase; date fields revert to empty on next run (if write mode is re-enabled).

## Test-Data Cleanup Plan

Any GitHub issues, pull requests, or project items created specifically to validate the scheduling phase must be deleted or closed with an explicit reason after validation. Hard delete via GraphQL is preferred. Evidence of cleanup must be recorded in the rollout notes.

## Open Questions

- Should `schedule_start_date` default to today UTC or today in the organization's local timezone?
- Should issues with zero estimate hours be scheduled as zero-duration (same-day start and end) or skipped?
- In the first version, is project item order sufficient for sequencing, or do we need a dedicated priority field?

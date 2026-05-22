## Why

The rollup engine computes estimate hours per issue but has no way to translate those hours into calendar dates. Issues have assignees and each person works a different number of hours per day across the week. Without per-person capacity calendars, there is no way to know when any given issue will start or end, and parent completion dates cannot be derived from the schedule of their children.

## What Changes

- Introduce a capacity calendar definition per assignee: daily available hours per weekday.
- Implement a per-person sequential scheduler: for each assignee, issues are scheduled one after another based on priority or dependency order, draining the estimate bucket day by day against their capacity pattern.
- Implement parallel scheduling across people: different assignees work their own tracks simultaneously; parent dates are derived as the earliest child start and the latest child end.
- Write computed start date and end date back to configurable GitHub Project V2 date fields on each issue.
- Extend the rollup engine to run the scheduler after the estimate rollup phase.

## Capabilities

### New Capabilities

- `capacity-calendar`: Per-assignee weekly capacity definition (hours available per weekday). Stored in a config file in the repository.
- `issue-schedule`: Per-issue start and end date computation driven by the assignee's capacity calendar and sequential ordering within that person's workload. Parent issue dates are derived from the union of child schedules.

### Modified Capabilities

- `projects-forecast-date-automation`: The existing forecast date spec uses a single capacity calendar applied globally. This change supersedes that model by making capacity per-assignee and producing start/end dates per issue rather than a single forecast date at the root level.

## Impact

- `.github/scripts/projects-rollup.js`: Extended with a scheduling phase after rollup.
- Capacity config file (new, path TBD in design): defines per-person daily capacity.
- GitHub Project V2: two new date field IDs required in config (start date, end date).
- `.github/workflows/projects-estimation-rollup-action.yml`: new input parameters for schedule field IDs.
- `.github/workflow-templates/projects-estimation-rollup.yml`: updated to expose schedule field inputs.

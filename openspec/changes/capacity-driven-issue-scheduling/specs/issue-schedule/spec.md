## ADDED Requirements

### Requirement: Sequential per-person scheduling

The system SHALL schedule each assignee's leaf issues sequentially, draining the estimate hours bucket day by day against that person's daily capacity. Issues are processed in project item order.

#### Scenario: Single assignee, single issue

- **WHEN** an assignee has one leaf issue with an estimate of N hours
- **THEN** the start date is the anchor date (today UTC or configured override) and the end date is the day the estimate bucket reaches zero given the assignee's daily capacity

#### Scenario: Single assignee, multiple issues

- **WHEN** an assignee has multiple leaf issues in project order
- **THEN** issues are scheduled one after another: the second issue starts on the same day as the first issue ends (if capacity remains) or on the next working day otherwise

#### Scenario: Issue spans multiple days

- **WHEN** an issue estimate exceeds a single day's available capacity for the assignee
- **THEN** the scheduler carries remaining hours to the next working day, skipping weekends and non-working days, until the bucket reaches zero

#### Scenario: Parallel tracks across assignees

- **WHEN** two leaf issues belong to different assignees
- **THEN** their schedules are computed independently and may overlap in calendar time

#### Scenario: Zero-estimate leaf issue

- **WHEN** a leaf issue has no estimate or an estimate of 0 hours
- **THEN** the issue receives the same start and end date equal to the anchor date and no capacity is consumed

#### Scenario: Unassigned leaf issue

- **WHEN** a leaf issue has no assignee
- **THEN** the scheduler skips that issue, logs a warning with the issue identifier, and does not compute dates for it

### Requirement: Parent date derivation from child schedules

The system SHALL compute parent issue dates bottom-up: start = earliest child start date, end = latest child end date.

#### Scenario: Parent with all children scheduled

- **WHEN** all children of a parent have computed start and end dates
- **THEN** parent start date equals the minimum child start date and parent end date equals the maximum child end date

#### Scenario: Parent with partially scheduled children

- **WHEN** some children have computed dates and some do not (e.g., unassigned)
- **THEN** parent dates are derived only from children that have dates; if no children have dates, parent date fields are left empty

### Requirement: Start and end date field writes

The system SHALL write computed start and end dates to configurable GitHub Project V2 date fields.

#### Scenario: Both field IDs configured

- **WHEN** `start_date_field_id` and `end_date_field_id` are configured and dates are computed
- **THEN** the system writes start and end dates to the respective project fields for each item

#### Scenario: Field IDs not configured

- **WHEN** either `start_date_field_id` or `end_date_field_id` is not configured
- **THEN** the scheduling phase computes dates but does not write any field values

#### Scenario: Dry-run mode

- **WHEN** the workflow runs with `dry_run: true`
- **THEN** dates are computed and logged but no field writes occur

### Requirement: Scheduling anchor date

The system SHALL use today (UTC) as the default scheduling start date. A configurable `schedule_start_date` input SHALL override this for what-if planning scenarios.

#### Scenario: Default anchor date

- **WHEN** no `schedule_start_date` is provided
- **THEN** scheduling begins from today UTC

#### Scenario: Custom anchor date

- **WHEN** `schedule_start_date` is provided as an ISO 8601 date string
- **THEN** scheduling begins from that date

### Requirement: Scheduling observability

The system SHALL include scheduling results in the Actions run summary.

#### Scenario: Summary after scheduling

- **WHEN** the scheduling phase completes
- **THEN** the Actions summary includes: number of issues scheduled, number skipped (unassigned or no estimate), number of field writes performed, and any warnings for skipped issues

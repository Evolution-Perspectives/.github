## MODIFIED Requirements

### Requirement: Forecast date derivation from hours and capacity

The system SHALL derive per-issue start and end dates using per-assignee capacity calendars rather than a single global capacity calendar. The global forecast date at the root level is superseded by individual issue date fields computed by the scheduling phase.

#### Scenario: Forecast update after rollup change

- **WHEN** rolled-up estimate hours for a hierarchy root change after recomputation
- **THEN** the system recomputes per-issue start and end dates using the assignee capacity calendars and writes results to the configured date fields

#### Scenario: Root item end date as forecast

- **WHEN** a root item's children all have computed end dates
- **THEN** the root item end date represents the forecast completion date for the entire hierarchy

## REMOVED Requirements

### Requirement: Global capacity calendar

**Reason**: Replaced by per-assignee capacity calendars defined in `.github/capacity.yml`. A single global calendar cannot model different weekly patterns across team members.
**Migration**: Move the global capacity value to `.github/capacity.yml` under each relevant assignee login with the same daily hour value.

## ADDED Requirements

### Requirement: Per-assignee weekly capacity definition

The system SHALL support a per-assignee capacity calendar defined in a YAML file (`.github/capacity.yml`) in the repository. The calendar specifies available working hours per weekday for each GitHub login.

#### Scenario: Valid capacity file loaded

- **WHEN** the scheduler reads `.github/capacity.yml` and the file is present and valid
- **THEN** each assignee's daily hour values are available to the scheduling algorithm

#### Scenario: Assignee missing from capacity file

- **WHEN** a leaf issue is assigned to a GitHub login that has no entry in the capacity file
- **THEN** the scheduler logs a warning for that issue and skips scheduling it, without failing the run

#### Scenario: Capacity file is absent

- **WHEN** `.github/capacity.yml` does not exist in the repository
- **THEN** the scheduling phase is skipped entirely and a warning is emitted in the Actions summary

#### Scenario: Capacity file is malformed

- **WHEN** `.github/capacity.yml` exists but fails YAML parsing or schema validation
- **THEN** the scheduling phase fails with a clear error message identifying the parse problem; the estimate rollup phase results are still written

#### Scenario: Non-working days configured

- **WHEN** `.github/capacity.yml` contains a `non_working_days` list of dates
- **THEN** those dates are skipped during scheduling as if they were weekends

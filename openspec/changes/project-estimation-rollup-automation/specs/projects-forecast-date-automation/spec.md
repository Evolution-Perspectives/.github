## ADDED Requirements

### Requirement: Forecast date derivation from hours and capacity
The system SHALL derive forecast completion date from rolled-up remaining hours using configured capacity calendars and working-day rules.

#### Scenario: Forecast update after rollup change
- **WHEN** remaining hours for a hierarchy root change after recomputation
- **THEN** the system recalculates and writes the forecast date using the configured calendar rules

### Requirement: Incomplete forecast handling
The system MUST mark forecast state as incomplete when required descendant estimate data is missing under strict estimation mode.

#### Scenario: Missing child estimate in strict mode
- **WHEN** at least one required descendant estimate is missing
- **THEN** the system does not publish a definitive forecast date and records incomplete forecast state with reason metadata

### Requirement: Calendar exception support
The system SHALL exclude non-working days and configured exception dates from forecast calculations.

#### Scenario: Capacity spans weekend
- **WHEN** remaining hours require work across a weekend and weekend days are non-working
- **THEN** the forecast date advances to the next working day according to calendar configuration

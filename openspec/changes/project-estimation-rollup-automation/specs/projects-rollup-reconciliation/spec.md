## ADDED Requirements

### Requirement: Scheduled full reconciliation
The system SHALL run a scheduled full reconciliation that recomputes tracked hierarchies and repairs drift between stored and computed values.

#### Scenario: Drift repaired during nightly run
- **WHEN** nightly reconciliation detects stored parent values that differ from computed rollups
- **THEN** the system updates mismatched values and reports repaired item counts in the summary

### Requirement: Partial-failure continuation
The system MUST continue processing remaining hierarchies when one hierarchy fails, unless an explicit fail-fast mode is enabled.

#### Scenario: One hierarchy fails validation
- **WHEN** reconciliation encounters one invalid hierarchy and fail-fast is disabled
- **THEN** the system records the failure, continues with other hierarchies, and completes with partial-failure metrics

### Requirement: Replay-safe idempotency
The system SHALL produce the same persisted state when a reconciliation run is retried with unchanged source data.

#### Scenario: Retry after transient API failure
- **WHEN** a reconciliation run is rerun after a transient upstream failure without source changes
- **THEN** the resulting persisted estimates and forecasts are identical to a single successful run

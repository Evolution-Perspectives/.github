## ADDED Requirements

### Requirement: Bottom-up estimate rollup
The system SHALL compute effective estimate hours for each hierarchy node using a bottom-up traversal, where leaves use their own estimate and non-leaf nodes use the sum of child effective estimates.

#### Scenario: Recompute after leaf estimate change
- **WHEN** a leaf work item estimate changes
- **THEN** the system recomputes that item's ancestor chain from deepest changed branch to root and writes updated parent estimates deterministically

#### Scenario: Parent with direct estimate and children
- **WHEN** an item has one or more children and also has a manually entered estimate
- **THEN** the system treats the parent estimate field as derived from children and ignores manual parent override

### Requirement: Deterministic single-writer updates
The system MUST serialize writes for the same hierarchy root and apply idempotent updates so concurrent events do not produce conflicting parent values.

#### Scenario: Concurrent updates within same hierarchy
- **WHEN** two estimate-change events arrive for descendants under the same root near-simultaneously
- **THEN** the system processes updates in a serialized order and final persisted values equal the result of the latest complete hierarchy recomputation

### Requirement: Rollup observability
The system SHALL publish run summary metrics including items discovered, items updated, items failed, and a correlation identifier for replay diagnostics.

#### Scenario: Successful no-op recompute
- **WHEN** a rollup run finds no value differences to persist
- **THEN** the run is marked successful and the summary reports zero updates with the correlation identifier

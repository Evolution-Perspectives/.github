## ADDED Requirements

### Requirement: New page request form contract
The system SHALL provide a dedicated "Nouvelle Page Web" issue form with deterministic field structure for request intake.

#### Scenario: Submitter opens new page request form
- **WHEN** a user selects the "Nouvelle Page Web" intake form
- **THEN** the form presents the canonical fields for page type, site, page name, optional description, priority, kickoff flag, template flag, and new modules flag

### Requirement: Parent priority capture in form
The form SHALL expose priority options aligned with the project priority vocabulary and SHALL default to Planifie.

#### Scenario: Submitter does not change priority
- **WHEN** a user submits the form without changing the priority field
- **THEN** the selected priority value is Planifie

#### Scenario: Submitter selects a different priority
- **WHEN** a user selects a non-default priority option
- **THEN** the selected value is captured in the intake payload exactly as displayed in the form

### Requirement: Kickoff flag default behavior
The form SHALL include a boolean kickoff field that defaults to false.

#### Scenario: Submitter leaves kickoff unchecked
- **WHEN** the user submits with kickoff unchecked
- **THEN** the intake payload marks kickoff as false

#### Scenario: Submitter enables kickoff
- **WHEN** the user submits with kickoff checked
- **THEN** the intake payload marks kickoff as true

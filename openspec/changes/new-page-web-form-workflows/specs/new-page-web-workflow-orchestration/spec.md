## ADDED Requirements

### Requirement: Parent issue creation from request form
The workflow SHALL create a parent issue from submitted form data using the configured naming convention.

#### Scenario: Valid form submission
- **WHEN** the workflow receives a valid new page form submission
- **THEN** it creates one parent issue using the expected title pattern and issue type

### Requirement: Deterministic subissue set creation
The workflow SHALL create the baseline subissue set and conditional subissues based on boolean inputs.

#### Scenario: Submission with no optional flags
- **WHEN** kickoff, template, and new modules flags are all false
- **THEN** the workflow creates only the baseline subissues

#### Scenario: Submission with conditional flags enabled
- **WHEN** one or more optional flags are true
- **THEN** the workflow creates each corresponding conditional subissue exactly once

### Requirement: Kickoff gating behavior
When kickoff is enabled, the workflow MUST create kickoff first and MUST wire kickoff as a blocker of all other subissues.

#### Scenario: Kickoff enabled
- **WHEN** kickoff is true for a submission
- **THEN** kickoff subissue is created before other subissues
- **THEN** every other created subissue is marked as blocked by kickoff

#### Scenario: Kickoff disabled
- **WHEN** kickoff is false for a submission
- **THEN** no kickoff subissue is created
- **THEN** no kickoff dependency links are created

### Requirement: Parent-only priority assignment in this flow
The workflow SHALL apply priority to the parent issue only and SHALL NOT set child issue priority values.

#### Scenario: Parent priority assignment
- **WHEN** the workflow processes a submission with a selected priority value
- **THEN** it sets that value on the parent issue/project item

#### Scenario: Child priority ownership boundary
- **WHEN** child subissues are created in this flow
- **THEN** the workflow does not write child priority values

### Requirement: Idempotent orchestration behavior
The workflow SHALL avoid duplicate issue creation and duplicate dependency wiring when rerun with the same input.

#### Scenario: Workflow rerun for same submission
- **WHEN** the orchestration workflow is re-executed for an already-processed submission
- **THEN** no duplicate parent or child issues are created
- **THEN** no duplicate dependency links are added

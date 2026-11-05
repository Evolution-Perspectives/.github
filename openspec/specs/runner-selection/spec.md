# runner-selection Specification

## Purpose
Let a workflow choose, explicitly and without indirection, whether its job runs on a GitHub-hosted runner or on the self-hosted pool, so the public `.github` repository and every repo's own CI stay on hosted runners.

## Requirements

### Requirement: Engines take the runner as an input
Each reusable `engine-*.yml` SHALL accept an optional `runner` input whose default is `ubuntu-latest` and SHALL use it as the job's `runs-on`.

#### Scenario: Default stays hosted
- **WHEN** an engine is called without `runner`
- **THEN** its job runs on `ubuntu-latest`

#### Scenario: Caller selects the pool
- **WHEN** an engine is called with `runner: ep-github-runner`
- **THEN** its job is queued for the self-hosted pool

### Requirement: Label hardcoded by the callers that need it
The managed callers deployed to private repositories SHALL pass the literal label `ep-github-runner`, and the system SHALL NOT use an organization or repository variable to select the runner.

#### Scenario: No variable indirection
- **WHEN** a managed caller is rendered
- **THEN** its `runner` value is the literal label and contains no `vars.` expression

### Requirement: Public and unrelated workflows stay hosted
The `.github` repository's own callers, the sweep, and every repository's own CI and deploy workflows SHALL NOT reference the self-hosted label.

#### Scenario: Guard test
- **WHEN** the layout check scans the repository
- **THEN** only the managed caller templates contain `ep-github-runner` and no engine hardcodes it

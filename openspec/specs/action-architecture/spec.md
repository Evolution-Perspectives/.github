# action-architecture Specification

## Purpose
Defines how automation logic is laid out in the org `.github` repository so each automation is a self-contained, testable unit while GitHub's flat workflow folder constraint is respected.

## Requirements

### Requirement: One folder per automation
Each automation SHALL live in `actions/<name>/` as a TypeScript action containing `action.yml`, its sources under `src/`, its tests, a committed bundle and a README.

#### Scenario: Action folder is self-contained
- **WHEN** a contributor opens `actions/<name>/`
- **THEN** the folder contains `action.yml`, `src/index.ts`, at least one `src/*.test.ts` file, `dist/index.js` and `README.md`

### Requirement: Flat workflow wrappers
Each action SHALL be exposed through exactly one reusable workflow `.github/workflows/engine-*.yml` that contains no business logic beyond input forwarding and calls the action by full repository path and a ref of `main`, a `v<number>` tag or a full commit SHA.

#### Scenario: Wrapper matches its action
- **WHEN** CI inspects the repository
- **THEN** every `actions/<name>/` is called by exactly one `engine-*.yml` and every `engine-*.yml` calls exactly one existing action

#### Scenario: Orphan is rejected
- **WHEN** an `engine-*.yml` calls an action that does not exist
- **THEN** the CI check fails with the file name

### Requirement: Shared code lives in lib
Code used by two or more actions SHALL live in `lib/` and be bundled into each action at build time, so one ref pins action and library together without any run-time file dependency.

#### Scenario: Shared resolver reused
- **WHEN** two actions need to validate a node ID or retry a GraphQL call
- **THEN** both import the same `lib/` module and neither contains a copy

### Requirement: Logic testable without YAML extraction
Action logic SHALL be testable by importing its TypeScript source directly with fake `graphql` and `core` objects.

#### Scenario: Unit test runs without parsing workflow YAML
- **WHEN** `node --test` runs the action's test file
- **THEN** the source file is imported natively and no workflow YAML is parsed

### Requirement: No hard-coded project identifiers in actions
Actions SHALL resolve field IDs and option IDs live by name and SHALL NOT embed project field ID or option ID literals.

#### Scenario: Feature-branch ref is rejected
- **WHEN** an engine calls its action at a ref that is not `main`, a `v<number>` tag or a full SHA
- **THEN** the CI check fails because the engine passes a secret to the action

#### Scenario: Guard test
- **WHEN** the test suite scans `actions/` and `lib/`
- **THEN** no file contains a project field or option ID literal

### Requirement: Behavior preserved across migration
Migrating an automation into an action SHALL NOT change its trigger, inputs, outputs, dry-run behavior or side effects.

#### Scenario: Existing tests still pass
- **WHEN** an engine is migrated
- **THEN** every assertion of its previous test suite passes against the new source file

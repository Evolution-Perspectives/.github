# Spec Delta

## MODIFIED Requirements

### Requirement: One folder per automation
Each automation SHALL live in `actions/<name>/` as a TypeScript action containing `action.yml`, its sources under `src/`, its tests, a committed bundle and a README.

#### Scenario: Action folder is self-contained
- **WHEN** a contributor opens `actions/<name>/`
- **THEN** the folder contains `action.yml`, `src/index.ts`, at least one `src/*.test.ts` file, `dist/index.js` and `README.md`

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

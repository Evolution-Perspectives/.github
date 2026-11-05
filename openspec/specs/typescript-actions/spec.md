# typescript-actions Specification

## Purpose
Define how the org's automation logic is written, type-checked, bundled and verified as TypeScript actions, so every action is typed, self-contained and reproducible from its source.

## Requirements

### Requirement: Actions are TypeScript bundled to a committed dist
Each automation SHALL be a JavaScript action whose source is TypeScript in `actions/<name>/src/` and whose runnable bundle is the committed file `actions/<name>/dist/index.js`, declared in `action.yml` as `runs: using: node24` and `main: dist/index.js`.

#### Scenario: Action structure
- **WHEN** a contributor opens `actions/<name>/`
- **THEN** it contains `action.yml`, `src/index.ts`, at least one `*.test.ts`, `README.md` and a committed `dist/index.js`

#### Scenario: No wrapper layer
- **WHEN** CI inspects an `action.yml`
- **THEN** it declares `using: node24` and does not use `composite` or `actions/github-script`

### Requirement: The committed bundle matches its source
CI SHALL rebuild every bundle from a clean install and fail when a committed `dist/` differs from the rebuilt one.

#### Scenario: Stale dist is rejected
- **WHEN** a pull request changes a file under `src/` or `lib/` without rebuilding the bundle
- **THEN** the dist check fails and names the action

#### Scenario: Reproducible build
- **WHEN** the bundle is rebuilt twice from the same lockfile
- **THEN** the two outputs are identical

### Requirement: Strict types and erasable syntax
TypeScript sources SHALL compile with `strict` and `erasableSyntaxOnly` and use `.ts` extensions in relative imports and `import type` for types, so the same files type-check with `tsc` and run natively in tests.

#### Scenario: Type error fails CI
- **WHEN** a source file has a type error
- **THEN** `tsc --noEmit` fails and the pull request check fails

#### Scenario: Tests run without a build
- **WHEN** `node --test` runs a `*.test.ts` file
- **THEN** the TypeScript source is imported directly and the tests run

### Requirement: Self-contained bundles
An action bundle SHALL include every dependency and shared library it needs and MUST NOT read other files of the repository at run time, so it works when called from another repository at a pinned ref.

#### Scenario: Cross-repository call needs nothing else
- **WHEN** a workflow in another repository calls the action at a ref
- **THEN** the action runs from `dist/index.js` alone with no checkout and no `npm install`

### Requirement: Behavior parity with the previous implementation
Migrating an action SHALL NOT change its inputs, secrets, outputs, dry-run behavior or side effects, and the assertions of its previous tests SHALL be ported and pass.

#### Scenario: Engine contract unchanged
- **WHEN** an action is migrated
- **THEN** its `engine-*.yml` wrapper is unchanged and still passes the same inputs

#### Scenario: Live dogfood
- **WHEN** an action is migrated and merged
- **THEN** a disposable issue in the `.github` repository exercises its caller successfully and the issue is deleted afterwards

### Requirement: Pinned, reproducible toolchain
The toolchain SHALL be installed from a committed lockfile with `npm ci`, TypeScript SHALL stay on a version supported by the bundler plugin, and dependency updates SHALL arrive through reviewed pull requests.

#### Scenario: Unsupported TypeScript is not adopted silently
- **WHEN** a dependency update would install a TypeScript version the rollup plugin does not support
- **THEN** the build check fails before merge

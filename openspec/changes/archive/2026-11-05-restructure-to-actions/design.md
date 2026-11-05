# Design

## Context

GitHub requires workflow files (reusable or triggered) directly in `.github/workflows/`; subfolders are not scanned. Actions (`action.yml`) can be anywhere and are called with `uses: owner/repo/path@ref`. A remote action is fetched as the whole repository at the pinned ref. A reusable workflow runs in the caller's workspace, so `uses: ./actions/x` inside it would resolve in the caller's repo and fail. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Vertical slice per automation: code, tests, docs in one folder.
- One pin (`@v1` or branch) carries wrapper, action and `lib/` together.
- Tests import source directly.

**Non-Goals:**
- No JavaScript/Docker actions needing a build (`dist/`).
- No generated workflow files.
- No behavior change, no change to input contracts.
- No rollout to other repos (that is `add-managed-workflows`).

## Decisions

- **Name `actions/`**, not `slices/` or `automations/`: each folder holds an `action.yml`, and the call path reads `.../actions/<name>@v1`. Alternatives: `automations/` (domain flavor), `features/` (generic).
- **Composite action running `actions/github-script`**, loading the file with `require(process.env.GITHUB_ACTION_PATH + '/<file>.js')`. Alternative: checkout + require from the workflow, rejected because it needs a second ref pin that can drift.
- **Wrappers hand-written**, with a CI correspondence check. Alternative: generate wrappers from `actions/<name>/workflow.yml`, rejected: duplicated files and a generation step for ~15 lines of YAML.
- **Wrapper calls the action by full path and ref** (`Evolution-Perspectives/.github/actions/<name>@<ref>`). Within this repo the ref is `main` until the `v1` tag exists, then `v1`.
- **`lib/` for shared code only** after a second consumer appears; no speculative sharing.
- **Keep `engine-` workflows**: they give callers a whole job with runner, permissions and `workflow_call` typed inputs, which an action cannot.

## Risks / Trade-offs

- [Remote composite action cannot reach `../../lib`] → Spike first on `blocking-cleanup`, including a call from another repo; fall back to a flat copy of shared helpers in each action.
- [Ref drift between wrapper and action] → Same-ref rule enforced by the CI check, and the `v1` tag moves wrapper and action together.
- [Extra indirection for readers] → README per action links to its wrapper; the correspondence check keeps both discoverable.
- [`copilot-instructions.md` mandates the 4-artifact set incl. `workflow-templates/`] → Update the rule in the same change; the templates decision stays a separate open item.
- [Secret passed to an action pinned to a mutable ref] → The spike wrapper uses a feature-branch ref only until merge and is tested with a throwaway token in a scratch repo. Merged wrappers use `main`, then the `v1` tag, optionally a full SHA; task 4.1 enforces this in CI. `./actions/...` is not an option because a reusable workflow resolves it in the caller's repo.

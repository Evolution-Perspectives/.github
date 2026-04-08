## Why

Blocking relationships can remain attached to closed issues, which leaves stale dependency links in GitHub and creates confusion about what is still blocked. This change ensures dependency edges are automatically cleaned up whenever a blocking issue is closed, regardless of close reason.

## What Changes

- Add an org-standard automation that reacts to issue close events and removes outgoing `blocking` relationships from the closed issue using GitHub GraphQL `removeBlockedBy`.
- Standardize execution through centralized reusable workflow logic in the org `.github` repository, with lightweight per-repo trigger workflows.
- Define behavior for all close reasons (`completed`, `not planned`, `duplicate`) so cleanup always happens.
- Add observability and safe failure handling (logging, continue on per-relationship errors, summary output).

## Capabilities

### New Capabilities

- `issue-dependency-cleanup`: Automatically remove native GitHub issue dependency links where a just-closed issue blocks other issues.

### Modified Capabilities

- None.

## Impact

- GitHub Actions workflows in org repositories (issue close trigger plus reusable workflow call).
- Org-level secret management for PAT used to call GraphQL mutations (`removeBlockedBy`).
- Operational behavior of issue dependencies in GitHub Issues and Project views (fewer stale blocked edges).

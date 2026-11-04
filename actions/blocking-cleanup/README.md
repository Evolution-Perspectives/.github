# blocking-cleanup

When an issue closes, removes every link where it blocks other issues and every link where other issues block it, so nothing stays blocked by a closed issue and a closed issue carries no stale dependency.

- **Called by:** `.github/workflows/engine-remove-blocking-on-close.yml` (reusable engine). Trigger: `.github/workflows/org-issue-closed-remove-blocking.yml`.
- **Source:** `cleanup.js`, loaded by `action.yml` through `github.action_path`.
- **Tests:** `cleanup.test.js` imports the source directly: `node --test actions/blocking-cleanup/cleanup.test.js`.
- **Dry run:** Lists the links that would be removed, removes nothing.

## Behavior

- Reads both relationship lists with pagination.
- A failed removal is reported and does not stop the others.

## Inputs

| Input | Required | Description |
|---|---|---|
| `issue_node_id` | yes | Node ID of the issue that was just closed. |
| `source_repository` | no (default unknown) | Repository where the close event originated. |
| `dry_run` | no (default "false") | If true, list the relationships that would be removed without removing them. |
| `debug` | no (default "false") | Enable verbose logs. |
| `token` | yes | PAT with repo scope. |

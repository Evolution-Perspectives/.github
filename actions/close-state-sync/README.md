# close-state-sync

Closes or reopens the issue from its project Status (Done and Canceled close it, Pending Release closes it as completed, other statuses reopen it).

- **Called by:** `.github/workflows/engine-sync-close-state.yml` (reusable engine). Trigger: `.github/workflows/hook-project-item-updated-sync-close-state.yml`.
- **Source:** `sync.js`, loaded by `action.yml` through `github.action_path`.
- **Tests:** `sync.test.js` imports the source directly: `node --test actions/close-state-sync/sync.test.js`.
- **Dry run:** Validates and summarizes, closes or reopens nothing.

## Behavior

- Pending Deploy is always open.
- Known risk: an item with no Status counts as an "other" status, so a closed issue with an empty Status would be reopened.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project_id` | yes | Projects v2 node ID considered as source of truth. |
| `item_node_id` | yes | Projects v2 item node ID whose Status field changed. |
| `source_repository` | no (default unknown) | Repository where the source event originated. |
| `dry_run` | no (default "false") | If true, validate and summarize without closing/reopening the issue. |
| `debug` | no (default "false") | Enable verbose logs. |
| `token` | yes | PAT used for GitHub API calls. |

# delete-on-removal

Permanently deletes an issue that was removed from the project. Destructive: it only deletes when the issue is confirmed out of the project.

- **Called by:** `.github/workflows/engine-delete-issue-on-project-removal.yml` (reusable engine). Trigger: `.github/workflows/hook-project-item-removed-delete-issue.yml`.
- **Source:** `delete.js`, loaded by `action.yml` through `github.action_path`.
- **Tests:** `delete.test.js` imports the source directly: `node --test actions/delete-on-removal/delete.test.js`.
- **Dry run:** Reports the issue it would delete, deletes nothing.

## Behavior

- Skips non-issue nodes and issues still in the project.
- Treats an already-missing issue as done.
- Inputs are validated against node ID and repository patterns before reaching GraphQL.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project_id` | yes | Projects v2 node ID considered as source of truth. |
| `issue_node_id` | yes | Node ID of the issue to delete. |
| `item_node_id` | no (default "") | Optional project item node ID from the source event. |
| `event_action` | no (default removed) | Source event action (for observability only). |
| `source_repository` | no (default unknown) | Repository where the source event originated. |
| `dry_run` | no (default "false") | If true, validate and summarize without deleting. |
| `debug` | no (default "false") | Enable verbose logs. |
| `token` | yes | PAT used for GitHub API calls. |

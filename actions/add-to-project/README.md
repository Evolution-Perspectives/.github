# add-to-project

Adds an opened issue to the org project and, when `status_name` is given, sets that Status (resolved live by name; the run fails before adding if the name does not exist).

- **Called by:** `.github/workflows/engine-add-issue-to-project.yml` (reusable engine). Trigger: `.github/workflows/org-issue-opened-add-to-project.yml`.
- **Source:** `add.js`, loaded by `action.yml` through `github.action_path`.
- **Tests:** `add.test.js` imports the source directly: `node --test actions/add-to-project/add.test.js`.
- **Dry run:** Resolves and reports, calls no mutation (`dry-run`).

## Behavior

- Skips the add when the issue is already in the project (`already-present`).
- Validates node ID shape before any API call.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project_id` | yes | Node ID of the target GitHub Projects v2 project. |
| `issue_node_id` | yes | Node ID of the issue to add to the project. |
| `issue_number` | no (default unknown) | Number of the issue, for reporting. |
| `source_repository` | no (default unknown) | Repository where the issue was opened. |
| `dry_run` | no (default "false") | Validate and report without calling the mutation. |
| `debug` | no (default "false") | Enable verbose logs. |
| `status_name` | no (default "") | Name of the Status option to set when the issue is added (for example "📦 Backlog"). Resolved live from the project; skipped if empty. |
| `token` | yes | PAT used for GitHub API calls. |

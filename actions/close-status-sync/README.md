# close-status-sync

Sets the project Status from the way an issue was closed: completed goes to Done (or Pending Release when it was In Review), not planned and duplicate go to Canceled.

- **Called by:** `.github/workflows/engine-sync-status-on-close.yml` (reusable engine). Trigger: `.github/workflows/org-issue-closed-sync-status.yml`.
- **Source:** TypeScript in `src/` (`index.ts` reads the inputs, `sync.ts` holds the logic), bundled to the committed `dist/index.js` and run on `node24` (`npm run build`; CI checks the bundle is current).
- **Tests:** `src/sync.test.ts` imports the source directly: `npm test`.
- **Dry run:** Validates and summarizes, writes no Status.

## Behavior

- Never overwrites Pending Release.
- Field and option IDs are resolved live by name; a missing option fails before any write.

## Inputs

| Input | Required | Description |
|---|---|---|
| `issue_node_id` | yes | Node ID of the issue that was just closed. |
| `state_reason` | yes | Close reason reported by the source event (completed, not_planned, duplicate). |
| `source_repository` | no (default unknown) | Repository where the close event originated. |
| `project_id` | yes | Projects v2 node ID considered as source of truth. |
| `dry_run` | no (default "false") | If true, validate and summarize without writing the Status field. |
| `debug` | no (default "false") | Enable verbose logs. |
| `token` | yes | PAT used for GitHub API calls. |

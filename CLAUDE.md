# CLAUDE.md

Org-wide GitHub workflow automation (reusable workflows, scripts, OpenSpec changes). See `.github/copilot-instructions.md` for the workflow rules (mandatory artifact set, naming, runners).

## Project schema

The structure of the org Project "Projets Digitaux" (fields, option IDs, issue types, views, built-in workflows) is snapshotted in `docs/project-schema/`, and `docs/project-schema/reference/` lists what *can* exist (field types, colors, layouts, input shapes, mutations). Read these before guessing IDs or API shapes.

- Cached copy only: workflows must resolve IDs live and never import these files at runtime.
- Do not edit by hand. Refresh with `node .github/scripts/refresh-project-schema.js` (`--check` reports drift).
- A weekly workflow opens a PR when the project structure changes.

## OpenSpec

Active changes under `openspec/changes/*` are gitignored; only `openspec/changes/archive/` is tracked.

## Visibility

This repo is PUBLIC; the org's other repos and the Project are private. Never commit issue titles/bodies, labels, milestones, or any free text from private repos. Structure and IDs only.

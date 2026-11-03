# Project schema

Read-only snapshot of the structure of the org GitHub Project
**Projets Digitaux** (`Evolution-Perspectives` project #2).

GitHub is the source of truth. These files are a cached copy used as a
lookup (field IDs, option IDs, issue types, views) when writing or
reviewing automations, and to detect drift. **Do not edit by hand**, and
do not import them from workflows at runtime: actions must resolve IDs
live so a stale file can never break production.

| File | Content |
|---|---|
| `project.json` | Project node ID, number, title, URL |
| `fields.json` | Every field: name, ID, `dataType` (display order kept) |
| `options/<field>.json` | One file per single-select field (Status, Prio, Entity, Projet, Feature, Domaine, Size, Fiabilite): field ID and options with IDs, in display order |
| `iterations/<field>.json` | Iteration fields, if any are ever added |
| `issue-types.json` | Org issue types with IDs |
| `views.json` | Project views with layout and filter |
| `repos.json` | Repositories linked to the project (may be empty: items can come from any repo) |

## Refresh

```bash
node .github/scripts/refresh-project-schema.js           # rewrite files
node .github/scripts/refresh-project-schema.js --check   # exit 1 on drift
```

Needs `gh` authenticated with `read:project` and `read:org` (locally, your
`gh auth login`; in CI, `EP_AUTOMATION_PAT`).

The `Refresh Project Schema` workflow runs weekly and on demand. When the
project changed, it opens (or updates) a PR on the branch
`chore/project-schema-refresh`. A schema PR is also an early warning: a
renamed or removed option may affect automations that reference it.

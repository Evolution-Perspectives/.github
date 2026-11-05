# Managed workflows

This folder is the **source** of the `org-*.yml` callers that the deploy job (`ops-deploy-managed-workflows.yml`) sends to the org repositories. GitHub does not run anything in this folder.

- `org-*.yml`: caller templates (managed header, `__REF__` and `__RUNNER__` placeholders). Event-driven only: no manual trigger and no inputs, because they run with the org token in every repository.
- `manifest.json`: which callers to deploy, which repositories to exclude, and per-repository exceptions (`ref`, `callers`, `runner`, `manageSecret`).
- This repository's own `.github/workflows/org-*.yml` are rendered from these templates: run `npm run sync-callers` after changing one (a test fails otherwise).

See `docs/managed-workflows.md` and `actions/managed-deploy/README.md`.

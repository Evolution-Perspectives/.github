## 1. Form Contract

- [x] 1.1 Add the "Nouvelle Page Web" issue form file with canonical field IDs and labels.
- [x] 1.2 Configure the priority dropdown values and default to Planifie.
- [x] 1.3 Configure kickoff/template/new-modules booleans with default false.
- [x] 1.4 Ensure optional vs required field validation matches the spec contract.

## 2. Workflow Architecture Packaging

- [x] 2.1 Create reusable workflow engine in `.github/workflows/` for parent/subissue orchestration.
- [x] 2.2 Create thin trigger workflow in `.github/workflows/` that only forwards event payload and parameters.
- [x] 2.3 Create matching organization template YAML in `.github/workflow-templates/`.
- [x] 2.4 Create matching template metadata JSON in `.github/workflow-templates/`.
- [x] 2.5 Verify reference integrity between trigger, reusable workflow, and template artifacts.

## 3. Orchestration Behavior

- [x] 3.1 Implement parent issue creation with canonical title format.
- [x] 3.2 Implement baseline subissue creation with deterministic naming.
- [x] 3.3 Implement conditional creation for kickoff/template/new-modules subissues.
- [x] 3.4 Implement dependency wiring for baseline order.
- [x] 3.5 Implement kickoff gating so kickoff blocks all other created subissues when enabled.
- [x] 3.6 Implement parent-only priority assignment boundary (no child priority writes).
- [x] 3.7 Implement idempotency checks to prevent duplicate issues and duplicate dependency links on rerun.

## 4. Validation

- [ ] 4.1 Validate happy path with all optional flags disabled.
- [ ] 4.2 Validate kickoff-enabled path and confirm kickoff blocks every other subissue.
- [ ] 4.3 Validate conditional template and new-modules paths independently and together.
- [ ] 4.4 Validate parent-only priority write behavior and confirm child priorities are not written by this workflow.
- [ ] 4.5 Validate rerun idempotency (no duplicate issue creation, no duplicate dependency links).
- [ ] 4.6 Capture workflow run IDs, conclusions, and proof log lines for each validation path.
- [ ] 4.7 Verify final system state by API/CLI checks after each validation path.

## 5. Safe Rollout And Cleanup

- [ ] 5.1 Execute pilot validation from a dedicated feature branch with in-scope-only commit.
- [ ] 5.2 If workflow_dispatch is constrained pre-default-branch, execute API-equivalent prechecks, then complete full post-push workflow validation.
- [ ] 5.3 Record token scope checks and document any temporary scope limitations encountered during validation.
- [ ] 5.4 Clean up temporary validation issues/subissues created during testing.
- [ ] 5.5 Capture cleanup evidence with created IDs and post-cleanup verification output.

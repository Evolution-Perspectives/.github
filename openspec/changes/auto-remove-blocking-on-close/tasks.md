## 1. Workflow Inputs and Authentication

- [x] 1.1 Define reusable workflow interface (closed issue node ID, repo context, token input) in org `.github` workflow.
- [x] 1.2 Create a dedicated org PAT for automation bot with required scopes and expiration.
- [x] 1.3 Store PAT as an org secret with selected-repository visibility for pilot rollout.
- [x] 1.4 Add least-privilege workflow permissions and secret usage documentation in workflow comments.

## 2. Dependency Discovery and Mutation Logic

- [x] 2.1 Query closed issue `blocking` connection (with pagination) to collect all blocked issue node IDs.
- [x] 2.2 Implement per-edge `removeBlockedBy(issueId, blockingIssueId)` mutation execution.
- [x] 2.3 Ensure close reason is not filtered; run cleanup for any closed issue reason.
- [x] 2.4 Implement per-edge error handling so one failure does not stop remaining removals.

## 3. Observability and Safety

- [x] 3.1 Add workflow summary output with discovered, removed, and failed counts.
- [x] 3.2 Log failed edges with enough identifiers for manual retry (issue numbers/IDs).
- [x] 3.3 Exit successfully when no outgoing `blocking` edges exist.
- [x] 3.4 Add optional debug mode flag for pilot verification without changing behavior.

## 4. Repository Integration and Rollout

- [x] 4.1 Create thin per-repo trigger workflow (`on: issues.closed`) that calls reusable workflow.
- [x] 4.2 Add trigger workflow template under org workflow templates for easy adoption.
- [ ] 4.3 Validate end-to-end in one pilot repository with test issues A blocks B, then close A.
- [ ] 4.4 Roll out trigger to remaining repositories and verify run history for one sprint.

## 5. Validation

- [ ] 5.1 Test single-edge cleanup (A blocks B).
- [ ] 5.2 Test multi-edge cleanup (A blocks B/C/D).
- [ ] 5.3 Test non-completed close reasons (`not planned`, `duplicate`).
- [ ] 5.4 Test partial-failure behavior and confirm summary reporting.
- [ ] 5.5 Test same-repo and cross-repo dependency edge cleanup by node ID.

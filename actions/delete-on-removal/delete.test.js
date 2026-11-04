// Tests for actions/delete-on-removal/delete.js: the source file is imported directly and run
// against mocked `github` and `core` objects.
const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("../../lib/test-harness.js");
const deleteOnRemoval = require("./delete.js");

const PROJECT = "PVT_kwDOtest";
const baseEnv = { PROJECT_ID: PROJECT, ISSUE_NODE_ID: "I_1", ITEM_NODE_ID: "PVTI_1", EVENT_ACTION: "removed", SOURCE_REPOSITORY: "org/app", DRY_RUN: "false", DEBUG: "false" };

const issueNode = (projects) => ({
  node: {
    __typename: "Issue", id: "I_1", number: 9, title: "t", state: "OPEN",
    repository: { nameWithOwner: "org/app" },
    projectItems: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: projects.map((id) => ({ id: "PVTI_x", project: { id } })) },
  },
});

const go = (env, handler) => run(deleteOnRemoval, { ...baseEnv, ...env }, handler);

test("deletes an issue that is no longer in the project", async () => {
  const { mutations, logs } = await go({}, () => issueNode(["PVT_other"]));
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].query, /deleteIssue/);
  assert.equal(mutations[0].vars.issueId, "I_1");
  assert.equal(logs.failed.length, 0);
});

test("keeps an issue that is still in the project", async () => {
  const { mutations } = await go({}, () => issueNode([PROJECT]));
  assert.equal(mutations.length, 0);
});

test("dry-run reports but does not delete", async () => {
  const { mutations } = await go({ DRY_RUN: "true" }, () => issueNode([]));
  assert.equal(mutations.length, 0);
});

test("a non-issue node is skipped", async () => {
  const { mutations } = await go({}, () => ({ node: { __typename: "PullRequest" } }));
  assert.equal(mutations.length, 0);
});

test("an already-missing issue is not an error", async () => {
  const { mutations, logs } = await go({}, () => ({ node: null }));
  assert.equal(mutations.length, 0);
  assert.equal(logs.failed.length, 0);
});

test("malformed inputs fail before any API call", async () => {
  for (const env of [{ ISSUE_NODE_ID: "I_1`; rm -rf /" }, { PROJECT_ID: "a b" }, { ITEM_NODE_ID: "x'y" }, { SOURCE_REPOSITORY: "not a repo" }]) {
    let called = false;
    const { logs } = await go(env, () => { called = true; return issueNode([]); });
    assert.equal(called, false, JSON.stringify(env));
    assert.equal(logs.failed.length, 1, JSON.stringify(env));
  }
});

test("missing required inputs fail", async () => {
  const { logs } = await go({ ISSUE_NODE_ID: "" }, () => issueNode([]));
  assert.equal(logs.failed.length, 1);
});

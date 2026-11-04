const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("../../lib/test-harness.js");

// Tests for actions/close-state-sync/sync.js (Status -> issue close/reopen).

const statusSyncAction = require("./sync.js");
const PROJECT = "PVT_kwDOtestproject";

function statusEnv(extra = {}) {
  return { PROJECT_ID: PROJECT, ITEM_NODE_ID: "PVTI_item1", SOURCE_REPOSITORY: "org/repo", DRY_RUN: "false", DEBUG: "false", ...extra };
}

function statusHandler({ status, state, stateReason = null }) {
  return () => ({
    node: {
      __typename: "ProjectV2Item",
      id: "PVTI_item1",
      project: { id: PROJECT },
      fieldValueByName: status ? { optionId: "x", name: status } : null,
      content: {
        __typename: "Issue",
        id: "I_issue1",
        number: 7,
        state,
        stateReason,
        repository: { nameWithOwner: "org/repo" },
      },
    },
  });
}

async function statusSync(opts, env) {
  return run(statusSyncAction, statusEnv(env), statusHandler(opts));
}

test("Pending Release closes an open issue as completed", async () => {
  const { mutations } = await statusSync({ status: "📤 Pending Release", state: "OPEN" });
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].query, /closeIssue/);
  assert.equal(mutations[0].vars.reason, "COMPLETED");
});

test("Pending Release leaves an already closed issue alone, whatever the close reason", async () => {
  for (const stateReason of ["COMPLETED", "NOT_PLANNED", "DUPLICATE"]) {
    const { mutations } = await statusSync({ status: "📤 Pending Release", state: "CLOSED", stateReason });
    assert.equal(mutations.length, 0, `reason ${stateReason}`);
  }
});

test("Pending Release in dry-run does not write", async () => {
  const { mutations } = await statusSync({ status: "📤 Pending Release", state: "OPEN" }, { DRY_RUN: "true" });
  assert.equal(mutations.length, 0);
});

test("Pending Deploy is always open: it reopens a closed issue and leaves an open one alone", async () => {
  const closed = await statusSync({ status: "📡 Pending Deploy", state: "CLOSED", stateReason: "COMPLETED" });
  assert.equal(closed.mutations.length, 1);
  assert.match(closed.mutations[0].query, /reopenIssue/);
  const open = await statusSync({ status: "📡 Pending Deploy", state: "OPEN" });
  assert.equal(open.mutations.length, 0);
});

test("Done and Canceled keep their previous behavior", async () => {
  const done = await statusSync({ status: "🏆 Done", state: "OPEN" });
  assert.equal(done.mutations[0].vars.reason, "COMPLETED");
  const doneSync = await statusSync({ status: "🏆 Done", state: "CLOSED", stateReason: "COMPLETED" });
  assert.equal(doneSync.mutations.length, 0);
  const canceled = await statusSync({ status: "❌ Canceled", state: "OPEN" });
  assert.equal(canceled.mutations[0].vars.reason, "NOT_PLANNED");
});

test("Done re-closes an issue that was closed for another reason", async () => {
  const { mutations } = await statusSync({ status: "🏆 Done", state: "CLOSED", stateReason: "NOT_PLANNED" });
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].vars.reason, "COMPLETED");
});

test("Other statuses reopen a closed issue and leave an open one alone", async () => {
  for (const status of ["🌱 In Progress", "🧪 In Review", "💎 Ready", "⏳ Paused"]) {
    const closed = await statusSync({ status, state: "CLOSED", stateReason: "COMPLETED" });
    assert.equal(closed.mutations.length, 1, status);
    assert.match(closed.mutations[0].query, /reopenIssue/);
    const open = await statusSync({ status, state: "OPEN" });
    assert.equal(open.mutations.length, 0, status);
  }
});

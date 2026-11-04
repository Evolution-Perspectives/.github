const test = require("node:test");
const assert = require("node:assert/strict");
const { run } = require("../../lib/test-harness.js");

// Tests for actions/close-status-sync/sync.js (issue close -> Status).

const PROJECT = "PVT_kwDOtestproject";

const closeSyncAction = require("./sync.js");

const OPTION = { done: "98236657", canceled: "69f90333", pendingRelease: "ba8247ce" };

function closeEnv(stateReason, extra = {}) {
  return {
    ISSUE_NODE_ID: "I_issue1",
    STATE_REASON: stateReason,
    SOURCE_REPOSITORY: "org/repo",
    PROJECT_ID: PROJECT,
    DRY_RUN: "false",
    DEBUG: "false",
    ...extra,
  };
}

const STATUS_FIELD = {
  id: "PVTSSF_status",
  options: [
    { id: OPTION.done, name: "🏆 Done" },
    { id: OPTION.canceled, name: "❌ Canceled" },
    { id: OPTION.pendingRelease, name: "📤 Pending Release" },
    { id: "aba860b9", name: "🧪 In Review" },
  ],
};

function closeHandler({ status, optionId = "x", statusField = STATUS_FIELD }) {
  return (query) => {
    if (/field\(name: "Status"\)/.test(query)) return { node: { field: statusField } };
    return {
    node: {
      __typename: "Issue",
      id: "I_issue1",
      number: 7,
      repository: { nameWithOwner: "org/repo" },
      projectItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ id: "PVTI_item1", project: { id: PROJECT }, fieldValueByName: status ? { optionId, name: status } : null }],
      },
    },
    };
  };
}

async function closeSync(stateReason, opts, env) {
  return run(closeSyncAction, closeEnv(stateReason, env), closeHandler(opts));
}

test("closing from In Review sets Pending Release", async () => {
  const { mutations } = await closeSync("completed", { status: "🧪 In Review", optionId: "aba860b9" });
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].vars.optionId, OPTION.pendingRelease);
});

test("closing never overwrites Pending Release", async () => {
  const { mutations, logs } = await closeSync("completed", { status: "📤 Pending Release", optionId: OPTION.pendingRelease });
  assert.equal(mutations.length, 0);
  assert.ok(logs.results.includes("skipped-keep-pending-release"));
});

test("closing from any other status still sets Done", async () => {
  for (const status of ["🌱 In Progress", "💎 Ready", "📡 Pending Deploy", "📦 Backlog", null]) {
    const { mutations } = await closeSync("completed", { status });
    assert.equal(mutations.length, 1, String(status));
    assert.equal(mutations[0].vars.optionId, OPTION.done, String(status));
  }
});

test("closing when already Done writes nothing", async () => {
  const { mutations } = await closeSync("completed", { status: "🏆 Done", optionId: OPTION.done });
  assert.equal(mutations.length, 0);
});

test("not planned and duplicate close to Canceled, even from Pending Release or In Review", async () => {
  for (const stateReason of ["not_planned", "duplicate"]) {
    for (const status of ["📤 Pending Release", "🧪 In Review", "🌱 In Progress"]) {
      const { mutations } = await closeSync(stateReason, { status });
      assert.equal(mutations.length, 1, `${stateReason} ${status}`);
      assert.equal(mutations[0].vars.optionId, OPTION.canceled, `${stateReason} ${status}`);
    }
  }
});

test("close from In Review in dry-run does not write", async () => {
  const { mutations } = await closeSync("completed", { status: "🧪 In Review" }, { DRY_RUN: "true" });
  assert.equal(mutations.length, 0);
});

test("unrecognized close reason writes nothing", async () => {
  const { mutations } = await closeSync("something_else", { status: "🧪 In Review" });
  assert.equal(mutations.length, 0);
});

test("the Status field and option IDs are resolved live by name, not stored in the workflow", async () => {
  const { mutations } = await closeSync("completed", { status: "🌱 In Progress" });
  assert.equal(mutations[0].vars.fieldId, "PVTSSF_status");
  const renumbered = { id: "PVTSSF_other", options: STATUS_FIELD.options.map((o) => ({ ...o, id: o.id + "x" })) };
  const live = await run(closeSyncAction, closeEnv("completed"), closeHandler({ status: "🌱 In Progress", statusField: renumbered }));
  assert.equal(live.mutations[0].vars.fieldId, "PVTSSF_other");
  assert.equal(live.mutations[0].vars.optionId, OPTION.done + "x");
});

test("a missing Status option fails before any write", async () => {
  const incomplete = { id: "PVTSSF_status", options: STATUS_FIELD.options.filter((o) => o.name !== "🏆 Done") };
  const { mutations, logs } = await run(closeSyncAction, closeEnv("completed"), closeHandler({ status: "🌱 In Progress", statusField: incomplete }));
  assert.equal(mutations.length, 0);
  assert.equal(logs.failed.length, 1);
});

// ---------- with actions/close-state-sync: the two directions must not loop ----------

const statusSyncAction = require("../close-state-sync/sync.js");

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

test("closing from In Review then syncing the new Status does not reopen or rewrite", async () => {
  // 1. issue closed while In Review -> Status becomes Pending Release
  const first = await closeSync("completed", { status: "🧪 In Review" });
  assert.equal(first.mutations[0].vars.optionId, OPTION.pendingRelease);
  // 2. the Status change fires the other workflow; the issue is closed (completed)
  const second = await statusSync({ status: "📤 Pending Release", state: "CLOSED", stateReason: "COMPLETED" });
  assert.equal(second.mutations.length, 0);
});

test("setting Pending Release on an open issue closes it and the close does not overwrite the Status", async () => {
  const closeIt = await statusSync({ status: "📤 Pending Release", state: "OPEN" });
  assert.match(closeIt.mutations[0].query, /closeIssue/);
  const afterClose = await closeSync("completed", { status: "📤 Pending Release", optionId: OPTION.pendingRelease });
  assert.equal(afterClose.mutations.length, 0);
});

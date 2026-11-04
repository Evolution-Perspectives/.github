// Tests for the two Status <-> issue close sync workflows.
//
// The logic lives inline in `actions/github-script` blocks. To test what is really
// deployed (and not a copy), the `script:` block is extracted from each workflow file
// and executed against mocked `github` and `core` objects.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WORKFLOWS = path.join(__dirname, "..", "workflows");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractScript(file) {
  const lines = fs.readFileSync(path.join(WORKFLOWS, file), "utf8").split("\n");
  const start = lines.findIndex((l) => /^\s*script:\s*\|\s*$/.test(l));
  assert.ok(start >= 0, `no script block in ${file}`);
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() !== "" && l.match(/^\s*/)[0].length <= keyIndent) break;
    body.push(l);
  }
  const first = body.find((l) => l.trim() !== "");
  const indent = first.match(/^\s*/)[0].length;
  return body.map((l) => l.slice(indent)).join("\n");
}

async function run(file, env, handler) {
  const mutations = [];
  const logs = { info: [], warning: [], failed: [], results: [] };
  const summary = {
    addHeading() { return summary; },
    addEOL() { return summary; },
    addRaw(text) {
      const m = /^Result: (.+)$/.exec(text) || /^Status: (skipped-.+|updated|dry-run-no-write)$/.exec(text);
      if (m) logs.results.push(m[1]);
      return summary;
    },
    async write() {},
  };
  const core = {
    info: (m) => logs.info.push(m),
    warning: (m) => logs.warning.push(m),
    setFailed: (m) => logs.failed.push(m),
    summary,
  };
  const github = {
    async graphql(query, vars) {
      if (/^\s*mutation\b/.test(query)) {
        mutations.push({ query, vars });
        return {};
      }
      return handler(query, vars);
    },
  };
  const fn = new AsyncFunction("github", "core", "process", extractScript(file));
  await fn(github, core, { env });
  return { mutations, logs };
}

// ---------- Status -> issue close/reopen (action-status-sync-issue-close.yml) ----------

const STATUS_SYNC = "action-status-sync-issue-close.yml";
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
  return run(STATUS_SYNC, statusEnv(env), statusHandler(opts));
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

// ---------- Issue close -> Status (action-close-issue-sync-status.yml) ----------

const CLOSE_SYNC = "action-close-issue-sync-status.yml";

const OPTION = { done: "98236657", canceled: "69f90333", pendingRelease: "ba8247ce" };

function closeEnv(stateReason, extra = {}) {
  return {
    ISSUE_NODE_ID: "I_issue1",
    STATE_REASON: stateReason,
    SOURCE_REPOSITORY: "org/repo",
    PROJECT_ID: PROJECT,
    STATUS_FIELD_ID: "PVTSSF_status",
    DRY_RUN: "false",
    DEBUG: "false",
    ...extra,
  };
}

function closeHandler({ status, optionId = "x" }) {
  return () => ({
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
  });
}

async function closeSync(stateReason, opts, env) {
  return run(CLOSE_SYNC, closeEnv(stateReason, env), closeHandler(opts));
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

// ---------- the two workflows together must not loop ----------

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

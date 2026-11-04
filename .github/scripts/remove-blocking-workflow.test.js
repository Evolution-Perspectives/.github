// Tests for engine-remove-blocking-on-close.yml.
//
// The script lives inline in an `actions/github-script` block; it is extracted from the
// workflow file (so the tested code is what is deployed) and run against mocked
// `github` and `core` objects.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "workflows", "engine-remove-blocking-on-close.yml");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function extractScript() {
  const lines = fs.readFileSync(FILE, "utf8").split("\n");
  const start = lines.findIndex((l) => /^\s*script:\s*\|\s*$/.test(l));
  assert.ok(start >= 0, "no script block");
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

const ref = (repo, number) => ({ id: `ID_${repo}_${number}`, number, title: `t${number}`, state: "OPEN", repository: { nameWithOwner: `org/${repo}` } });

// `blocking` = issues the closed issue blocks; `blockedBy` = issues that block it.
async function run({ blocking = [], blockedBy = [], failOn = [], env = {} }) {
  const removals = [];
  const logs = { warning: [], failed: [], summary: [] };
  const summary = {
    addHeading() { return summary; },
    addEOL() { return summary; },
    addRaw(t) { logs.summary.push(t); return summary; },
    async write() {},
  };
  const core = { info() {}, warning: (m) => logs.warning.push(m), setFailed: (m) => logs.failed.push(m), summary };
  const closed = { id: "ID_closed", number: 1, title: "closed", repository: { nameWithOwner: "org/app" } };
  const github = {
    async graphql(query, vars) {
      if (/^\s*mutation\b/.test(query)) {
        if (failOn.includes(vars.issueId + ">" + vars.blockingIssueId)) throw new Error("boom");
        removals.push({ issueId: vars.issueId, blockingIssueId: vars.blockingIssueId });
        return {};
      }
      const field = /\bblockedBy\(/.test(query) ? "blockedBy" : "blocking";
      const nodes = field === "blockedBy" ? blockedBy : blocking;
      return { node: { ...closed, [field]: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } };
    },
  };
  const fn = new AsyncFunction("github", "core", "process", extractScript());
  await fn(github, core, { env: { ISSUE_NODE_ID: "ID_closed", SOURCE_REPOSITORY: "org/app", DEBUG: "false", ...env } });
  return { removals, logs };
}

test("removes the issues it blocks: blocked issue is the target, closed issue the blocker", async () => {
  const { removals } = await run({ blocking: [ref("app", 2), ref("app", 3)] });
  assert.deepEqual(removals, [
    { issueId: "ID_app_2", blockingIssueId: "ID_closed" },
    { issueId: "ID_app_3", blockingIssueId: "ID_closed" },
  ]);
});

test("also removes its own blocked-by links: closed issue is the target", async () => {
  const { removals } = await run({ blockedBy: [ref("app", 9)] });
  assert.deepEqual(removals, [{ issueId: "ID_closed", blockingIssueId: "ID_app_9" }]);
});

test("removes both directions in one run", async () => {
  const { removals } = await run({ blocking: [ref("app", 2)], blockedBy: [ref("app", 9)] });
  assert.equal(removals.length, 2);
});

test("a failing edge is warned about and the others are still removed", async () => {
  const { removals, logs } = await run({
    blocking: [ref("app", 2)],
    blockedBy: [ref("app", 9)],
    failOn: ["ID_app_2>ID_closed"],
  });
  assert.deepEqual(removals, [{ issueId: "ID_closed", blockingIssueId: "ID_app_9" }]);
  assert.equal(logs.warning.length, 1);
});

test("no edges means no write", async () => {
  const { removals, logs } = await run({});
  assert.equal(removals.length, 0);
  assert.ok(logs.summary.some((l) => l.startsWith("Removed edges: 0")));
});

test("a malformed node id is rejected before any call", async () => {
  const { removals, logs } = await run({ blocking: [ref("app", 2)], env: { ISSUE_NODE_ID: "x'; throw 1; //" } });
  assert.equal(removals.length, 0);
  assert.equal(logs.failed.length, 1);
});

test("dry-run lists the edges and removes nothing", async () => {
  const { removals, logs } = await run({ blocking: [ref("app", 2)], blockedBy: [ref("app", 9)], env: { DRY_RUN: "true" } });
  assert.equal(removals.length, 0);
  assert.equal(logs.failed.length, 0);
  assert.ok(logs.summary.some((l) => l.startsWith("Dry run: nothing removed, 2 edge(s)")));
});

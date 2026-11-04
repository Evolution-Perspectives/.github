// Tests for action-add-issue-to-org-project.yml: the script is extracted from the workflow
// file and run against mocked `github` and `core` objects.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FILE = path.join(__dirname, "..", "workflows", "action-add-issue-to-org-project.yml");
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

const PROJECT = "PVT_kwDOtest";
const FIELD = { id: "PVTSSF_status", options: [{ id: "opt-backlog", name: "📦 Backlog" }, { id: "opt-ready", name: "💎 Ready" }] };

async function run({ env = {}, inProject = false, field = FIELD }) {
  const mutations = [];
  const logs = { failed: [], summary: [] };
  const summary = { addHeading() { return summary; }, addEOL() { return summary; }, addRaw(t) { logs.summary.push(t); return summary; }, async write() {} };
  const core = { info() {}, warning() {}, setFailed: (m) => logs.failed.push(m), summary };
  const github = {
    async graphql(query, vars) {
      if (/^\s*mutation\b/.test(query)) {
        mutations.push({ query, vars });
        return /addProjectV2ItemById/.test(query) ? { addProjectV2ItemById: { item: { id: "PVTI_new" } } } : {};
      }
      if (/field\(name: "Status"\)/.test(query)) return { node: { field } };
      return {
        node: {
          id: "I_1", number: 5, repository: { nameWithOwner: "org/app" },
          projectItems: { nodes: inProject ? [{ project: { id: PROJECT } }] : [] },
        },
      };
    },
  };
  const fn = new AsyncFunction("github", "core", "process", extractScript());
  await fn(github, core, { env: { PROJECT_ID: PROJECT, ISSUE_NODE_ID: "I_1", ISSUE_NUMBER: "5", SOURCE_REPOSITORY: "org/app", DRY_RUN: "false", DEBUG: "false", STATUS_NAME: "", ...env } });
  return { mutations, logs };
}

test("adds the issue and sets the Status resolved by name", async () => {
  const { mutations } = await run({ env: { STATUS_NAME: "📦 Backlog" } });
  assert.equal(mutations.length, 2);
  assert.match(mutations[0].query, /addProjectV2ItemById/);
  assert.equal(mutations[1].vars.fieldId, "PVTSSF_status");
  assert.equal(mutations[1].vars.optionId, "opt-backlog");
  assert.equal(mutations[1].vars.itemId, "PVTI_new");
});

test("no status name means the issue is added with no Status write", async () => {
  const { mutations } = await run({});
  assert.equal(mutations.length, 1);
});

test("an unknown Status name fails before the issue is added", async () => {
  const { mutations, logs } = await run({ env: { STATUS_NAME: "Nope" } });
  assert.equal(mutations.length, 0);
  assert.equal(logs.failed.length, 1);
});

test("an issue already in the project is left alone", async () => {
  const { mutations } = await run({ env: { STATUS_NAME: "📦 Backlog" }, inProject: true });
  assert.equal(mutations.length, 0);
});

test("dry-run writes nothing", async () => {
  const { mutations } = await run({ env: { STATUS_NAME: "📦 Backlog", DRY_RUN: "true" } });
  assert.equal(mutations.length, 0);
});

test("a malformed node id is rejected before any call", async () => {
  const { mutations, logs } = await run({ env: { ISSUE_NODE_ID: "x'; throw 1; //" } });
  assert.equal(mutations.length, 0);
  assert.equal(logs.failed.length, 1);
});

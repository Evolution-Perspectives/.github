const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { check } = require("./check-actions-layout.js");

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}
const action = (n, extra = {}) => ({
  [`actions/${n}/action.yml`]: "runs:\n  using: node24\n  main: dist/index.js\n",
  [`actions/${n}/README.md`]: "",
  [`actions/${n}/src/index.ts`]: "",
  [`actions/${n}/src/${n}.test.ts`]: "",
  [`actions/${n}/dist/index.js`]: "",
  ...extra,
});
const RUNNER_INPUT = "on:\n  workflow_call:\n    inputs:\n      runner:\n        description: x\n        required: false\n        type: string\n        default: ubuntu-latest\n";
const RUNS_ON = "    runs-on: ${{ inputs.runner || 'ubuntu-latest' }}\n";
const engine = (file, n, ref = "main", extra = "") => ({ [`.github/workflows/${file}`]: `${RUNNER_INPUT}jobs:\n  j:\n${RUNS_ON}${extra}    steps:\n      - uses: Evolution-Perspectives/.github/actions/${n}@${ref}\n` });

test("the real repository layout is valid", () => {
  assert.deepEqual(check(path.join(__dirname, "..", "..")), []);
});

test("a complete TypeScript action with its engine is valid", () => {
  assert.deepEqual(check(tree({ ...action("a"), ...engine("engine-a.yml", "a") })), []);
});

test("an action without engine, an engine without action and incomplete folders are reported", () => {
  const root = tree({ ...action("lonely"), "actions/thin/action.yml": "runs:\n  using: node24\n  main: dist/index.js\n", ...engine("engine-ghost.yml", "ghost"), ...engine("engine-thin.yml", "thin") });
  const errors = check(root).join("\n");
  assert.match(errors, /actions\/lonely: no engine/);
  assert.match(errors, /engine-ghost\.yml: calls actions\/ghost which does not exist/);
  assert.match(errors, /actions\/thin: missing README\.md/);
  assert.match(errors, /actions\/thin: missing src\/index\.ts/);
  assert.match(errors, /actions\/thin: missing src\/\*\.test\.ts/);
  assert.match(errors, /actions\/thin: missing committed dist\/index\.js/);
});

test("a feature-branch ref is rejected, tags and SHAs are accepted", () => {
  const bad = check(tree({ ...action("a"), ...engine("engine-a.yml", "a", "feat/x") })).join("\n");
  assert.match(bad, /ref "feat\/x"/);
  for (const ref of ["main", "v1", "v1.2.3", "a".repeat(40)]) {
    assert.deepEqual(check(tree({ ...action("a"), ...engine("engine-a.yml", "a", ref) })), [], ref);
  }
});

test("a composite or github-script action, a wrong runtime and a stray .js are rejected", () => {
  const composite = tree({ ...action("c", { "actions/c/action.yml": "runs:\n  using: composite\n  steps:\n    - uses: actions/github-script@x\n" }), ...engine("engine-c.yml", "c") });
  const errors = check(composite).join("\n");
  assert.match(errors, /composite or github-script actions are no longer allowed/);
  assert.match(errors, /must declare runs\.using: node24/);
  assert.match(errors, /must declare main: dist\/index\.js/);
  const stray = tree({ ...action("s", { "actions/s/old.js": "" }), ...engine("engine-s.yml", "s") });
  assert.match(check(stray).join("\n"), /stray \.js source/);
});

test("an engine must select its runner through the runner input", () => {
  const hard = tree({ ...action("a"), [".github/workflows/engine-a.yml"]: `${RUNNER_INPUT}jobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: Evolution-Perspectives/.github/actions/a@main\n` });
  assert.match(check(hard).join("\n"), /engine-a\.yml: "runs-on: ubuntu-latest" must be/);
  const noInput = tree({ ...action("a"), [".github/workflows/engine-a.yml"]: `jobs:\n  j:\n${RUNS_ON}    steps:\n      - uses: Evolution-Perspectives/.github/actions/a@main\n` });
  assert.match(check(noInput).join("\n"), /missing the "runner" input with default ubuntu-latest/);
});

test("the self-hosted label may not appear under .github/workflows", () => {
  const root = tree({ ...action("a"), ...engine("engine-a.yml", "a"), ".github/workflows/org-x.yml": "jobs:\n  j:\n    uses: x\n    with:\n      runner: ep-github-runner\n" });
  assert.match(check(root).join("\n"), /org-x\.yml: contains "ep-github-runner"/);
});

test("the label is allowed in managed caller templates but not through a variable", () => {
  const ok = tree({ ...action("a"), ...engine("engine-a.yml", "a"), ".github/managed-workflows/org-x.yml": "runner: ep-github-runner\n" });
  assert.deepEqual(check(ok), []);
  const viaVar = tree({ ...action("a"), ...engine("engine-a.yml", "a"), ".github/managed-workflows/org-x.yml": "runner: ${{ vars.EP_RUNNER }}\n" });
  assert.match(check(viaVar).join("\n"), /managed-workflows\/org-x\.yml: runner selected through a variable/);
  const callerVar = tree({ ...action("a"), ...engine("engine-a.yml", "a"), ".github/workflows/org-y.yml": "with:\n  runner: ${{ vars.CI_RUNNER }}\n" });
  assert.match(check(callerVar).join("\n"), /org-y\.yml: runner selected through a variable/);
});

test("a caller must call an engine at main, a tag, a SHA or the managed placeholder, never a branch", () => {
  const call = (ref) => ({ ".github/workflows/org-z.yml": `jobs:\n  j:\n    uses: Evolution-Perspectives/.github/.github/workflows/engine-a.yml@${ref}\n` });
  const bad = check(tree({ ...action("a"), ...engine("engine-a.yml", "a"), ...call("tmp/debug") })).join("\n");
  assert.match(bad, /org-z\.yml: engine call engine-a\.yml at ref "tmp\/debug"/);
  for (const ref of ["main", "v1", "a".repeat(40)]) assert.deepEqual(check(tree({ ...action("a"), ...engine("engine-a.yml", "a"), ...call(ref) })), [], ref);
  const managed = tree({ ...action("a"), ...engine("engine-a.yml", "a"), ".github/managed-workflows/org-z.yml": "uses: Evolution-Perspectives/.github/.github/workflows/engine-a.yml@__REF__\n" });
  assert.deepEqual(check(managed), []);
});

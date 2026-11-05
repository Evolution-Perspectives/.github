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
const action = (n) => ({ [`actions/${n}/action.yml`]: "", [`actions/${n}/${n}.js`]: "", [`actions/${n}/${n}.test.js`]: "", [`actions/${n}/README.md`]: "" });
const RUNNER_INPUT = "on:\n  workflow_call:\n    inputs:\n      runner:\n        description: x\n        required: false\n        type: string\n        default: ubuntu-latest\n";
const RUNS_ON = "    runs-on: ${{ inputs.runner || 'ubuntu-latest' }}\n";
const engine = (file, n, ref = "main", extra = "") => ({ [`.github/workflows/${file}`]: `${RUNNER_INPUT}jobs:\n  j:\n${RUNS_ON}${extra}    steps:\n      - uses: Evolution-Perspectives/.github/actions/${n}@${ref}\n` });

test("the real repository layout is valid", () => {
  assert.deepEqual(check(path.join(__dirname, "..", "..")), []);
});

test("a complete action with its engine is valid", () => {
  assert.deepEqual(check(tree({ ...action("a"), ...engine("engine-a.yml", "a") })), []);
});

test("an action without engine, an engine without action and incomplete folders are reported", () => {
  const root = tree({ ...action("lonely"), "actions/thin/action.yml": "", ...engine("engine-ghost.yml", "ghost"), ...engine("engine-thin.yml", "thin") });
  const errors = check(root).join("\n");
  assert.match(errors, /actions\/lonely: no engine/);
  assert.match(errors, /engine-ghost\.yml: calls actions\/ghost which does not exist/);
  assert.match(errors, /actions\/thin: missing README\.md/);
  assert.match(errors, /actions\/thin: missing \*\.test\.js/);
  assert.match(errors, /actions\/thin: missing source \.js/);
});

test("a feature-branch ref is rejected, tags and SHAs are accepted", () => {
  const bad = check(tree({ ...action("a"), ...engine("engine-a.yml", "a", "feat/x") })).join("\n");
  assert.match(bad, /ref "feat\/x"/);
  for (const ref of ["main", "v1", "v1.2.3", "a".repeat(40)]) {
    assert.deepEqual(check(tree({ ...action("a"), ...engine("engine-a.yml", "a", ref) })), [], ref);
  }
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

const tsAction = (n, extra = {}) => ({
  [`actions/${n}/action.yml`]: "runs:\n  using: node24\n  main: dist/index.js\n",
  [`actions/${n}/README.md`]: "",
  [`actions/${n}/src/index.ts`]: "",
  [`actions/${n}/src/${n}.test.ts`]: "",
  [`actions/${n}/dist/index.js`]: "",
  ...extra,
});

test("a complete TypeScript action with its engine is valid", () => {
  assert.deepEqual(check(tree({ ...tsAction("t"), ...engine("engine-t.yml", "t") })), []);
});

test("a TypeScript action must have its source, test, committed dist and main entry", () => {
  const root = tree({
    "actions/t/action.yml": "runs:\n  using: node24\n  main: index.js\n",
    "actions/t/README.md": "",
    "actions/t/cleanup.js": "",
    ...engine("engine-t.yml", "t"),
  });
  const errors = check(root).join("\n");
  assert.match(errors, /must declare main: dist\/index\.js/);
  assert.match(errors, /missing src\/index\.ts/);
  assert.match(errors, /missing src\/\*\.test\.ts/);
  assert.match(errors, /missing committed dist\/index\.js/);
  assert.match(errors, /stray \.js source/);
});

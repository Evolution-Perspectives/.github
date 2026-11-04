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
const engine = (file, n, ref = "main") => ({ [`.github/workflows/${file}`]: `steps:\n  - uses: Evolution-Perspectives/.github/actions/${n}@${ref}\n` });

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

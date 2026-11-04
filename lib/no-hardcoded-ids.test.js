// Guard: automation code must resolve project field/option IDs live, never embed them.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const FORBIDDEN = /PVTSSF_|PVT_kw|98236657|69f90333|ba8247ce|f75ad846/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

test("actions, lib and engine workflows contain no project field or option ID literals", () => {
  const files = [
    ...walk(path.join(ROOT, "actions")),
    ...walk(__dirname),
    ...fs.readdirSync(path.join(ROOT, ".github", "workflows")).filter((n) => n.startsWith("engine-")).map((n) => path.join(ROOT, ".github", "workflows", n)),
  ].filter((f) => /\.(js|yml)$/.test(f) && !/\.test\.js$/.test(f));
  assert.ok(files.length >= 10, `expected to scan the actions and engines, got ${files.length}`);
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), FORBIDDEN, path.relative(ROOT, f));
});

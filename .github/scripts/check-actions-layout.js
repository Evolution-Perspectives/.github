#!/usr/bin/env node
// Validates the actions/ + engine-*.yml layout (see openspec change restructure-to-actions).
//   - every actions/<name>/ has action.yml, a source .js, a *.test.js and README.md
//   - every actions/<name>/ is called by exactly one engine-*.yml, and every engine-*.yml calls
//     exactly one existing action
//   - the action ref is `main`, a `v<number>` tag or a full commit SHA (never a feature branch:
//     the engine passes a secret to the action)
// Usage: node .github/scripts/check-actions-layout.js [repoRoot]
const fs = require("node:fs");
const path = require("node:path");

const CALL = /uses:\s*Evolution-Perspectives\/\.github\/actions\/([\w-]+)@(\S+)/g;
const ALLOWED_REF = /^(main|v\d+(\.\d+){0,2}|[0-9a-f]{40})$/;

function check(root) {
  const errors = [];
  const actionsDir = path.join(root, "actions");
  const wfDir = path.join(root, ".github", "workflows");
  const actions = fs.existsSync(actionsDir)
    ? fs.readdirSync(actionsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];

  for (const name of actions) {
    const files = fs.readdirSync(path.join(actionsDir, name));
    if (!files.includes("action.yml")) errors.push(`actions/${name}: missing action.yml`);
    if (!files.includes("README.md")) errors.push(`actions/${name}: missing README.md`);
    if (!files.some((f) => f.endsWith(".js") && !f.endsWith(".test.js"))) errors.push(`actions/${name}: missing source .js file`);
    if (!files.some((f) => f.endsWith(".test.js"))) errors.push(`actions/${name}: missing *.test.js file`);
  }

  const callers = Object.fromEntries(actions.map((a) => [a, []]));
  const engines = fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => f.startsWith("engine-") && f.endsWith(".yml")) : [];
  for (const file of engines) {
    const text = fs.readFileSync(path.join(wfDir, file), "utf8");
    const calls = [...text.matchAll(CALL)];
    if (calls.length !== 1) {
      errors.push(`.github/workflows/${file}: must call exactly one action, found ${calls.length}`);
      continue;
    }
    const [, name, ref] = calls[0];
    if (!ALLOWED_REF.test(ref)) errors.push(`.github/workflows/${file}: action ref "${ref}" must be main, a v<number> tag or a full commit SHA`);
    if (!callers[name]) errors.push(`.github/workflows/${file}: calls actions/${name} which does not exist`);
    else callers[name].push(file);
  }
  for (const [name, files] of Object.entries(callers)) {
    if (files.length === 0) errors.push(`actions/${name}: no engine-*.yml calls it`);
    if (files.length > 1) errors.push(`actions/${name}: called by several engines (${files.join(", ")})`);
  }
  return errors;
}

module.exports = { check };

if (require.main === module) {
  const errors = check(path.resolve(process.argv[2] || path.join(__dirname, "..", "..")));
  if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    process.exit(1);
  }
  console.log("actions layout OK");
}

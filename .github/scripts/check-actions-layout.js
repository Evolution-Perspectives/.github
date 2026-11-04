#!/usr/bin/env node
// Validates the actions/ + engine-*.yml layout (see openspec change restructure-to-actions).
//   - every actions/<name>/ has action.yml, a source .js, a *.test.js and README.md
//   - every actions/<name>/ is called by exactly one engine-*.yml, and every engine-*.yml calls
//     exactly one existing action
//   - the action ref is `main`, a `v<number>` tag or a full commit SHA (never a feature branch:
//     the engine passes a secret to the action)
//   - runner selection: every engine uses `runs-on: ${{ inputs.runner || 'ubuntu-latest' }}` and
//     declares a `runner` input defaulting to `ubuntu-latest`; the self-hosted label
//     `ep-github-runner` appears nowhere under .github/workflows (the public repo cannot use the
//     pool); no `vars.` expression selects a runner in engines, callers or managed callers
// Usage: node .github/scripts/check-actions-layout.js [repoRoot]
const fs = require("node:fs");
const path = require("node:path");

const CALL = /uses:\s*Evolution-Perspectives\/\.github\/actions\/([\w-]+)@(\S+)/g;
const RUNS_ON = "runs-on: ${{ inputs.runner || 'ubuntu-latest' }}";
const SELF_HOSTED_LABEL = "ep-github-runner";
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
  // Runner selection rules.
  const workflowFiles = fs.existsSync(wfDir) ? fs.readdirSync(wfDir).filter((f) => f.endsWith(".yml")) : [];
  const managedDir = path.join(root, ".github", "managed-workflows");
  const managedFiles = fs.existsSync(managedDir) ? fs.readdirSync(managedDir).filter((f) => f.endsWith(".yml")) : [];
  for (const file of workflowFiles) {
    const text = fs.readFileSync(path.join(wfDir, file), "utf8");
    if (text.includes(SELF_HOSTED_LABEL)) {
      errors.push(`.github/workflows/${file}: contains "${SELF_HOSTED_LABEL}"; only managed caller templates may use the self-hosted label`);
    }
    const isEngine = file.startsWith("engine-");
    const isCaller = /^(org|hook)-/.test(file);
    if (isEngine || isCaller) {
      for (const m of text.matchAll(/^\s*(?:runs-on|runner):.*\bvars\./gm)) {
        errors.push(`.github/workflows/${file}: runner selected through a variable (${m[0].trim()}); hardcode it in the caller instead`);
      }
    }
    if (isEngine) {
      for (const m of text.matchAll(/^\s*runs-on:.*$/gm)) {
        if (m[0].trim() !== RUNS_ON) errors.push(`.github/workflows/${file}: "${m[0].trim()}" must be "${RUNS_ON}"`);
      }
      if (!/^\s+runner:\s*\n(?:\s+[a-z]+:.*\n)*?\s+default: ubuntu-latest\s*$/m.test(text)) {
        errors.push(`.github/workflows/${file}: missing the "runner" input with default ubuntu-latest`);
      }
    }
  }
  for (const file of managedFiles) {
    const text = fs.readFileSync(path.join(managedDir, file), "utf8");
    for (const m of text.matchAll(/^\s*(?:runs-on|runner):.*\bvars\./gm)) {
      errors.push(`.github/managed-workflows/${file}: runner selected through a variable (${m[0].trim()}); hardcode the label`);
    }
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

// Shared test harness: runs an action's exported function against a mocked `github` and `core`.
// `handler(query, vars)` answers GraphQL queries; mutations are recorded in `mutations`.
async function run(action, env, handler) {
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
  await action({ github, core, env });
  return { mutations, logs };
}

module.exports = { run };

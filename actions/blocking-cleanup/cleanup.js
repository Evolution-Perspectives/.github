// Removes every blocking and blocked-by edge of a just-closed issue.
// Loaded by actions/blocking-cleanup/action.yml; tested by importing it directly.
module.exports = async function blockingCleanup({ github, core, env = process.env }) {
  const issueNodeId = env.ISSUE_NODE_ID || '';
  const sourceRepository = env.SOURCE_REPOSITORY || '';
  const dryRun = env.DRY_RUN === 'true';
  const debug = env.DEBUG === 'true';

  if (!issueNodeId || issueNodeId === 'null' || issueNodeId === 'undefined') {
    core.setFailed('Missing required issue_node_id input.');
    return;
  }

  // Validate shapes before the values reach any GraphQL call.
  const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/;
  const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
  if (!NODE_ID_PATTERN.test(issueNodeId)) {
    core.setFailed('Malformed issue_node_id input (does not match expected node ID shape).');
    return;
  }
  if (sourceRepository && sourceRepository !== 'unknown' && !REPO_PATTERN.test(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`);
    return;
  }

  // The relationship field name is one of two fixed constants, never user input.
  const buildQuery = (field) => `
    query($id: ID!, $after: String) {
      node(id: $id) {
        ... on Issue {
          id
          number
          title
          repository {
            nameWithOwner
          }
          ${field}(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              number
              title
              state
              repository {
                nameWithOwner
              }
            }
          }
        }
      }
    }
  `;

  const mutation = `
    mutation($issueId: ID!, $blockingIssueId: ID!) {
      removeBlockedBy(input: {
        issueId: $issueId,
        blockingIssueId: $blockingIssueId
      }) {
        clientMutationId
      }
    }
  `;

  // Reads every page of one relationship list (`blocking` or `blockedBy`).
  const fetchEdges = async (field) => {
    const query = buildQuery(field);
    const nodes = [];
    let issue = null;
    let after = null;

    while (true) {
      const res = await github.graphql(query, { id: issueNodeId, after });
      issue = res?.node;

      if (!issue) {
        return { issue: null, nodes };
      }

      nodes.push(...(issue[field]?.nodes || []));

      const pageInfo = issue[field]?.pageInfo;
      if (!pageInfo?.hasNextPage) {
        break;
      }
      after = pageInfo.endCursor;
    }

    return { issue, nodes };
  };

  const blockingResult = await fetchEdges('blocking');
  if (!blockingResult.issue) {
    core.setFailed(`No issue found for node ID ${issueNodeId}.`);
    return;
  }
  const blockedByResult = await fetchEdges('blockedBy');

  const closedIssue = blockingResult.issue;
  const closedIssueRef = `${closedIssue.repository.nameWithOwner}#${closedIssue.number}`;

  // Each edge: which issue is blocked (issueId) and which blocks it (blockingIssueId).
  const edges = [
    ...blockingResult.nodes.map((other) => ({
      direction: 'blocks',
      other,
      issueId: other.id,
      blockingIssueId: closedIssue.id,
    })),
    ...blockedByResult.nodes.map((other) => ({
      direction: 'blocked-by',
      other,
      issueId: closedIssue.id,
      blockingIssueId: other.id,
    })),
  ];

  core.info(`Closed issue: ${closedIssueRef}`);
  core.info(`Source repository input: ${sourceRepository}`);
  core.info(`Discovered edges: ${edges.length} (blocks ${blockingResult.nodes.length}, blocked-by ${blockedByResult.nodes.length})`);

  let removed = 0;
  let planned = 0;
  let failed = 0;
  const failedEdges = [];

  for (const edge of edges) {
    const otherRef = `${edge.other.repository.nameWithOwner}#${edge.other.number}`;
    const label = edge.direction === 'blocks'
      ? `${closedIssueRef} blocks ${otherRef}`
      : `${closedIssueRef} blocked by ${otherRef}`;

    if (dryRun) {
      planned += 1;
      core.info(`[dry-run] Would remove edge: ${label}`);
      continue;
    }

    try {
      await github.graphql(mutation, {
        issueId: edge.issueId,
        blockingIssueId: edge.blockingIssueId,
      });
      removed += 1;
      if (debug) {
        core.info(`Removed edge: ${label}`);
      }
    } catch (error) {
      failed += 1;
      const message = error?.message || String(error);
      failedEdges.push({ label, message });
      core.warning(`Failed to remove edge (${label}): ${message}`);
    }
  }

  core.summary
    .addHeading('Issue dependency cleanup')
    .addRaw(`Closed issue: ${closedIssueRef}`)
    .addEOL()
    .addRaw(`Discovered edges: ${edges.length} (blocks ${blockingResult.nodes.length}, blocked-by ${blockedByResult.nodes.length})`)
    .addEOL()
    .addRaw(dryRun ? `Dry run: nothing removed, ${planned} edge(s) would be removed` : `Removed edges: ${removed}`)
    .addEOL()
    .addRaw(`Failed edges: ${failed}`)
    .addEOL();

  if (failedEdges.length > 0) {
    core.summary.addEOL().addHeading('Failed edge removals', 2);
    for (const entry of failedEdges) {
      core.summary
        .addRaw(`- ${entry.label}: ${entry.message}`)
        .addEOL();
    }
  }

  await core.summary.write();
};

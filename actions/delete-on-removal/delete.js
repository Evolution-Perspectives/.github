// Permanently delete an issue that was removed from the project.
// Loaded by actions/delete-on-removal/action.yml; tested by importing it directly.
module.exports = async function deleteOnRemoval({ github, core, env = process.env }) {
  const projectId = env.PROJECT_ID || '';
  const issueNodeId = env.ISSUE_NODE_ID || '';
  const itemNodeId = env.ITEM_NODE_ID || '';
  const eventAction = env.EVENT_ACTION || '';
  const sourceRepository = env.SOURCE_REPOSITORY || '';
  const dryRun = env.DRY_RUN === 'true';
  const debug = env.DEBUG === 'true';

  if (!projectId || !issueNodeId || issueNodeId === 'null' || issueNodeId === 'undefined') {
    core.setFailed('Missing required inputs: project_id and issue_node_id are required.');
    return;
  }

  // Inputs may come from repository_dispatch payloads or manual runs: validate
  // their shape before they reach any GraphQL call.
  const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/;
  const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;
  if (!NODE_ID_PATTERN.test(projectId) || !NODE_ID_PATTERN.test(issueNodeId) || (itemNodeId && !NODE_ID_PATTERN.test(itemNodeId))) {
    core.setFailed('Malformed node ID in inputs (project_id, issue_node_id, or item_node_id does not match expected node ID shape).');
    return;
  }
  if (sourceRepository && sourceRepository !== 'unknown' && !REPO_PATTERN.test(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`);
    return;
  }

  const lookupQuery = `
    query($id: ID!, $after: String) {
      node(id: $id) {
        __typename
        ... on Issue {
          id
          number
          title
          state
          repository {
            nameWithOwner
          }
          projectItems(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              project {
                id
                number
                title
              }
            }
          }
        }
      }
    }
  `;

  const deleteMutation = `
    mutation($issueId: ID!) {
      deleteIssue(input: { issueId: $issueId }) {
        clientMutationId
      }
    }
  `;

  let nodeType = null;
  let issue = null;
  const projectItems = [];
  let after = null;

  while (true) {
    let res;
    try {
      res = await github.graphql(lookupQuery, { id: issueNodeId, after });
    } catch (error) {
      const message = error?.message || String(error);
      if (message.toLowerCase().includes('could not resolve to a node')) {
        core.warning(`Issue node ${issueNodeId} is already missing. Assuming previously deleted.`);
        await core.summary
          .addHeading('Project removal issue deletion')
          .addRaw(`Project ID: ${projectId}`)
          .addEOL()
          .addRaw(`Issue node ID: ${issueNodeId}`)
          .addEOL()
          .addRaw(`Status: already-missing`)
          .addEOL()
          .addRaw(`Source action: ${eventAction}`)
          .addEOL()
          .addRaw(`Source repository: ${sourceRepository}`)
          .addEOL()
          .write();
        return;
      }

      throw error;
    }

    const node = res?.node;
    nodeType = node?.__typename || 'Unknown';

    if (!node) {
      core.warning(`No node found for ${issueNodeId}. Assuming deleted.`);
      await core.summary
        .addHeading('Project removal issue deletion')
        .addRaw(`Project ID: ${projectId}`)
        .addEOL()
        .addRaw(`Issue node ID: ${issueNodeId}`)
        .addEOL()
        .addRaw('Status: already-missing')
        .addEOL()
        .write();
      return;
    }

    if (nodeType !== 'Issue') {
      core.warning(`Node ${issueNodeId} is type ${nodeType}; deletion skipped.`);
      await core.summary
        .addHeading('Project removal issue deletion')
        .addRaw(`Project ID: ${projectId}`)
        .addEOL()
        .addRaw(`Issue node ID: ${issueNodeId}`)
        .addEOL()
        .addRaw(`Node type: ${nodeType}`)
        .addEOL()
        .addRaw('Status: skipped-non-issue')
        .addEOL()
        .write();
      return;
    }

    issue = node;
    const pageNodes = node.projectItems?.nodes || [];
    projectItems.push(...pageNodes);

    const pageInfo = node.projectItems?.pageInfo;
    if (!pageInfo?.hasNextPage) {
      break;
    }
    after = pageInfo.endCursor;
  }

  const issueRef = `${issue.repository.nameWithOwner}#${issue.number}`;
  const stillInTargetProject = projectItems.some((item) => item?.project?.id === projectId);

  if (debug) {
    core.info(`Source action: ${eventAction}`);
    core.info(`Source repository: ${sourceRepository}`);
    core.info(`Item node ID: ${itemNodeId || 'n/a'}`);
    core.info(`Resolved issue: ${issueRef}`);
    core.info(`Discovered project item entries on issue: ${projectItems.length}`);
  }

  if (stillInTargetProject) {
    core.warning(`Issue ${issueRef} is still attached to project ${projectId}; deletion skipped.`);
    await core.summary
      .addHeading('Project removal issue deletion')
      .addRaw(`Issue: ${issueRef}`)
      .addEOL()
      .addRaw(`Project ID: ${projectId}`)
      .addEOL()
      .addRaw('Status: skipped-still-in-project')
      .addEOL()
      .addRaw(`Source action: ${eventAction}`)
      .addEOL()
      .addRaw(`Source repository: ${sourceRepository}`)
      .addEOL()
      .write();
    return;
  }

  if (dryRun) {
    core.info(`[dry-run] Would delete issue ${issueRef}.`);
    await core.summary
      .addHeading('Project removal issue deletion')
      .addRaw(`Issue: ${issueRef}`)
      .addEOL()
      .addRaw(`Project ID: ${projectId}`)
      .addEOL()
      .addRaw('Status: dry-run-no-delete')
      .addEOL()
      .addRaw(`Source action: ${eventAction}`)
      .addEOL()
      .addRaw(`Source repository: ${sourceRepository}`)
      .addEOL()
      .write();
    return;
  }

  await github.graphql(deleteMutation, { issueId: issue.id });
  core.info(`Deleted issue ${issueRef}.`);

  await core.summary
    .addHeading('Project removal issue deletion')
    .addRaw(`Issue: ${issueRef}`)
    .addEOL()
    .addRaw(`Project ID: ${projectId}`)
    .addEOL()
    .addRaw('Status: deleted')
    .addEOL()
    .addRaw(`Source action: ${eventAction}`)
    .addEOL()
    .addRaw(`Source repository: ${sourceRepository}`)
    .addEOL()
    .write();
};

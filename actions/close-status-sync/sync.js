// Set the project Status from the way an issue was closed.
// Loaded by actions/close-status-sync/action.yml; tested by importing it directly.
module.exports = async function closeStatusSync({ github, core, env = process.env }) {
  const issueNodeId = env.ISSUE_NODE_ID || '';
  const stateReason = (env.STATE_REASON || '').toLowerCase();
  const sourceRepository = env.SOURCE_REPOSITORY || '';
  const projectId = env.PROJECT_ID || '';
  const dryRun = env.DRY_RUN === 'true';
  const debug = env.DEBUG === 'true';

  if (!issueNodeId || issueNodeId === 'null' || issueNodeId === 'undefined') {
    core.setFailed('Missing required issue_node_id input.');
    return;
  }

  const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/;
  const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

  if (!NODE_ID_PATTERN.test(issueNodeId) || !NODE_ID_PATTERN.test(projectId)) {
    core.setFailed('Malformed node ID in inputs (issue_node_id or project_id does not match expected node ID shape).');
    return;
  }
  if (sourceRepository && sourceRepository !== 'unknown' && !REPO_PATTERN.test(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`);
    return;
  }

  const DONE_STATUS = '🏆 Done';
  const CANCELED_STATUS = '❌ Canceled';
  const TARGET_NAME_BY_REASON = {
    completed: DONE_STATUS,
    not_planned: CANCELED_STATUS,
    duplicate: CANCELED_STATUS,
  };

  const targetName = TARGET_NAME_BY_REASON[stateReason];

  // A completed close does not always mean "released":
  // - already Pending Release: team work is finished, only the release is left; keep it.
  // - closed from In Review: reviewed, so it waits for the release (Pending Release).
  // - otherwise: Done, as before.
  const PENDING_RELEASE_STATUS = '📤 Pending Release';
  const IN_REVIEW_STATUS = '🧪 In Review';

  const writeSummary = (issueRef, status, extra = {}) => {
    const summary = core.summary
      .addHeading('Close issue → Status sync')
      .addRaw(`Issue: ${issueRef || issueNodeId}`)
      .addEOL()
      .addRaw(`Close reason: ${stateReason || 'unknown'}`)
      .addEOL()
      .addRaw(`Status: ${status}`)
      .addEOL()
      .addRaw(`Source repository: ${sourceRepository}`)
      .addEOL();
    for (const [key, value] of Object.entries(extra)) {
      summary.addRaw(`${key}: ${value}`).addEOL();
    }
    return summary.write();
  };

  if (!targetName) {
    core.warning(`Unrecognized close reason "${stateReason}" for issue ${issueNodeId}; no Status change applied.`);
    await writeSummary(null, 'skipped-unrecognized-reason');
    return;
  }

  // Resolve the Status field and its options live, by name: no option IDs are stored here.
  const statusFieldQuery = `
    query($projectId: ID!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              id
              options {
                id
                name
              }
            }
          }
        }
      }
    }
  `;

  const statusMeta = await github.graphql(statusFieldQuery, { projectId });
  const statusField = statusMeta?.node?.field;
  const statusFieldId = statusField?.id || '';
  const optionIdByName = new Map((statusField?.options || []).map((o) => [o.name, o.id]));
  const missingStatuses = [DONE_STATUS, CANCELED_STATUS, PENDING_RELEASE_STATUS].filter((n) => !optionIdByName.has(n));
  if (!statusFieldId || missingStatuses.length > 0) {
    core.setFailed(`Status field or options not found in project ${projectId}: ${missingStatuses.join(', ') || 'Status field'}.`);
    return;
  }

  const target = { name: targetName, optionId: optionIdByName.get(targetName) };
  const PENDING_RELEASE_TARGET = { name: PENDING_RELEASE_STATUS, optionId: optionIdByName.get(PENDING_RELEASE_STATUS) };

  const query = `
    query($id: ID!, $after: String) {
      node(id: $id) {
        __typename
        ... on Issue {
          id
          number
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
              }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  optionId
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        clientMutationId
      }
    }
  `;

  let issue = null;
  const projectItems = [];
  let after = null;

  while (true) {
    const res = await github.graphql(query, { id: issueNodeId, after });
    const node = res?.node;

    if (!node || node.__typename !== 'Issue') {
      core.warning(`Node ${issueNodeId} is not an Issue (${node?.__typename || 'missing'}); skipping.`);
      await writeSummary(null, 'skipped-not-an-issue');
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
  const item = projectItems.find((entry) => entry?.project?.id === projectId);

  if (debug) {
    core.info(`Issue: ${issueRef}`);
    core.info(`Close reason: ${stateReason}`);
    core.info(`Target Status: ${target.name}`);
    core.info(`Project items found: ${projectItems.length}`);
  }

  if (!item) {
    core.info(`Issue ${issueRef} is not tracked on project ${projectId}; nothing to sync.`);
    await writeSummary(issueRef, 'skipped-not-in-project');
    return;
  }

  const currentOptionId = item.fieldValueByName?.optionId;
  const currentName = item.fieldValueByName?.name || '(none)';

  let effectiveTarget = target;
  if (stateReason === 'completed') {
    if (currentName === PENDING_RELEASE_STATUS) {
      core.info(`${issueRef} is already ${PENDING_RELEASE_STATUS}; Status kept.`);
      await writeSummary(issueRef, 'skipped-keep-pending-release', { 'Current Status': currentName });
      return;
    }
    if (currentName === IN_REVIEW_STATUS) {
      effectiveTarget = PENDING_RELEASE_TARGET;
    }
  }

  if (currentOptionId === effectiveTarget.optionId) {
    core.info(`Status already ${effectiveTarget.name} for ${issueRef}; no write needed.`);
    await writeSummary(issueRef, 'skipped-already-in-sync', { 'Current Status': currentName });
    return;
  }

  if (dryRun) {
    core.info(`[dry-run] Would set Status of ${issueRef} from "${currentName}" to "${effectiveTarget.name}".`);
    await writeSummary(issueRef, 'dry-run-no-write', {
      'Current Status': currentName,
      'Target Status': effectiveTarget.name,
    });
    return;
  }

  await github.graphql(mutation, {
    projectId,
    itemId: item.id,
    fieldId: statusFieldId,
    optionId: effectiveTarget.optionId,
  });

  core.info(`Set Status of ${issueRef} from "${currentName}" to "${effectiveTarget.name}".`);
  await writeSummary(issueRef, 'updated', {
    'Previous Status': currentName,
    'New Status': effectiveTarget.name,
  });
};

// Close or reopen an issue from its project Status.
// Loaded by actions/close-state-sync/action.yml; tested by importing it directly.
module.exports = async function closeStateSync({ github, core, env = process.env }) {
  const projectId = env.PROJECT_ID || '';
  const itemNodeId = env.ITEM_NODE_ID || '';
  const sourceRepository = env.SOURCE_REPOSITORY || '';
  const dryRun = env.DRY_RUN === 'true';
  const debug = env.DEBUG === 'true';

  if (!projectId || !itemNodeId || itemNodeId === 'null' || itemNodeId === 'undefined') {
    core.setFailed('Missing required inputs: project_id and item_node_id are required.');
    return;
  }

  const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/;
  const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

  if (!NODE_ID_PATTERN.test(projectId) || !NODE_ID_PATTERN.test(itemNodeId)) {
    core.setFailed(`Malformed node ID in inputs (project_id or item_node_id does not match expected node ID shape).`);
    return;
  }
  if (sourceRepository && sourceRepository !== 'unknown' && !REPO_PATTERN.test(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`);
    return;
  }

  const DONE_STATUS = '🏆 Done';
  const CANCELED_STATUS = '❌ Canceled';
  const PENDING_RELEASE_STATUS = '📤 Pending Release';

  const query = `
    query($id: ID!) {
      node(id: $id) {
        __typename
        ... on ProjectV2Item {
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
          content {
            __typename
            ... on Issue {
              id
              number
              state
              stateReason
              repository {
                nameWithOwner
              }
            }
          }
        }
      }
    }
  `;

  const closeMutation = `
    mutation($issueId: ID!, $reason: IssueClosedStateReason!) {
      closeIssue(input: { issueId: $issueId, stateReason: $reason }) {
        clientMutationId
      }
    }
  `;

  const reopenMutation = `
    mutation($issueId: ID!) {
      reopenIssue(input: { issueId: $issueId }) {
        clientMutationId
      }
    }
  `;

  const writeSummary = (issueRef, status, statusName, extra = {}) => {
    const summary = core.summary
      .addHeading('Status → issue close/reopen sync')
      .addRaw(`Item: ${itemNodeId}`)
      .addEOL()
      .addRaw(`Issue: ${issueRef || 'n/a'}`)
      .addEOL()
      .addRaw(`Status: ${statusName || '(none)'}`)
      .addEOL()
      .addRaw(`Result: ${status}`)
      .addEOL()
      .addRaw(`Source repository: ${sourceRepository}`)
      .addEOL();
    for (const [key, value] of Object.entries(extra)) {
      summary.addRaw(`${key}: ${value}`).addEOL();
    }
    return summary.write();
  };

  const res = await github.graphql(query, { id: itemNodeId });
  const item = res?.node;

  if (!item || item.__typename !== 'ProjectV2Item') {
    core.warning(`Node ${itemNodeId} is not a ProjectV2Item (${item?.__typename || 'missing'}); skipping.`);
    await writeSummary(null, 'skipped-not-a-project-item', null);
    return;
  }

  if (item.project?.id !== projectId) {
    core.warning(`Item ${itemNodeId} belongs to project ${item.project?.id}, not target ${projectId}; skipping.`);
    await writeSummary(null, 'skipped-different-project', null);
    return;
  }

  const statusName = item.fieldValueByName?.name || null;
  const content = item.content;

  if (debug) {
    core.info(`Item: ${itemNodeId}`);
    core.info(`Status: ${statusName || '(none)'}`);
    core.info(`Content type: ${content?.__typename || 'none'}`);
  }

  if (!content || content.__typename !== 'Issue') {
    core.info(`Item ${itemNodeId} has no linked issue (${content?.__typename || 'draft'}); no close/reopen action.`);
    await writeSummary(null, 'skipped-no-linked-issue', statusName);
    return;
  }

  const issue = content;
  const issueRef = `${issue.repository.nameWithOwner}#${issue.number}`;
  const isClosed = issue.state === 'CLOSED';

  // Pending Release means the team's work is finished (reviewed, on staging) and only the
  // release is left, so the issue is closed as completed. An issue that is already closed,
  // whatever the reason, is left alone.
  let targetReason = null;
  let acceptAnyCloseReason = false;
  if (statusName === DONE_STATUS) {
    targetReason = 'COMPLETED';
  } else if (statusName === CANCELED_STATUS) {
    targetReason = 'NOT_PLANNED';
  } else if (statusName === PENDING_RELEASE_STATUS) {
    targetReason = 'COMPLETED';
    acceptAnyCloseReason = true;
  }

  if (targetReason) {
    if (isClosed && (acceptAnyCloseReason || issue.stateReason === targetReason)) {
      core.info(`${issueRef} already closed as ${targetReason}; no write needed.`);
      await writeSummary(issueRef, 'skipped-already-in-sync', statusName, {
        'Issue state': issue.state,
        'Issue close reason': issue.stateReason || '(none)',
      });
      return;
    }

    if (dryRun) {
      core.info(`[dry-run] Would close ${issueRef} with reason ${targetReason}.`);
      await writeSummary(issueRef, 'dry-run-no-write', statusName, { 'Target close reason': targetReason });
      return;
    }

    await github.graphql(closeMutation, { issueId: issue.id, reason: targetReason });
    core.info(`Closed ${issueRef} with reason ${targetReason}.`);
    await writeSummary(issueRef, 'closed', statusName, { 'Close reason': targetReason });
    return;
  }

  // Any other Status (including Pending Deploy, which is always open): reopen if currently closed.
  if (!isClosed) {
    core.info(`${issueRef} already open; no write needed.`);
    await writeSummary(issueRef, 'skipped-already-open', statusName, { 'Issue state': issue.state });
    return;
  }

  if (dryRun) {
    core.info(`[dry-run] Would reopen ${issueRef}.`);
    await writeSummary(issueRef, 'dry-run-no-write', statusName, { 'Target action': 'reopen' });
    return;
  }

  await github.graphql(reopenMutation, { issueId: issue.id });
  core.info(`Reopened ${issueRef}.`);
  await writeSummary(issueRef, 'reopened', statusName);
};

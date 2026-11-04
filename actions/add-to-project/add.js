// Add an issue to the org project and optionally set its Status.
// Loaded by actions/add-to-project/action.yml; tested by importing it directly.
module.exports = async function addToProject({ github, core, env = process.env }) {
  const projectId = env.PROJECT_ID || '';
  const issueNodeId = env.ISSUE_NODE_ID || '';
  const issueNumberInput = env.ISSUE_NUMBER || '';
  const sourceRepository = env.SOURCE_REPOSITORY || '';
  const dryRun = env.DRY_RUN === 'true';
  const debug = env.DEBUG === 'true';
  const statusName = env.STATUS_NAME || '';

  if (!projectId || projectId === 'null' || projectId === 'undefined') {
    core.setFailed('Missing required project_id input.');
    return;
  }
  if (!issueNodeId || issueNodeId === 'null' || issueNodeId === 'undefined') {
    core.setFailed('Missing required issue_node_id input.');
    return;
  }

  const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/;
  if (!NODE_ID_PATTERN.test(issueNodeId) || !NODE_ID_PATTERN.test(projectId)) {
    core.setFailed('Malformed node ID in inputs (issue_node_id or project_id does not match expected node ID shape).');
    return;
  }

  const query = `
    query($id: ID!) {
      node(id: $id) {
        ... on Issue {
          id
          number
          title
          repository {
            nameWithOwner
          }
          projectItems(first: 100) {
            nodes {
              project {
                id
              }
            }
          }
        }
      }
    }
  `;

  const mutation = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: {
        projectId: $projectId,
        contentId: $contentId
      }) {
        item {
          id
        }
      }
    }
  `;

  const setStatusMutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item {
          id
        }
      }
    }
  `;

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

  // Resolve the Status field and option live, by name: no option IDs are stored here.
  let statusFieldId = '';
  let statusOptionId = '';
  if (statusName) {
    const meta = await github.graphql(statusFieldQuery, { projectId });
    const field = meta?.node?.field;
    const option = (field?.options || []).find((o) => o.name === statusName);
    if (!field?.id || !option) {
      core.setFailed(`Status option "${statusName}" not found in project ${projectId}.`);
      return;
    }
    statusFieldId = field.id;
    statusOptionId = option.id;
  }

  const res = await github.graphql(query, { id: issueNodeId });
  const issue = res?.node;

  if (!issue) {
    core.setFailed(`No issue found for node ID ${issueNodeId}.`);
    return;
  }

  const issueRef = `${issue.repository.nameWithOwner}#${issue.number}`;
  const alreadyPresent = (issue.projectItems?.nodes || []).some(
    (item) => item.project?.id === projectId
  );

  if (debug) {
    core.info(`Resolved issue: ${issueRef}`);
    core.info(`Source repository input: ${sourceRepository}`);
    core.info(`Issue number input: ${issueNumberInput}`);
    core.info(`Already present: ${alreadyPresent}`);
  }

  let status;
  if (alreadyPresent) {
    status = 'already-present';
  } else if (dryRun) {
    status = 'dry-run';
  } else {
    const addRes = await github.graphql(mutation, { projectId, contentId: issueNodeId });
    status = 'added';

    if (statusFieldId && statusOptionId) {
      const itemId = addRes.addProjectV2ItemById.item.id;
      await github.graphql(setStatusMutation, {
        projectId,
        itemId,
        fieldId: statusFieldId,
        optionId: statusOptionId,
      });
    }
  }

  core.info(`Issue ${issueRef}: ${status}`);

  await core.summary
    .addHeading('Add issue to org project')
    .addRaw(`Issue: ${issueRef}`)
    .addEOL()
    .addRaw(`Status: ${status}`)
    .addEOL()
    .write();
};

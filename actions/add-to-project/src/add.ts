// Adds an issue to the org project and optionally sets its Status.
import type { Deps } from '../../../lib/types.ts'
import { isMissing, isNodeId } from '../../../lib/validate.ts'

export interface Inputs {
  projectId: string
  issueNodeId: string
  issueNumber: string
  sourceRepository: string
  dryRun: boolean
  debug: boolean
  statusName: string
}

interface StatusFieldResult {
  node?: { field?: { id?: string; options?: { id: string; name: string }[] } | null } | null
}

interface IssueResult {
  node?: {
    id: string
    number: number
    repository: { nameWithOwner: string }
    projectItems?: { nodes?: { project?: { id?: string } | null }[] }
  } | null
}

interface AddResult {
  addProjectV2ItemById: { item: { id: string } }
}

const ISSUE_QUERY = `
  query($id: ID!) {
    node(id: $id) {
      ... on Issue {
        id
        number
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
`

const ADD_MUTATION = `
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
`

const SET_STATUS_MUTATION = `
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
`

const STATUS_FIELD_QUERY = `
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
`

export async function addToProject({ graphql, core }: Deps, inputs: Inputs): Promise<void> {
  const { projectId, issueNodeId, issueNumber, sourceRepository, dryRun, debug, statusName } = inputs

  if (isMissing(projectId)) {
    core.setFailed('Missing required project_id input.')
    return
  }
  if (isMissing(issueNodeId)) {
    core.setFailed('Missing required issue_node_id input.')
    return
  }
  if (!isNodeId(issueNodeId) || !isNodeId(projectId)) {
    core.setFailed('Malformed node ID in inputs (issue_node_id or project_id does not match expected node ID shape).')
    return
  }

  // Resolve the Status field and option live, by name: no option IDs are stored here.
  let statusFieldId = ''
  let statusOptionId = ''
  if (statusName) {
    const meta = await graphql<StatusFieldResult>(STATUS_FIELD_QUERY, { projectId })
    const field = meta?.node?.field
    const option = (field?.options ?? []).find((o) => o.name === statusName)
    if (!field?.id || !option) {
      core.setFailed(`Status option "${statusName}" not found in project ${projectId}.`)
      return
    }
    statusFieldId = field.id
    statusOptionId = option.id
  }

  const res = await graphql<IssueResult>(ISSUE_QUERY, { id: issueNodeId })
  const issue = res?.node
  if (!issue) {
    core.setFailed(`No issue found for node ID ${issueNodeId}.`)
    return
  }

  const issueRef = `${issue.repository.nameWithOwner}#${issue.number}`
  const alreadyPresent = (issue.projectItems?.nodes ?? []).some((item) => item.project?.id === projectId)

  if (debug) {
    core.info(`Resolved issue: ${issueRef}`)
    core.info(`Source repository input: ${sourceRepository}`)
    core.info(`Issue number input: ${issueNumber}`)
    core.info(`Already present: ${alreadyPresent}`)
  }

  let status: 'already-present' | 'dry-run' | 'added'
  if (alreadyPresent) {
    status = 'already-present'
  } else if (dryRun) {
    status = 'dry-run'
  } else {
    const addRes = await graphql<AddResult>(ADD_MUTATION, { projectId, contentId: issueNodeId })
    status = 'added'
    if (statusFieldId && statusOptionId) {
      await graphql(SET_STATUS_MUTATION, {
        projectId,
        itemId: addRes.addProjectV2ItemById.item.id,
        fieldId: statusFieldId,
        optionId: statusOptionId
      })
    }
  }

  core.info(`Issue ${issueRef}: ${status}`)

  await core.summary
    .addHeading('Add issue to org project')
    .addRaw(`Issue: ${issueRef}`)
    .addEOL()
    .addRaw(`Status: ${status}`)
    .addEOL()
    .write()
}

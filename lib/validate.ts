// Input validation shared by every action. Inputs reach GraphQL only after passing these checks.

export const NODE_ID_PATTERN = /^[A-Za-z0-9_+/=-]+$/
export const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** True for an empty value or the literal strings a caller sends for a missing value. */
export const isMissing = (value: string | undefined): boolean =>
  !value || value === 'null' || value === 'undefined'

export const isNodeId = (value: string): boolean => NODE_ID_PATTERN.test(value)

/** A source repository is optional: empty or "unknown" are accepted, anything else must look like owner/name. */
export const isSourceRepositoryValid = (value: string): boolean =>
  !value || value === 'unknown' || REPO_PATTERN.test(value)

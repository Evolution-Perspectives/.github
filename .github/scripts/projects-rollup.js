const fs = require("fs");
const path = require("path");

const EPSILON = 0.000001;

const WEEKDAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function parseCsv(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseWeekdaysCsv(value) {
  const raw = parseCsv(value);
  const set = new Set();
  for (const token of raw) {
    const asNumber = Number(token);
    if (Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= 6) {
      set.add(asNumber);
    }
  }
  return set;
}

function parseDateSetCsv(value) {
  return new Set(parseCsv(value));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isWorkingDay(date, nonWorkingWeekdays, nonWorkingDateSet) {
  if (nonWorkingWeekdays.has(date.getUTCDay())) {
    return false;
  }
  if (nonWorkingDateSet.has(isoDate(date))) {
    return false;
  }
  return true;
}

function computeForecastDate({
  hours,
  capacityHoursPerDay,
  startDate,
  nonWorkingWeekdays,
  nonWorkingDateSet,
}) {
  if (!Number.isFinite(hours)) {
    return null;
  }

  if (!Number.isFinite(capacityHoursPerDay) || capacityHoursPerDay <= 0) {
    throw new Error("capacity_hours_per_day must be a positive number.");
  }

  const cursor = new Date(startDate);
  if (Number.isNaN(cursor.getTime())) {
    throw new Error("Invalid start date for forecast calculation.");
  }

  let pending = Math.max(0, hours);

  if (pending <= EPSILON) {
    while (!isWorkingDay(cursor, nonWorkingWeekdays, nonWorkingDateSet)) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return isoDate(cursor);
  }

  while (pending > EPSILON) {
    if (isWorkingDay(cursor, nonWorkingWeekdays, nonWorkingDateSet)) {
      pending -= capacityHoursPerDay;
      if (pending <= EPSILON) {
        return isoDate(cursor);
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return isoDate(cursor);
}

function nearlyEqual(a, b) {
  if (a === null && b === null) {
    return true;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return false;
  }
  return Math.abs(a - b) <= EPSILON;
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function extractFieldMap(item) {
  const result = new Map();
  for (const fieldValue of item.fieldValues?.nodes || []) {
    const field = fieldValue?.field;
    const fieldId = field?.id;
    if (!fieldId) {
      continue;
    }

    if (fieldValue.__typename === "ProjectV2ItemFieldNumberValue") {
      result.set(fieldId, { type: "number", value: normalizeNumber(fieldValue.number) });
      continue;
    }

    if (fieldValue.__typename === "ProjectV2ItemFieldDateValue") {
      result.set(fieldId, { type: "date", value: fieldValue.date || null });
      continue;
    }

    if (fieldValue.__typename === "ProjectV2ItemFieldSingleSelectValue") {
      result.set(fieldId, { type: "single-select", value: fieldValue.optionId || null });
      continue;
    }

    if (fieldValue.__typename === "ProjectV2ItemFieldTextValue") {
      result.set(fieldId, { type: "text", value: fieldValue.text || null });
    }
  }
  return result;
}

function buildNodeMaps(items) {
  const itemsByItemId = new Map();
  const issueNodeToItemId = new Map();
  for (const item of items) {
    itemsByItemId.set(item.id, item);
    if (item.content?.__typename === "Issue" && item.content.id) {
      issueNodeToItemId.set(item.content.id, item.id);
    }
  }
  return { itemsByItemId, issueNodeToItemId };
}

async function fetchProjectItems(github, core, projectId, maxItems, debug) {
  const query = `
    query($projectId: ID!, $after: String) {
      node(id: $projectId) {
        ... on ProjectV2 {
          id
          title
          items(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              id
              fieldValues(first: 100) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    optionId
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                      ... on ProjectV2IterationField {
                        id
                        name
                      }
                    }
                  }
                }
              }
              content {
                __typename
                ... on Issue {
                  id
                  number
                  title
                  assignees(first: 5) {
                    nodes {
                      login
                    }
                  }
                  repository {
                    name
                    nameWithOwner
                    owner {
                      login
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const items = [];
  let after = null;

  while (true) {
    const response = await github.graphql(query, {
      projectId,
      after,
    });

    const project = response?.node;
    if (!project?.items) {
      throw new Error(`Unable to load project items for project ${projectId}.`);
    }

    const pageItems = project.items.nodes || [];
    for (const item of pageItems) {
      if (item.content?.__typename !== "Issue") {
        continue;
      }
      item._fieldMap = extractFieldMap(item);
      items.push(item);
      if (items.length >= maxItems) {
        return items;
      }
    }

    const pageInfo = project.items.pageInfo;
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) {
      break;
    }
    after = pageInfo.endCursor;

    if (debug) {
      core.info(`Loaded ${items.length} issue-backed project items so far.`);
    }
  }

  return items;
}

async function fetchSubIssueNodeIds(github, owner, repo, issueNumber) {
  const response = await github.request("GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues", {
    owner,
    repo,
    issue_number: issueNumber,
    headers: {
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (Array.isArray(response.data)) {
    return response.data.map((entry) => entry.node_id).filter(Boolean);
  }

  if (Array.isArray(response.data?.sub_issues)) {
    return response.data.sub_issues.map((entry) => entry.node_id).filter(Boolean);
  }

  if (Array.isArray(response.data?.items)) {
    return response.data.items.map((entry) => entry.node_id).filter(Boolean);
  }

  return [];
}

async function buildHierarchy(github, core, items, issueNodeToItemId, debug) {
  const childMap = new Map();
  const parentMap = new Map();

  for (const item of items) {
    childMap.set(item.id, new Set());
  }

  for (const item of items) {
    const issue = item.content;
    const owner = issue?.repository?.owner?.login;
    const repo = issue?.repository?.name;
    const issueNumber = issue?.number;

    if (!owner || !repo || !Number.isInteger(issueNumber)) {
      continue;
    }

    try {
      const subIssueNodeIds = await fetchSubIssueNodeIds(github, owner, repo, issueNumber);
      for (const subIssueNodeId of subIssueNodeIds) {
        const childItemId = issueNodeToItemId.get(subIssueNodeId);
        if (!childItemId) {
          continue;
        }
        childMap.get(item.id)?.add(childItemId);
        parentMap.set(childItemId, item.id);
      }
    } catch (error) {
      const status = error?.status;
      if (status === 404 || status === 422) {
        if (debug) {
          core.info(`No sub-issues endpoint support or no sub-issues for ${issue.repository.nameWithOwner}#${issue.number}.`);
        }
        continue;
      }
      core.warning(`Failed to query sub-issues for ${issue.repository.nameWithOwner}#${issue.number}: ${error.message || String(error)}`);
    }
  }

  return { childMap, parentMap };
}

function findRoot(itemId, parentMap) {
  let cursor = itemId;
  const seen = new Set();

  while (parentMap.has(cursor)) {
    if (seen.has(cursor)) {
      return itemId;
    }
    seen.add(cursor);
    cursor = parentMap.get(cursor);
  }

  return cursor;
}

function collectDescendants(rootItemId, childMap) {
  const stack = [rootItemId];
  const visited = new Set();

  while (stack.length > 0) {
    const current = stack.pop();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    const children = childMap.get(current) || new Set();
    for (const child of children) {
      stack.push(child);
    }
  }

  return visited;
}

function computeRollupForNode(itemId, childMap, itemsByItemId, config, memo, visiting) {
  if (memo.has(itemId)) {
    return memo.get(itemId);
  }

  if (visiting.has(itemId)) {
    const fallback = { estimateHours: 0, effectiveHours: 0, missing: true, hasChildren: false };
    memo.set(itemId, fallback);
    return fallback;
  }

  visiting.add(itemId);

  const item = itemsByItemId.get(itemId);
  const fieldMap = item?._fieldMap || new Map();
  const children = Array.from(childMap.get(itemId) || []);

  if (children.length === 0) {
    const leafEstimate = normalizeNumber(fieldMap.get(config.estimateFieldId)?.value);
    const leafHours = leafEstimate;
    const missingEstimate = leafEstimate === null;

    const result = {
      estimateHours: leafEstimate === null ? 0 : leafEstimate,
      effectiveHours: leafHours === null ? 0 : leafHours,
      missing: config.strictMode ? missingEstimate : false,
      hasChildren: false,
    };

    memo.set(itemId, result);
    visiting.delete(itemId);
    return result;
  }

  let estimateTotal = 0;
  let effectiveTotal = 0;
  let missing = false;

  for (const childId of children) {
    const child = computeRollupForNode(childId, childMap, itemsByItemId, config, memo, visiting);
    estimateTotal += child.estimateHours;
    effectiveTotal += child.effectiveHours;
    missing = missing || child.missing;
  }

  const result = {
    estimateHours: estimateTotal,
    effectiveHours: effectiveTotal,
    missing,
    hasChildren: true,
  };

  memo.set(itemId, result);
  visiting.delete(itemId);
  return result;
}

async function updateNumberField(github, projectId, itemId, fieldId, value) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Float!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { number: $value }
      }) {
        clientMutationId
      }
    }
  `;

  await github.graphql(mutation, {
    projectId,
    itemId,
    fieldId,
    value,
  });
}

async function updateDateField(github, projectId, itemId, fieldId, value) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: Date!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId,
        value: { date: $value }
      }) {
        clientMutationId
      }
    }
  `;

  await github.graphql(mutation, {
    projectId,
    itemId,
    fieldId,
    value,
  });
}

async function updateSingleSelectField(github, projectId, itemId, fieldId, optionId) {
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

  await github.graphql(mutation, {
    projectId,
    itemId,
    fieldId,
    optionId,
  });
}

async function clearField(github, projectId, itemId, fieldId) {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!) {
      clearProjectV2ItemFieldValue(input: {
        projectId: $projectId,
        itemId: $itemId,
        fieldId: $fieldId
      }) {
        clientMutationId
      }
    }
  `;

  await github.graphql(mutation, {
    projectId,
    itemId,
    fieldId,
  });
}

// ─── Capacity calendar ────────────────────────────────────────────────────────

function parseCapacityYaml(content) {
  const lines = content.split(/\r?\n/);
  const result = { users: {}, nonWorkingDays: new Set() };
  let currentSection = null;
  let currentUser = null;

  for (const rawLine of lines) {
    const stripped = rawLine.replace(/#.*$/, "").trimEnd();
    if (!stripped.trim()) {
      continue;
    }

    const indent = stripped.length - stripped.trimStart().length;
    const trimmed = stripped.trim();

    if (indent === 0) {
      if (trimmed === "users:") {
        currentSection = "users";
        currentUser = null;
      } else if (trimmed === "non_working_days:") {
        currentSection = "non_working_days";
        currentUser = null;
      } else {
        currentSection = null;
        currentUser = null;
      }
      continue;
    }

    if (indent === 2) {
      if (currentSection === "users") {
        const match = trimmed.match(/^([\w][\w.-]*):\s*$/);
        if (match) {
          currentUser = match[1];
          result.users[currentUser] = {};
        }
      } else if (currentSection === "non_working_days") {
        const match = trimmed.match(/^-\s+"?([0-9]{4}-[0-9]{2}-[0-9]{2})"?\s*$/);
        if (match) {
          result.nonWorkingDays.add(match[1]);
        }
      }
      continue;
    }

    if (indent === 4 && currentSection === "users" && currentUser) {
      const match = trimmed.match(/^([a-z]+):\s*(\d+(?:\.\d+)?)\s*$/);
      if (match) {
        const day = match[1].toLowerCase();
        if (WEEKDAY_NAMES.includes(day)) {
          result.users[currentUser][day] = Number(match[2]);
        }
      }
    }
  }

  return result;
}

function loadCapacityConfig(workspaceDir) {
  const filePath = path.join(workspaceDir || process.cwd(), ".github", "capacity.yml");
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      const err = new Error(`Capacity config not found: ${filePath}`);
      err.code = "CAPACITY_FILE_MISSING";
      throw err;
    }
    throw error;
  }

  const parsed = parseCapacityYaml(content);
  if (!parsed.users || typeof parsed.users !== "object") {
    throw new Error('capacity.yml is malformed: missing or invalid "users" section.');
  }
  return parsed;
}

function getUserDayCapacity(userCal, date) {
  const dayName = WEEKDAY_NAMES[date.getUTCDay()];
  const capacity = userCal[dayName];
  return typeof capacity === "number" ? capacity : 0;
}

function advanceToNextAvailableDay(cursor, userCal, nonWorkingWeekdays, nonWorkingDateSet) {
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (true) {
    if (isWorkingDay(cursor, nonWorkingWeekdays, nonWorkingDateSet)) {
      const cap = getUserDayCapacity(userCal, cursor);
      if (cap > EPSILON) {
        return cap;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

function scheduleAssigneeItems(userCal, items, anchorDate, nonWorkingWeekdays, nonWorkingDateSet, rollupMemo) {
  const schedule = new Map();
  if (items.length === 0) {
    return schedule;
  }

  const cursor = new Date(anchorDate.getTime());
  let dayCapRemaining = 0;

  // Advance to the first available working day from anchorDate.
  while (true) {
    if (isWorkingDay(cursor, nonWorkingWeekdays, nonWorkingDateSet)) {
      dayCapRemaining = getUserDayCapacity(userCal, cursor);
      if (dayCapRemaining > EPSILON) {
        break;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const item of items) {
    // If the current day's capacity was exhausted by the previous issue, advance.
    if (dayCapRemaining <= EPSILON) {
      dayCapRemaining = advanceToNextAvailableDay(cursor, userCal, nonWorkingWeekdays, nonWorkingDateSet);
    }

    const startDate = isoDate(cursor);
    const rollup = rollupMemo.get(item.id);
    const issueEstimate = rollup ? rollup.estimateHours : 0;

    if (issueEstimate <= EPSILON) {
      // Zero-estimate: start and end on the same day, consume no capacity.
      schedule.set(item.id, { startDate, endDate: startDate });
      continue;
    }

    let remaining = issueEstimate;
    while (remaining > EPSILON) {
      const consume = Math.min(remaining, dayCapRemaining);
      remaining -= consume;
      dayCapRemaining -= consume;
      if (remaining <= EPSILON) {
        break;
      }
      // Day exhausted; find the next available working day.
      dayCapRemaining = advanceToNextAvailableDay(cursor, userCal, nonWorkingWeekdays, nonWorkingDateSet);
    }

    schedule.set(item.id, { startDate, endDate: isoDate(cursor) });
    // cursor stays at endDate with dayCapRemaining reflecting remaining capacity.
  }

  return schedule;
}

function deriveParentScheduleDates(itemId, childMap, scheduleMap, visited) {
  if (visited.has(itemId)) {
    return scheduleMap.get(itemId) || null;
  }
  visited.add(itemId);

  const children = Array.from(childMap.get(itemId) || []);
  if (children.length === 0) {
    return scheduleMap.get(itemId) || null;
  }

  let minStart = null;
  let maxEnd = null;

  for (const childId of children) {
    const childDates = deriveParentScheduleDates(childId, childMap, scheduleMap, visited);
    if (!childDates) {
      continue;
    }
    if (minStart === null || childDates.startDate < minStart) {
      minStart = childDates.startDate;
    }
    if (maxEnd === null || childDates.endDate > maxEnd) {
      maxEnd = childDates.endDate;
    }
  }

  if (minStart !== null && maxEnd !== null) {
    const parentDates = { startDate: minStart, endDate: maxEnd };
    scheduleMap.set(itemId, parentDates);
    return parentDates;
  }
  return null;
}

async function runScheduling(github, core, config, items, itemsByItemId, childMap, rollupMemo, anchorDate) {
  const scheduleWarnings = [];
  const scheduleMap = new Map();

  let capacityConfig;
  try {
    capacityConfig = loadCapacityConfig();
  } catch (error) {
    if (error.code === "CAPACITY_FILE_MISSING") {
      core.warning("Scheduling phase skipped: .github/capacity.yml not found in repository.");
      return { scheduled: 0, skipped: 0, written: 0, warnings: [] };
    }
    core.warning(`Scheduling phase failed to load config: ${error.message}`);
    return { scheduled: 0, skipped: 0, written: 0, warnings: [error.message] };
  }

  const combinedNonWorkingDates = new Set([
    ...config.nonWorkingDateSet,
    ...capacityConfig.nonWorkingDays,
  ]);

  // Group leaf items by first assignee login.
  const byAssignee = new Map();
  let skipCount = 0;

  for (const item of items) {
    const rollup = rollupMemo.get(item.id);
    if (!rollup || rollup.hasChildren) {
      continue; // only schedule leaves
    }

    const assigneeNodes = item.content?.assignees?.nodes || [];
    const login = assigneeNodes[0]?.login || null;

    if (!login) {
      scheduleWarnings.push(`Issue #${item.content?.number}: no assignee, cannot schedule`);
      skipCount++;
      continue;
    }

    if (!capacityConfig.users[login]) {
      scheduleWarnings.push(`Issue #${item.content?.number}: assignee '${login}' not in capacity.yml, skipping`);
      skipCount++;
      continue;
    }

    if (!byAssignee.has(login)) {
      byAssignee.set(login, []);
    }
    byAssignee.get(login).push(item);
  }

  // Schedule each assignee's items independently (parallel tracks).
  for (const [login, assigneeItems] of byAssignee) {
    if (config.debug) {
      core.info(`Scheduling ${assigneeItems.length} issue(s) for ${login}`);
    }
    const userCal = capacityConfig.users[login];
    const assigneeSchedule = scheduleAssigneeItems(
      userCal,
      assigneeItems,
      anchorDate,
      config.nonWorkingWeekdays,
      combinedNonWorkingDates,
      rollupMemo,
    );
    for (const [itemId, dates] of assigneeSchedule) {
      scheduleMap.set(itemId, dates);
      if (config.debug) {
        const item = itemsByItemId.get(itemId);
        core.info(`  #${item?.content?.number}: ${dates.startDate} → ${dates.endDate}`);
      }
    }
  }

  // Derive parent dates bottom-up from leaf schedule results.
  const visited = new Set();
  for (const itemId of itemsByItemId.keys()) {
    deriveParentScheduleDates(itemId, childMap, scheduleMap, visited);
  }

  // Write date fields.
  let written = 0;
  const hasStartField = !!config.startDateFieldId;
  const hasEndField = !!config.endDateFieldId;

  if (!hasStartField && !hasEndField) {
    core.info("Scheduling: start_date_field_id and end_date_field_id not configured; computed dates logged only.");
  }

  for (const [itemId, dates] of scheduleMap) {
    const item = itemsByItemId.get(itemId);
    if (!item) {
      continue;
    }

    if (hasStartField) {
      const current = item._fieldMap.get(config.startDateFieldId)?.value || null;
      if (current !== dates.startDate) {
        if (!config.dryRun) {
          await updateDateField(github, config.projectId, itemId, config.startDateFieldId, dates.startDate);
        }
        item._fieldMap.set(config.startDateFieldId, { type: "date", value: dates.startDate });
        written++;
      }
    }

    if (hasEndField) {
      const current = item._fieldMap.get(config.endDateFieldId)?.value || null;
      if (current !== dates.endDate) {
        if (!config.dryRun) {
          await updateDateField(github, config.projectId, itemId, config.endDateFieldId, dates.endDate);
        }
        item._fieldMap.set(config.endDateFieldId, { type: "date", value: dates.endDate });
        written++;
      }
    }
  }

  for (const warning of scheduleWarnings) {
    core.warning(`Scheduling: ${warning}`);
  }

  return { scheduled: scheduleMap.size, skipped: skipCount, written, warnings: scheduleWarnings };
}

function parseConfig(inputs, context) {
  const projectId = inputs.projectId || "";
  const estimateFieldId = inputs.estimateFieldId || "";
  const forecastDateFieldId = inputs.forecastDateFieldId || "";
  const forecastStateFieldId = inputs.forecastStateFieldId || "";
  const incompleteForecastStateOptionId = inputs.incompleteForecastStateOptionId || "";
  const startDateFieldId = inputs.startDateFieldId || "";
  const endDateFieldId = inputs.endDateFieldId || "";
  const scheduleStartDate = inputs.scheduleStartDate || null;

  const strictMode = toBool(inputs.strictMode, true);
  const failFast = toBool(inputs.failFast, false);
  const dryRun = toBool(inputs.dryRun, false);
  const debug = toBool(inputs.debug, false);

  const capacityHoursPerDay = Number(inputs.capacityHoursPerDay || 6);
  const maxItems = Number(inputs.maxItems || 500);

  if (!projectId) {
    throw new Error("Missing required input project_id.");
  }
  if (!estimateFieldId) {
    throw new Error("Missing required input estimate_field_id.");
  }
  if (!Number.isFinite(capacityHoursPerDay) || capacityHoursPerDay <= 0) {
    throw new Error("capacity_hours_per_day must be a positive number.");
  }
  if (!Number.isFinite(maxItems) || maxItems <= 0) {
    throw new Error("max_items must be a positive number.");
  }
  if (scheduleStartDate) {
    const d = new Date(`${scheduleStartDate}T00:00:00.000Z`);
    if (isNaN(d.getTime())) {
      throw new Error(`Invalid schedule_start_date: '${scheduleStartDate}'. Use YYYY-MM-DD format.`);
    }
  }

  const correlationId = [
    context.runId,
    context.runAttempt,
    Date.now(),
  ].join("-");

  return {
    projectId,
    estimateFieldId,
    forecastDateFieldId,
    forecastStateFieldId,
    incompleteForecastStateOptionId,
    startDateFieldId,
    endDateFieldId,
    scheduleStartDate,
    strictMode,
    failFast,
    dryRun,
    debug,
    capacityHoursPerDay,
    maxItems,
    nonWorkingWeekdays: parseWeekdaysCsv(inputs.nonWorkingWeekdays || "0,6"),
    nonWorkingDateSet: parseDateSetCsv(inputs.nonWorkingDates || ""),
    explicitRootItemId: inputs.rootItemId || "",
    eventItemNodeId: inputs.eventItemNodeId || "",
    eventAction: inputs.eventAction || "reconcile",
    todayIso: inputs.todayIso || null,
    correlationId,
  };
}

function selectRoots(config, allItemIds, issueNodeToItemId, parentMap) {
  if (config.explicitRootItemId) {
    const fromNode = issueNodeToItemId.get(config.explicitRootItemId);
    if (fromNode) {
      return [fromNode];
    }
    if (allItemIds.has(config.explicitRootItemId)) {
      return [config.explicitRootItemId];
    }
  }

  if (config.eventItemNodeId) {
    const eventItemId = issueNodeToItemId.get(config.eventItemNodeId);
    if (eventItemId) {
      return [findRoot(eventItemId, parentMap)];
    }
  }

  const roots = [];
  for (const itemId of allItemIds) {
    if (!parentMap.has(itemId)) {
      roots.push(itemId);
    }
  }

  if (roots.length === 0) {
    return Array.from(allItemIds);
  }

  return roots;
}

async function run({ github, core, context, inputs }) {
  const config = parseConfig(inputs, context);
  const metrics = {
    discovered: 0,
    changed: 0,
    failed: 0,
    noOpRoots: 0,
    processedRoots: 0,
    missingForecastRoots: 0,
  };

  const startedAt = new Date().toISOString();
  core.info(`Correlation ID: ${config.correlationId}`);
  core.info(`Event action: ${config.eventAction}`);

  const items = await fetchProjectItems(github, core, config.projectId, config.maxItems, config.debug);
  metrics.discovered = items.length;

  const { itemsByItemId, issueNodeToItemId } = buildNodeMaps(items);
  const allItemIds = new Set(itemsByItemId.keys());
  const { childMap, parentMap } = await buildHierarchy(github, core, items, issueNodeToItemId, config.debug);

  const rootIds = selectRoots(config, allItemIds, issueNodeToItemId, parentMap);

  if (config.debug) {
    core.info(`Root items selected: ${rootIds.length}`);
  }

  const today = config.todayIso ? new Date(`${config.todayIso}T00:00:00.000Z`) : new Date();
  const utcStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  const globalMemo = new Map();

  for (const rootId of rootIds) {
    try {
      const reachable = collectDescendants(rootId, childMap);
      const memo = new Map();
      const visiting = new Set();

      computeRollupForNode(rootId, childMap, itemsByItemId, config, memo, visiting);
      for (const [k, v] of memo) {
        globalMemo.set(k, v);
      }

      let rootChanged = false;
      for (const nodeId of reachable) {
        const item = itemsByItemId.get(nodeId);
        if (!item) {
          continue;
        }

        const rollup = memo.get(nodeId);
        if (!rollup || !rollup.hasChildren) {
          continue;
        }

        const currentEstimate = normalizeNumber(item._fieldMap.get(config.estimateFieldId)?.value);
        if (!nearlyEqual(currentEstimate, rollup.estimateHours)) {
          if (!config.dryRun) {
            await updateNumberField(github, config.projectId, nodeId, config.estimateFieldId, rollup.estimateHours);
          }
          item._fieldMap.set(config.estimateFieldId, { type: "number", value: rollup.estimateHours });
          metrics.changed += 1;
          rootChanged = true;
        }
      }

      const rootRollup = memo.get(rootId);
      if (config.forecastDateFieldId && rootRollup) {
        const rootItem = itemsByItemId.get(rootId);
        const currentForecastDate = rootItem?._fieldMap.get(config.forecastDateFieldId)?.value || null;

        if (config.strictMode && rootRollup.missing) {
          metrics.missingForecastRoots += 1;

          if (currentForecastDate !== null) {
            if (!config.dryRun) {
              await clearField(github, config.projectId, rootId, config.forecastDateFieldId);
            }
            rootChanged = true;
            metrics.changed += 1;
          }

          if (config.forecastStateFieldId && config.incompleteForecastStateOptionId) {
            const currentStateOption = rootItem?._fieldMap.get(config.forecastStateFieldId)?.value || null;
            if (currentStateOption !== config.incompleteForecastStateOptionId) {
              if (!config.dryRun) {
                await updateSingleSelectField(
                  github,
                  config.projectId,
                  rootId,
                  config.forecastStateFieldId,
                  config.incompleteForecastStateOptionId,
                );
              }
              rootChanged = true;
              metrics.changed += 1;
              rootItem?._fieldMap.set(config.forecastStateFieldId, {
                type: "single-select",
                value: config.incompleteForecastStateOptionId,
              });
            }
          }
        } else {
          const forecastDate = computeForecastDate({
            hours: rootRollup.effectiveHours,
            capacityHoursPerDay: config.capacityHoursPerDay,
            startDate: utcStart,
            nonWorkingWeekdays: config.nonWorkingWeekdays,
            nonWorkingDateSet: config.nonWorkingDateSet,
          });

          if (currentForecastDate !== forecastDate) {
            if (!config.dryRun) {
              await updateDateField(github, config.projectId, rootId, config.forecastDateFieldId, forecastDate);
            }
            rootChanged = true;
            metrics.changed += 1;
            rootItem?._fieldMap.set(config.forecastDateFieldId, {
              type: "date",
              value: forecastDate,
            });
          }

          if (config.forecastStateFieldId && config.incompleteForecastStateOptionId) {
            const currentStateOption = rootItem?._fieldMap.get(config.forecastStateFieldId)?.value || null;
            if (currentStateOption === config.incompleteForecastStateOptionId) {
              if (!config.dryRun) {
                await clearField(github, config.projectId, rootId, config.forecastStateFieldId);
              }
              rootChanged = true;
              metrics.changed += 1;
            }
          }
        }
      }

      if (!rootChanged) {
        metrics.noOpRoots += 1;
      }

      metrics.processedRoots += 1;
    } catch (error) {
      metrics.failed += 1;
      core.warning(`Failed root ${rootId}: ${error.message || String(error)}`);
      if (config.failFast) {
        throw error;
      }
    }
  }

  // ─── Scheduling phase ───────────────────────────────────────────────────────
  const scheduleAnchor = config.scheduleStartDate
    ? new Date(`${config.scheduleStartDate}T00:00:00.000Z`)
    : utcStart;

  const scheduleMetrics = await runScheduling(
    github,
    core,
    config,
    items,
    itemsByItemId,
    childMap,
    globalMemo,
    scheduleAnchor,
  );

  const endedAt = new Date().toISOString();
  await core.summary
    .addHeading("Projects Rollup Automation")
    .addRaw(`Correlation ID: ${config.correlationId}`)
    .addEOL()
    .addRaw(`Mode: ${config.dryRun ? "dry-run" : "write"}`)
    .addEOL()
    .addRaw(`Started: ${startedAt}`)
    .addEOL()
    .addRaw(`Ended: ${endedAt}`)
    .addEOL()
    .addRaw(`Items discovered: ${metrics.discovered}`)
    .addEOL()
    .addRaw(`Roots processed: ${metrics.processedRoots}`)
    .addEOL()
    .addRaw(`Items changed: ${metrics.changed}`)
    .addEOL()
    .addRaw(`No-op roots: ${metrics.noOpRoots}`)
    .addEOL()
    .addRaw(`Roots with incomplete forecast: ${metrics.missingForecastRoots}`)
    .addEOL()
    .addRaw(`Roots failed: ${metrics.failed}`)
    .addEOL()
    .addRaw(`Scheduling — issues scheduled: ${scheduleMetrics.scheduled}`)
    .addEOL()
    .addRaw(`Scheduling — issues skipped: ${scheduleMetrics.skipped}`)
    .addEOL()
    .addRaw(`Scheduling — date fields written: ${scheduleMetrics.written}`)
    .addEOL()
    .write();

  if (metrics.failed > 0 && config.failFast) {
    core.setFailed(`Projects rollup failed for ${metrics.failed} root(s).`);
  }

  return metrics;
}

function processRootsWithContinuation(rootIds, handler, failFast) {
  let completed = 0;
  let failed = 0;
  for (const rootId of rootIds) {
    try {
      handler(rootId);
      completed += 1;
    } catch (error) {
      failed += 1;
      if (failFast) {
        throw error;
      }
    }
  }
  return { completed, failed };
}

module.exports = {
  computeForecastDate,
  computeRollupForNode,
  buildNodeMaps,
  processRootsWithContinuation,
  parseWeekdaysCsv,
  parseDateSetCsv,
  nearlyEqual,
  parseCapacityYaml,
  getUserDayCapacity,
  scheduleAssigneeItems,
  deriveParentScheduleDates,
  run,
};

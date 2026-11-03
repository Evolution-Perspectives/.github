#!/usr/bin/env node
/**
 * Regenerates docs/project-schema/*.json from the live GitHub org Project.
 *
 * GitHub is the source of truth; the files are a cached, read-only copy
 * (for humans, AI assistants and drift detection). Nothing writes back.
 *
 * Usage:
 *   node .github/scripts/refresh-project-schema.js [--check]
 *
 * Env:
 *   PROJECT_ORG     default "Evolution-Perspectives"
 *   PROJECT_NUMBER  default "2"
 *   OUT_DIR         default "docs/project-schema"
 *   GH_TOKEN        token with read:project + read:org (gh CLI auth is used otherwise)
 *
 * --check : do not write; exit 1 if files would change (drift).
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ORG = process.env.PROJECT_ORG || 'Evolution-Perspectives';
const NUMBER = Number(process.env.PROJECT_NUMBER || 2);
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'docs/project-schema');
const CHECK = process.argv.includes('--check');

const QUERY = `
query($org: String!, $number: Int!) {
  organization(login: $org) {
    issueTypes(first: 50) {
      pageInfo { hasNextPage }
      nodes { id name color description isEnabled }
    }
    issueFields(first: 50) {
      pageInfo { hasNextPage }
      nodes {
        __typename
        ... on IssueFieldCommon { name dataType description visibility }
      }
    }
    projectV2(number: $number) {
      id
      number
      title
      shortDescription
      public
      closed
      url
      fields(first: 100) {
        pageInfo { hasNextPage }
        nodes {
          ... on ProjectV2FieldCommon { id name dataType }
          ... on ProjectV2SingleSelectField {
            options { id name color description }
          }
          ... on ProjectV2IterationField {
            configuration {
              duration
              startDay
              iterations { id title startDate duration }
              completedIterations { id title startDate duration }
            }
          }
        }
      }
      workflows(first: 50) {
        pageInfo { hasNextPage }
        nodes { id number name enabled }
      }
      views(first: 50) {
        pageInfo { hasNextPage }
        nodes {
          id name number layout filter
          configuration {
            visibleFields(first: 50) { pageInfo { hasNextPage } nodes { ... on ProjectV2FieldCommon { name } } }
          }
          groupByFields(first: 10) { pageInfo { hasNextPage } nodes { ... on ProjectV2FieldCommon { name } } }
          verticalGroupByFields(first: 10) { pageInfo { hasNextPage } nodes { ... on ProjectV2FieldCommon { name } } }
          sortByFields(first: 10) { pageInfo { hasNextPage } nodes { direction field { ... on ProjectV2FieldCommon { name } } } }
        }
      }
      repositories(first: 100) {
        pageInfo { hasNextPage }
        nodes { nameWithOwner }
      }
    }
  }
}`;

const ITEMS_QUERY = `
query($org: String!, $number: Int!, $cursor: String) {
  organization(login: $org) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          type
          content {
            ... on Issue { repository { nameWithOwner } }
            ... on PullRequest { repository { nameWithOwner } }
          }
        }
      }
    }
  }
}`;

// Distinct repositories and item types present in the project (paginated).
function fetchItemSources() {
  const repos = new Set();
  const types = new Set();
  let cursor = null;
  for (;;) {
    const args = ['api', 'graphql', '-f', `query=${ITEMS_QUERY}`, '-f', `org=${ORG}`, '-F', `number=${NUMBER}`];
    if (cursor) args.push('-f', `cursor=${cursor}`);
    const json = JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
    if (json.errors) throw new Error(JSON.stringify(json.errors));
    const items = json.data.organization.projectV2.items;
    for (const n of items.nodes) {
      types.add(n.type);
      if (n.content && n.content.repository) repos.add(n.content.repository.nameWithOwner);
    }
    if (!items.pageInfo.hasNextPage) break;
    cursor = items.pageInfo.endCursor;
  }
  return { repos: [...repos].sort(), types: [...types].sort() };
}

const INTROSPECTION_QUERY = `
{
  __schema {
    mutationType { fields { name description args { name } } }
    types {
      kind name description
      enumValues { name description }
      inputFields { name description defaultValue type { ...T } }
    }
  }
}
fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }`;

function typeRef(t) {
  if (t.kind === 'NON_NULL') return `${typeRef(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${typeRef(t.ofType)}]`;
  return t.name;
}
function namedType(t) {
  return t.ofType ? namedType(t.ofType) : t;
}

// What *can* exist in a Project, independent of what currently does:
// enums (field types, colors, layouts, roles...), input shapes and mutations.
function buildReference() {
  const out = execFileSync('gh', ['api', 'graphql', '-f', `query=${INTROSPECTION_QUERY}`], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const json = JSON.parse(out);
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const schema = json.data.__schema;
  const types = new Map(schema.types.map((t) => [t.name, t]));

  const MUTATION_RE = /ProjectV2|IssueType|IssueField|SubIssue|BlockedBy|Label|Milestone/;
  const mutations = schema.mutationType.fields.filter((m) => MUTATION_RE.test(m.name));

  // Closure: every input object / enum reachable from the selected mutations.
  const inputNames = new Set();
  const enumNames = new Set();
  const queue = [];
  const visit = (name) => {
    const t = types.get(name);
    if (!t) return;
    if (t.kind === 'INPUT_OBJECT' && !inputNames.has(name)) {
      inputNames.add(name);
      queue.push(t);
    } else if (t.kind === 'ENUM') enumNames.add(name);
  };
  const mutationRows = mutations
    .map((m) => {
      const input = `${m.name[0].toUpperCase()}${m.name.slice(1)}Input`;
      visit(input);
      return { name: m.name, input, description: (m.description || '').trim() || null };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  while (queue.length) {
    for (const f of queue.pop().inputFields) visit(namedType(f.type).name);
  }

  // Read-side vocabulary (field types, item types, view layouts, roles, colors...).
  for (const t of types.values()) {
    if (t.kind === 'ENUM' && /^(ProjectV2|IssueType|IssueField)/.test(t.name) && !/OrderField$/.test(t.name)) {
      enumNames.add(t.name);
    }
  }

  const sortKeys = (names) => [...names].sort((a, b) => a.localeCompare(b, 'en'));
  const enums = {};
  for (const n of sortKeys(enumNames)) {
    enums[n] = types.get(n).enumValues.map((v) => ({
      value: v.name,
      description: (v.description || '').trim() || null,
    }));
  }
  const inputs = {};
  for (const n of sortKeys(inputNames)) {
    inputs[n] = types.get(n).inputFields.filter((f) => f.name !== 'clientMutationId').map((f) => ({
      name: f.name,
      type: typeRef(f.type),
      required: f.type.kind === 'NON_NULL' && f.defaultValue == null,
      description: (f.description || '').trim() || null,
    }));
  }
  return { enums, inputs, mutations: mutationRows };
}

// Fail loudly instead of silently truncating when a bounded query is too small.
function assertComplete(label, conn) {
  if (conn && conn.pageInfo && conn.pageInfo.hasNextPage) {
    throw new Error(`${label}: more results than the query limit; raise "first:" or paginate`);
  }
}

function assertAllComplete(org) {
  const p = org.projectV2;
  assertComplete('issueTypes', org.issueTypes);
  assertComplete('issueFields', org.issueFields);
  assertComplete('project fields', p.fields);
  assertComplete('project workflows', p.workflows);
  assertComplete('project views', p.views);
  assertComplete('project repositories', p.repositories);
  for (const v of p.views.nodes) {
    assertComplete(`view "${v.name}" visibleFields`, v.configuration.visibleFields);
    assertComplete(`view "${v.name}" groupByFields`, v.groupByFields);
    assertComplete(`view "${v.name}" verticalGroupByFields`, v.verticalGroupByFields);
    assertComplete(`view "${v.name}" sortByFields`, v.sortByFields);
  }
}

// Labels and milestones of the repos that feed the project (Labels / Milestone
// are project fields). One aliased query for all repos.
function fetchRepoMetadata(repos) {
  const aliases = repos.map((full, i) => {
    const [owner, name] = full.split('/');
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
      nameWithOwner
      labels(first: 100) { pageInfo { hasNextPage } nodes { name color description } }
      milestones(first: 100, states: [OPEN, CLOSED]) { pageInfo { hasNextPage } nodes { title state dueOn description } }
    }`;
  });
  const out = execFileSync('gh', ['api', 'graphql', '-f', `query={${aliases.join('\n')}}`], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const json = JSON.parse(out);
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const labels = {};
  const milestones = {};
  for (const r of Object.values(json.data)) {
    assertComplete(`${r.nameWithOwner} labels`, r.labels);
    assertComplete(`${r.nameWithOwner} milestones`, r.milestones);
    labels[r.nameWithOwner] = r.labels.nodes
      .map(({ name, color, description }) => ({ name, color, description: description || null }))
      .sort(byName);
    milestones[r.nameWithOwner] = r.milestones.nodes
      .map(({ title, state, dueOn, description }) => ({ title, state, dueOn: dueOn || null, description: description || null }))
      .sort((a, b) => a.title.localeCompare(b.title, 'en'));
  }
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'en')));
  return { labels: sortObj(labels), milestones: sortObj(milestones) };
}

function fetchSchema() {
  const out = execFileSync(
    'gh',
    ['api', 'graphql', '-f', `query=${QUERY}`, '-f', `org=${ORG}`, '-F', `number=${NUMBER}`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const json = JSON.parse(out);
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const org = json.data && json.data.organization;
  if (!org || !org.projectV2) throw new Error(`Project ${ORG}#${NUMBER} not found`);
  assertAllComplete(org);
  org.itemSources = fetchItemSources();
  org.repoMetadata = fetchRepoMetadata(org.itemSources.repos);
  org.reference = buildReference();
  return org;
}

// Filename-safe slug: strip accents, non-alphanumerics become "-".
function slug(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const byName = (a, b) => a.name.localeCompare(b.name, 'en');
const clean = (o) => JSON.parse(JSON.stringify(o)); // drop undefined

function buildFiles(org) {
  const p = org.projectV2;
  const files = new Map();

  files.set('project.json', {
    id: p.id,
    org: ORG,
    number: p.number,
    title: p.title,
    shortDescription: p.shortDescription || null,
    public: p.public,
    closed: p.closed,
    url: p.url,
  });

  // Fields: GitHub order is kept (it is the display order in the project).
  const fields = p.fields.nodes.filter((f) => f && f.id);
  files.set(
    'fields.json',
    fields.map((f) => ({
      name: f.name,
      id: f.id,
      dataType: f.dataType,
      ...(f.options ? { optionsFile: `options/${slug(f.name)}.json` } : {}),
      ...(f.configuration ? { iterationsFile: `iterations/${slug(f.name)}.json` } : {}),
    }))
  );

  // One file per single-select field; option order is meaningful, so it is kept.
  for (const f of fields.filter((x) => x.options)) {
    files.set(`options/${slug(f.name)}.json`, {
      field: f.name,
      fieldId: f.id,
      options: f.options.map(({ id, name, color, description }) => ({
        name,
        id,
        color,
        description: description || null,
      })),
    });
  }

  for (const f of fields.filter((x) => x.configuration)) {
    files.set(`iterations/${slug(f.name)}.json`, {
      field: f.name,
      fieldId: f.id,
      ...f.configuration,
    });
  }

  files.set(
    'issue-types.json',
    org.issueTypes.nodes
      .slice()
      .sort(byName)
      .map(({ id, name, color, description, isEnabled }) => ({
        name,
        id,
        color,
        description: description || null,
        isEnabled,
      }))
  );

  const names = (conn) => conn.nodes.filter(Boolean).map((n) => n.name);
  files.set(
    'views.json',
    p.views.nodes
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((v) => ({
        number: v.number,
        name: v.name,
        id: v.id,
        layout: v.layout,
        filter: v.filter || null,
        visibleFields: names(v.configuration.visibleFields),
        groupBy: names(v.groupByFields),
        verticalGroupBy: names(v.verticalGroupByFields),
        sortBy: v.sortByFields.nodes.map((s) => ({ field: s.field.name, direction: s.direction })),
      }))
  );

  // Built-in project automations (Settings > Workflows). Useful to spot
  // overlap with the Actions in this repo.
  files.set(
    'workflows.json',
    p.workflows.nodes
      .slice()
      .sort((a, b) => a.number - b.number)
      .map(({ number, name, id, enabled }) => ({ number, name, id, enabled }))
  );

  // Org-level issue fields (distinct from project fields). May be empty.
  files.set(
    'issue-fields.json',
    org.issueFields.nodes.filter(Boolean).map(({ __typename, name, dataType, description, visibility }) => ({
      name,
      type: __typename,
      dataType,
      description: description || null,
      visibility,
    }))
  );

  files.set('labels.json', org.repoMetadata.labels);
  files.set('milestones.json', org.repoMetadata.milestones);

  const ref = org.reference;
  files.set('reference/enums.json', ref.enums);
  files.set('reference/inputs.json', ref.inputs);
  files.set('reference/mutations.json', ref.mutations);

  // "linked" = repos attached in project settings (often empty); the real
  // source of items is "withItems", derived from the items themselves.
  files.set('repos.json', {
    linked: p.repositories.nodes.map((r) => r.nameWithOwner).sort(),
    withItems: org.itemSources.repos,
    itemTypes: org.itemSources.types,
  });

  return files;
}

function main() {
  const files = buildFiles(fetchSchema());
  const drift = [];

  for (const [rel, data] of files) {
    const target = path.join(OUT_DIR, rel);
    const text = JSON.stringify(clean(data), null, 2) + '\n';
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (current === text) continue;
    drift.push(rel);
    if (!CHECK) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, text);
    }
  }

  // Remove any .json under OUT_DIR that this run did not generate (stale or stray).
  const walk = (dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
        )
      : [];
  for (const file of walk(OUT_DIR)) {
    const rel = path.relative(OUT_DIR, file).split(path.sep).join('/');
    if (!rel.endsWith('.json') || files.has(rel)) continue;
    drift.push(`${rel} (removed)`);
    if (!CHECK) fs.rmSync(file);
  }

  if (drift.length === 0) {
    console.log('project-schema: up to date');
    return;
  }
  console.log(`project-schema: ${CHECK ? 'DRIFT' : 'updated'}:\n  ${drift.join('\n  ')}`);
  if (CHECK) process.exitCode = 1;
}

main();

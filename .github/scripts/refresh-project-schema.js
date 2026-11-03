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
      nodes { id name color description isEnabled }
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
      views(first: 50) {
        nodes { id name number layout filter }
      }
      repositories(first: 100) {
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
  org.itemSources = fetchItemSources();
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

  files.set(
    'views.json',
    p.views.nodes
      .slice()
      .sort((a, b) => a.number - b.number)
      .map(({ id, name, number, layout, filter }) => ({
        number,
        name,
        id,
        layout,
        filter: filter || null,
      }))
  );

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

  // Generated sub-folders only: files for fields/iterations that no longer exist.
  for (const sub of ['options', 'iterations']) {
    const dir = path.join(OUT_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const rel = `${sub}/${name}`;
      if (!name.endsWith('.json') || files.has(rel)) continue;
      drift.push(`${rel} (removed)`);
      if (!CHECK) fs.rmSync(path.join(dir, name));
    }
  }

  if (drift.length === 0) {
    console.log('project-schema: up to date');
    return;
  }
  console.log(`project-schema: ${CHECK ? 'DRIFT' : 'updated'}:\n  ${drift.join('\n  ')}`);
  if (CHECK) process.exitCode = 1;
}

main();

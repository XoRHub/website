#!/usr/bin/env node
/**
 * Generate the CRD reference pages (docs/reference/crds/<kind>.mdx)
 * from the vendored JSON Schemas in crd-schemas/waas.xorhub.io/.
 *
 * Runs automatically before `npm start` / `npm run build` (pre-scripts
 * in package.json); the output files are gitignored. To pick up a new
 * waas release, refresh the schemas first:
 *   node scripts/sync-crd-schemas.mjs --ref vX.Y.Z
 *
 * Rendering model: one H2 section per top-level `spec` field (plus one
 * for `status` when present), each with a flat table of every nested
 * field — path, type, required, description. The JSON Schemas carry
 * per-field descriptions straight from the Go API types, used verbatim.
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const GROUP = 'waas.xorhub.io';
const API_VERSION = `${GROUP}/v1alpha1`;
const SCHEMA_DIR = join('crd-schemas', GROUP);
const OUT_DIR = join('docs', 'reference', 'crds');

const CRDS = [
  {file: 'workspace_v1alpha1.json', kind: 'Workspace', position: 2},
  {file: 'workspacetemplate_v1alpha1.json', kind: 'WorkspaceTemplate', position: 3},
  {file: 'workspacepolicy_v1alpha1.json', kind: 'WorkspacePolicy', position: 4},
  {file: 'workspaceimage_v1alpha1.json', kind: 'WorkspaceImage', position: 5},
];

const waasRef = readFileSync(join('crd-schemas', 'WAAS_REF'), 'utf8').trim();

/** Escape text for an MDX table cell (MDX parses {}, <>, and | ends the cell). */
function esc(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;')
    .replaceAll('|', '\\|')
    .replaceAll(/\r?\n+/g, ' ')
    .trim();
}

/** Escape prose blocks (outside tables): only MDX-hostile characters. */
function prose(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

/** Human-readable type of a schema node. */
function typeOf(schema) {
  if (schema['x-kubernetes-int-or-string']) return 'int-or-string';
  if (schema['x-kubernetes-preserve-unknown-fields'] && !schema.type) return 'any';
  const t = schema.type;
  if (t === 'array') {
    return `[]${typeOf(schema.items ?? {})}`;
  }
  if (t === 'object') {
    if (schema.additionalProperties && !schema.properties) {
      return `map[string]${typeOf(schema.additionalProperties)}`;
    }
    return 'object';
  }
  if (!t) return 'object';
  return schema.format ? `${t} (${schema.format})` : t;
}

/** Extra facts worth surfacing next to the description. */
function annotations(schema, required) {
  const notes = [];
  if (required) notes.push('**Required.**');
  if (schema.enum) notes.push(`Allowed values: ${schema.enum.map((v) => `\`${v}\``).join(', ')}.`);
  if (schema.default !== undefined) notes.push(`Default: \`${JSON.stringify(schema.default)}\`.`);
  if (schema.pattern) notes.push(`Pattern: \`${schema.pattern}\`.`);
  if (schema.minimum !== undefined) notes.push(`Minimum: \`${schema.minimum}\`.`);
  if (schema.maximum !== undefined) notes.push(`Maximum: \`${schema.maximum}\`.`);
  return notes;
}

/** Recursively flatten a schema subtree into table rows. */
function rows(schema, path, requiredSet, depth, out) {
  const props = schema.properties ?? {};
  for (const name of Object.keys(props)) {
    const child = props[name];
    const childPath = path ? `${path}.${name}` : name;
    const required = requiredSet.has(name);
    const notes = annotations(child, required);
    // Enum values already say everything a description would.
    const desc = [esc(child.description ?? ''), ...notes.map(esc)].filter(Boolean).join(' ');
    out.push({path: childPath, depth, type: typeOf(child), desc});
    descend(child, childPath, depth + 1, out);
  }
}

function descend(schema, path, depth, out) {
  if (schema.type === 'array' && schema.items) {
    rows(schema.items, `${path}[]`, new Set(schema.items.required ?? []), depth, out);
  } else if (schema.type === 'object' || schema.properties) {
    if (schema.properties) {
      rows(schema, path, new Set(schema.required ?? []), depth, out);
    } else if (
      schema.additionalProperties &&
      typeof schema.additionalProperties === 'object' &&
      schema.additionalProperties.properties
    ) {
      rows(
        schema.additionalProperties,
        `${path}{...}`,
        new Set(schema.additionalProperties.required ?? []),
        depth,
        out,
      );
    }
  }
}

function table(allRows) {
  const lines = ['| Field | Type | Description |', '| --- | --- | --- |'];
  for (const r of allRows) {
    // Indent nested paths with figure spaces so the hierarchy stays
    // visible without repeating the full dotted path on every row.
    const short = r.path.split('.').at(-1);
    const indent = '&numsp;'.repeat(Math.min(r.depth, 8) * 2);
    lines.push(`| <span className="crd-field-path">${indent}\`${short}\`</span> | ${r.type} | ${r.desc} |`);
  }
  return lines.join('\n');
}

function page({kind, file, position}) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  const spec = schema.properties?.spec ?? {};
  const status = schema.properties?.status;
  const specRequired = new Set(spec.required ?? []);

  let body = '';
  body += `# ${kind}\n\n`;
  body += `${prose(schema.description ?? '')}\n\n`;
  body += `| | |\n| --- | --- |\n| **apiVersion** | \`${API_VERSION}\` |\n| **kind** | \`${kind}\` |\n\n`;
  body += `## spec\n\n`;
  if (spec.description) body += `${prose(spec.description)}\n\n`;

  // One section per top-level spec field: the big passthrough subtrees
  // (workload, overrides, …) each get their own anchor and table.
  const props = spec.properties ?? {};
  const flat = [];
  const complex = [];
  for (const name of Object.keys(props)) {
    const child = props[name];
    const sub = [];
    descend(child, `spec.${name}`, 1, sub);
    if (sub.length === 0) {
      const notes = annotations(child, specRequired.has(name));
      flat.push({
        path: `spec.${name}`,
        depth: 0,
        type: typeOf(child),
        desc: [esc(child.description ?? ''), ...notes.map(esc)].filter(Boolean).join(' '),
      });
    } else {
      complex.push({name, child, sub});
    }
  }
  if (flat.length) {
    body += table(flat) + '\n\n';
  }
  for (const {name, child, sub} of complex) {
    body += `### spec.${name}\n\n`;
    if (child.description) body += `${prose(child.description)}\n\n`;
    const notes = annotations(child, specRequired.has(name));
    if (notes.length) body += notes.join(' ') + '\n\n';
    const head = [{path: `spec.${name}`, depth: 0, type: typeOf(child), desc: ''}];
    body += table(head.concat(sub)) + '\n\n';
  }

  if (status?.properties) {
    body += `## status\n\n`;
    if (status.description) body += `${prose(status.description)}\n\n`;
    const sub = [];
    rows(status, 'status', new Set(status.required ?? []), 0, sub);
    body += table(sub) + '\n\n';
  }

  const frontmatter = [
    '---',
    `title: ${kind}`,
    `description: "${kind} CRD reference (${API_VERSION}), generated from the waas JSON Schemas."`,
    `sidebar_position: ${position}`,
    '---',
    '',
    `{/* GENERATED by scripts/generate-crd-docs.mjs from crd-schemas/${GROUP}/${file}`,
    `    (waas@${waasRef}) — DO NOT EDIT. Refresh: scripts/sync-crd-schemas.mjs */}`,
    '',
    `:::info Generated reference`,
    `This page is generated at build time from the [\`crd-schemas\`](https://github.com/XoRHub/waas/tree/main/crd-schemas) JSON Schemas published by the waas repository, vendored at ref \`${waasRef}\`.`,
    `:::`,
    '',
  ].join('\n');

  return frontmatter + body;
}

mkdirSync(OUT_DIR, {recursive: true});
for (const crd of CRDS) {
  const out = join(OUT_DIR, `${crd.kind.toLowerCase()}.mdx`);
  writeFileSync(out, page(crd));
  console.log(`generated ${out}`);
}

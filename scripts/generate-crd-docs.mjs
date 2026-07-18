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
 * Rendering model: each page is ONE annotated YAML manifest. The
 * schema tree is compiled here into a JSON tree
 * (docs/reference/crds/_data/<kind>.json) that the CrdYaml React
 * component (src/components/CrdYaml) renders as YAML — every field a
 * key with its Go API doc comment as `#` lines above it, every nested
 * object a fold the reader can open or collapse. The per-field
 * descriptions are the JSON Schemas' own, verbatim (same text as
 * `kubectl explain`).
 */
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const GROUP = 'waas.xorhub.io';
const API_VERSION = `${GROUP}/v1alpha1`;
const SCHEMA_DIR = join('crd-schemas', GROUP);
const OUT_DIR = join('docs', 'reference', 'crds');
const DATA_DIR = join(OUT_DIR, '_data');

const CRDS = [
  {file: 'workspace_v1alpha1.json', kind: 'Workspace', short: 'ws', plural: 'workspaces', position: 2, openDepth: 2},
  {file: 'workspacetemplate_v1alpha1.json', kind: 'WorkspaceTemplate', short: 'wst', plural: 'workspacetemplates', position: 3, openDepth: 2},
  {file: 'workspacepolicy_v1alpha1.json', kind: 'WorkspacePolicy', short: 'wsp', plural: 'workspacepolicies', position: 4, openDepth: 99},
  {file: 'workspaceimage_v1alpha1.json', kind: 'WorkspaceImage', short: 'wsi', plural: 'workspaceimages', position: 5, openDepth: 99},
];

const waasRef = readFileSync(join('crd-schemas', 'WAAS_REF'), 'utf8').trim();

/** Escape prose blocks for MDX: only MDX-hostile characters. */
function prose(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

/** The k8s resource.Quantity pattern — too noisy to print, so it
 * becomes the <quantity> placeholder instead. */
function isQuantity(schema) {
  return (
    schema['x-kubernetes-int-or-string'] &&
    typeof schema.pattern === 'string' &&
    schema.pattern.startsWith('^(\\+|-)?')
  );
}

/** Type placeholder shown as the YAML value. */
function placeholder(schema) {
  if (schema.enum) return schema.enum.join(' | ');
  if (isQuantity(schema)) return '<quantity>';
  if (schema['x-kubernetes-int-or-string']) return '<int-or-string>';
  if (schema['x-kubernetes-preserve-unknown-fields'] && !schema.type) return '<any>';
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return '<timestamp>';
      return schema.format ? `<${schema.format}>` : '<string>';
    case 'integer':
      return `<${schema.format ?? 'integer'}>`;
    case 'number':
      return '<number>';
    case 'boolean':
      return '<boolean>';
    default:
      return '<value>';
  }
}

/** Trailing "# required · min: 0" facts on the key line. Enum values
 * live in the placeholder, the quantity pattern is dropped on purpose. */
function facts(schema, required) {
  const f = [];
  if (required) f.push('required');
  if (schema.default !== undefined) f.push(`default: ${JSON.stringify(schema.default)}`);
  if (schema.minimum !== undefined) f.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) f.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined) f.push(`minLength: ${schema.minLength}`);
  if (schema.maxLength !== undefined) f.push(`maxLength: ${schema.maxLength}`);
  if (schema.pattern && !isQuantity(schema)) f.push(`pattern: ${schema.pattern}`);
  return f.join(' · ') || null;
}

/** Number of rendered lines a fold would hide — folds with almost
 * nothing inside are plain nested keys instead. */
function weight(node) {
  if (!node.children) return 1;
  return 1 + node.children.reduce((n, c) => n + weight(c), 0);
}

const isObject = (s) =>
  s && (s.type === 'object' || s.properties) && !(s.additionalProperties && !s.properties);
const isMap = (s) => s && s.type === 'object' && s.additionalProperties && !s.properties;

/** Compile one schema node into a CrdYaml tree node. */
function build(key, schema, required) {
  const base = {
    key,
    comment: schema.description?.trim() || null,
    facts: facts(schema, required),
  };

  if (schema.type === 'array') {
    const items = schema.items ?? {};
    if (isObject(items) || isMap(items)) {
      return finishFold({
        ...base,
        kind: 'node',
        hint: '[…]',
        children: [{kind: 'item', children: fields(items)}],
      });
    }
    // Array of scalars: "key:" then a single "- <type>" line.
    return {
      ...base,
      kind: 'node',
      fold: false,
      children: [{kind: 'leaf', key: null, dash: true, value: placeholder(items)}],
    };
  }

  if (isMap(schema)) {
    const ap = schema.additionalProperties;
    if (typeof ap === 'object' && (isObject(ap) || ap.type === 'array')) {
      return finishFold({
        ...base,
        kind: 'node',
        hint: '{…}',
        children: [{kind: 'node', key: '<key>', synthetic: true, fold: false, children: fields(ap)}],
      });
    }
    // map[string]scalar
    return {
      ...base,
      kind: 'node',
      fold: false,
      children: [
        {
          kind: 'leaf',
          key: '<key>',
          synthetic: true,
          value: typeof ap === 'object' ? placeholder(ap) : '<any>',
        },
      ],
    };
  }

  if (isObject(schema)) {
    const children = fields(schema);
    if (children.length === 0) return {...base, kind: 'leaf', value: '<object>'};
    return finishFold({...base, kind: 'node', hint: '{…}', children});
  }

  const leaf = {...base, kind: 'leaf', value: placeholder(schema)};
  // Enums and defaults read as real YAML values, not placeholders.
  if (schema.enum) leaf.literal = true;
  return leaf;
}

function finishFold(node) {
  node.fold = weight(node) > 4;
  return node;
}

function fields(schema) {
  const props = schema.properties ?? {};
  const requiredSet = new Set(schema.required ?? []);
  return Object.keys(props).map((k) => build(k, props[k], requiredSet.has(k)));
}

function compile({kind, file, short}) {
  const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
  const spec = schema.properties?.spec ?? {};
  const status = schema.properties?.status;
  const data = {
    spec: {...build('spec', spec, false), fold: true, hint: '{…}'},
  };
  if (status?.properties) {
    data.status = {...build('status', status, false), fold: true, hint: '{…}'};
  }
  return {schema, data};
}

function page({kind, file, short, plural, position, openDepth}, schema, hasStatus) {
  const dataFile = `${kind.toLowerCase()}.json`;
  const lines = [
    '---',
    `title: ${kind}`,
    `description: "${kind} CRD reference (${API_VERSION}), generated from the waas JSON Schemas."`,
    `sidebar_position: ${position}`,
    '---',
    '',
    `{/* GENERATED by scripts/generate-crd-docs.mjs from crd-schemas/${GROUP}/${file}`,
    `    (waas@${waasRef}) — DO NOT EDIT. Refresh: scripts/sync-crd-schemas.mjs */}`,
    '',
    `import CrdYaml from '@site/src/components/CrdYaml';`,
    `import tree from './_data/${dataFile}';`,
    '',
    `:::info Generated reference`,
    `This page is generated at build time from the [\`crd-schemas\`](https://github.com/XoRHub/waas/tree/main/crd-schemas) JSON Schemas published by the waas repository, vendored at ref \`${waasRef}\`.`,
    `:::`,
    '',
    `# ${kind}`,
    '',
    prose(schema.description ?? ''),
    '',
    `Namespaced · \`kubectl get ${plural}\`, short name \`${short}\`.`,
    '',
    'Every field of the manifest below carries its API documentation as',
    'YAML comments — the same text `kubectl explain` shows. Click a key',
    'to fold or unfold its subtree; `# required` and defaults are noted',
    'on the field line itself.',
    '',
    '## spec',
    '',
    `<CrdYaml tree={tree.spec} header={{apiVersion: '${API_VERSION}', kind: '${kind}'}} openDepth={${openDepth}} />`,
    '',
  ];
  if (hasStatus) {
    lines.push(
      '## status',
      '',
      'Reported by the operator — read it, never write it.',
      '',
      `<CrdYaml tree={tree.status} openDepth={${openDepth}} />`,
      '',
    );
  }
  return lines.join('\n');
}

mkdirSync(DATA_DIR, {recursive: true});
for (const crd of CRDS) {
  const {schema, data} = compile(crd);
  writeFileSync(join(DATA_DIR, `${crd.kind.toLowerCase()}.json`), JSON.stringify(data, null, 1));
  const out = join(OUT_DIR, `${crd.kind.toLowerCase()}.mdx`);
  writeFileSync(out, page(crd, schema, Boolean(data.status)));
  console.log(`generated ${out}`);
}

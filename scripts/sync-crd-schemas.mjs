#!/usr/bin/env node
/**
 * Refresh the vendored CRD JSON Schemas from the XoRHub/waas repo.
 *
 * The vendored copies under crd-schemas/waas.xorhub.io/ are the single
 * input of the CRD reference pages (scripts/generate-crd-docs.mjs, run
 * automatically before every build). They are committed on purpose:
 * the site must build offline and reproducibly, so it never fetches
 * schemas at build time. This script is the explicit refresh step —
 * run it when waas publishes a new tag, review the diff, commit.
 *
 * Usage:
 *   node scripts/sync-crd-schemas.mjs --ref v0.2.0        # fetch from GitHub
 *   node scripts/sync-crd-schemas.mjs --local ../waas     # copy from a checkout
 *
 * Both modes rewrite crd-schemas/WAAS_REF with the ref they synced
 * (the git ref for --ref, the checkout's HEAD for --local).
 */
import {execFileSync} from 'node:child_process';
import {copyFileSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const GROUP = 'waas.xorhub.io';
const SCHEMAS = [
  'workspace_v1alpha1.json',
  'workspacetemplate_v1alpha1.json',
  'workspacepolicy_v1alpha1.json',
  'workspaceimage_v1alpha1.json',
];
const OUT_DIR = join('crd-schemas', GROUP);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const ref = flag('--ref');
const local = flag('--local');
if (!ref === !local) {
  console.error('Pass exactly one of --ref <git-ref> or --local <waas-checkout>');
  process.exit(1);
}

mkdirSync(OUT_DIR, {recursive: true});

let syncedRef;
if (local) {
  const src = join(local, 'crd-schemas', GROUP);
  for (const f of SCHEMAS) copyFileSync(join(src, f), join(OUT_DIR, f));
  syncedRef = execFileSync('git', ['-C', local, 'rev-parse', '--short', 'HEAD'])
    .toString()
    .trim();
} else {
  const base = `https://raw.githubusercontent.com/XoRHub/waas/${ref}/crd-schemas/${GROUP}`;
  for (const f of SCHEMAS) {
    const res = await fetch(`${base}/${f}`);
    if (!res.ok) {
      console.error(`GET ${base}/${f} -> ${res.status}`);
      process.exit(1);
    }
    // Round-trip through JSON.parse so a truncated download fails here,
    // not later at generation time.
    writeFileSync(join(OUT_DIR, f), JSON.stringify(JSON.parse(await res.text()), null, 2) + '\n');
  }
  syncedRef = ref;
}

writeFileSync(join('crd-schemas', 'WAAS_REF'), syncedRef + '\n');
const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
console.log(`Synced ${files.length} schemas from waas@${syncedRef} into ${OUT_DIR}/`);
console.log('Review the diff, then regenerate the pages: npm run gen:crd');

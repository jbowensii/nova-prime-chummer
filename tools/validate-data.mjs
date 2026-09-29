// Validates every data file against its XSD, then checks that every
// cross-reference (ref/requires/excludes/types/level/vehicle/param) resolves.
// Usage: node tools/validate-data.mjs [extra custom dirs...]  (e.g. tests/fixtures/mini/custom)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateXML } from 'xmllint-wasm';
import { JSDOM } from 'jsdom';

const DATA = 'public/data';
const SCHEMA = join(DATA, 'schema');
const schemaFor = kind => (['gear', 'weapons', 'armor', 'spells', 'complexforms'].includes(kind) ? 'items' : kind);
// private book text (not in the repo): validated too when present locally
for (const dir of ['public/custom/texts', '.extract/private/texts'])
  if (existsSync(dir)) for (const f of readdirSync(dir).filter(f => f.endsWith('.xml'))) process.argv.push('--texts=' + join(dir, f));
if (existsSync('public/custom/texts.xml')) process.argv.push('--texts=public/custom/texts.xml');
const common = { fileName: 'common.xsd', contents: readFileSync(join(SCHEMA, 'common.xsd'), 'utf8') };

// base files (public/data: sources.xml, and the owner's local core copies when present), then each custom dir the way the
// app loads it: imported/core/ (the core files), imported/sources.xml, sources.xml,
// the files in imported/index.xml, the edits layer (edits/sources.xml, edits.xml, texts.xml), then the house rules in index.xml
const files = readdirSync(DATA).filter(f => f.endsWith('.xml')).map(f => join(DATA, f));
for (const t of process.argv.filter(a => a.startsWith('--texts='))) files.push(t.slice(8));
const listed = dir => {
  const idx = join(dir, 'index.xml');
  if (!existsSync(idx)) return;
  for (const m of readFileSync(idx, 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<file\s+href="([^"]+)"/g)) files.push(join(dir, m[1]));
};
for (const dir of ['public/custom', ...process.argv.slice(2).filter(a => !a.startsWith('--'))]) {
  const core = join(dir, 'imported', 'core');
  if (existsSync(core)) for (const f of readdirSync(core).filter(f => f.endsWith('.xml'))) files.push(join(core, f));
  for (const s of [join(dir, 'imported', 'sources.xml'), join(dir, 'sources.xml')]) if (existsSync(s)) files.push(s);
  listed(join(dir, 'imported'));
  for (const e of ['sources', 'edits', 'texts']) if (existsSync(join(dir, 'edits', `${e}.xml`))) files.push(join(dir, 'edits', `${e}.xml`));
  listed(dir);
}

const errors = [];
const docs = [];
for (const file of files) {
  const xml = readFileSync(file, 'utf8');
  const kind = xml.match(/<ca2:data[^>]*\bkind="([^"]+)"/)?.[1];
  if (!kind) { errors.push(`${file}: no <ca2:data kind="..."> root`); continue; }
  const xsd = join(SCHEMA, `${schemaFor(kind)}.xsd`);
  if (!existsSync(xsd)) { errors.push(`${file}: unknown kind "${kind}"`); continue; }
  const res = await validateXML({
    xml: { fileName: file, contents: xml },
    schema: { fileName: `${schemaFor(kind)}.xsd`, contents: readFileSync(xsd, 'utf8') },
    preload: [common],
  });
  for (const e of res.errors) errors.push(`${file}:${e.loc?.lineNumber ?? '?'} ${e.message}`);
  docs.push({ file, kind, doc: new JSDOM(xml, { contentType: 'text/xml' }).window.document });
}

// the GM's table rules and the campaigns (custom/table-rules.xml, campaigns.xml, written by the server): their own schemas
for (const dir of process.argv.slice(2).filter(a => !a.startsWith('--')))
  for (const [name, xsd] of [['table-rules.xml', 'tablerules.xsd'], ['campaigns.xml', 'campaigns.xsd']]) {
    const file = join(dir, name);
    if (!existsSync(file)) continue;
    const res = await validateXML({ xml: { fileName: file, contents: readFileSync(file, 'utf8') },
      schema: { fileName: xsd, contents: readFileSync(join(SCHEMA, xsd), 'utf8') } });
    for (const e of res.errors) errors.push(`${file}:${e.loc?.lineNumber ?? '?'} ${e.message}`);
  }

// the example sets (custom/samples/<set>/, managed on disk by the admin): set.xml and each character file
for (const dir of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
  const root = join(dir, 'samples');
  if (!existsSync(root)) continue;
  for (const set of readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory() && !d.name.startsWith('.')))
    for (const f of readdirSync(join(root, set.name)).filter(f => f.endsWith('.xml'))) {
      const file = join(root, set.name, f), xsd = f === 'set.xml' ? 'sampleset.xsd' : 'character.xsd';
      const res = await validateXML({ xml: { fileName: file, contents: readFileSync(file, 'utf8') },
        schema: { fileName: xsd, contents: readFileSync(join(SCHEMA, xsd), 'utf8') } });
      for (const e of res.errors) errors.push(`${file}:${e.loc?.lineNumber ?? '?'} ${e.message}`);
    }
}

// ---- reference integrity ----
const ids = {};
for (const { file, kind, doc } of docs) {
  const set = (ids[kind] ??= new Set());
  for (const el of doc.documentElement.children) {
    if (el.tagName === 'remove') { set.delete(el.getAttribute('id')); continue; }
    const id = el.getAttribute('id');
    if (set.has(id) && !file.startsWith('public/custom') && file.startsWith(DATA)) errors.push(`${file}: duplicate id "${id}"`);
    set.add(id);
  }
}
const specIds = new Set();
for (const { kind, doc } of docs) if (kind === 'skills') for (const s of doc.querySelectorAll('spec')) specIds.add(s.getAttribute('id'));
const has = (kind, id) => ids[kind]?.has(id);
const need = (file, ok, what) => { if (!ok) errors.push(`${file}: unresolved ${what}`); };

// an edits file (kind="edits") holds amps, items and rules: each is checked as its own kind
const EDIT_KINDS = { amp: 'amps', item: 'gear', rule: 'rules' };
for (const { file, kind: fileKind, doc } of docs) {
  for (const el of doc.documentElement.children) {
    const kind = fileKind === 'edits' ? EDIT_KINDS[el.tagName] : fileKind;
    const a = n => el.getAttribute(n);
    const id = a('id');
    // every citation names a source listed in sources.xml (specs may cite their own)
    for (const x of [el, ...el.querySelectorAll('spec[source]')])
      if (x.getAttribute('source') && kind !== 'sources') need(file, has('sources', x.getAttribute('source')), `source="${x.getAttribute('source')}" on ${x.getAttribute('id')}`);
    if (kind === 'rules') for (const e of (a('effects') ?? '').split(/\s+/).filter(Boolean)) need(file, has('ampeffects', e), `effects "${e}" on ${id}`);
    if (kind === 'amptypes' && a('requires')) need(file, has('ampeffects', a('requires')), `requires="${a('requires')}" on ${id}`);
    if (kind === 'ampeffects') {
      for (const n of ['requires', 'excludes']) if (a(n)) need(file, has('ampeffects', a(n)), `${n}="${a(n)}" on ${id}`);
      for (const t of (a('types') ?? '').split(/\s+/).filter(Boolean)) need(file, has('amptypes', t), `type "${t}" on ${id}`);
    }
    if (kind === 'packages') need(file, has('levels', a('level')), `level="${a('level')}" on ${id}`);
    if (kind === 'amps') {
      need(file, has('amptypes', a('type')), `type="${a('type')}" on ${id}`);
      if (a('vehicle')) need(file, has('vehicles', a('vehicle')), `vehicle="${a('vehicle')}" on ${id}`);
      for (const e of el.querySelectorAll('effect')) {
        const ref = e.getAttribute('ref'), param = e.getAttribute('param');
        need(file, has('ampeffects', ref), `effect ref="${ref}" on ${id}`);
        if (param == null) continue; // open pick: the player chooses in the Amp Builder
        if (ref === 'rr-skill') need(file, has('skills', param), `rr-skill param="${param}" on ${id}`);
        if (ref === 'rr-spec') need(file, specIds.has(param) || param.startsWith('custom:'), `rr-spec param="${param}" on ${id}`);
        if (ref === 'rr-attr') need(file, has('attributes', param), `rr-attr param="${param}" on ${id}`);
      }
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\nFAILED: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`OK ${docs.length} files`);

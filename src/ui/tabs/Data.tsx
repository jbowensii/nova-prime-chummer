// Game data (everyone), in the layout both games share (src/ui/GameData.tsx): the catalog browser by kind with the book a
// filter (CatalogBrowser), the sources, the Foundry export, the catalog edits, the files that didn't load and those that did.
import type { Catalog, Item, ItemKind, Ref } from '../../model/types'
import { canEdit, useMe } from '../auth'
import { fmt, NonCanon } from '../bits'
import { formulaText, itemPrice, levelLabel, type Formula } from '../../engine'
import type { BrowseKind, BrowseRow } from '../CatalogBrowser'
import { GameDataPage } from '../GameData'
import { EditButton, EditedMark, editState, useOpenEdit, type EditKind } from '../EditEntry'
import { SourceLabel } from '../SourceLabel'
import { ExportBooksPanel } from '../Foundry'
import { OverrideFiles, type OverrideGame } from '../OverrideFiles'
import { entryXml } from '../../engine'

const KINDS: [EditKind, string][] = [['amps', 'Amp'], ['items', 'Item'], ['rules', 'Rule']]

/** entries per source across the catalog (amps, items, skills, their own-cited specs, rules) */
function counts(c: Catalog) {
  const n = new Map<string, number>()
  const add = (s: string | undefined) => { if (s) n.set(s, (n.get(s) ?? 0) + 1) }
  for (const m of [c.amps, c.items, c.skills, c.rules] as Map<string, { source: string }>[]) for (const e of m.values()) add(e.source)
  for (const sk of c.skills.values()) for (const sp of sk.specs) add(sp.source)
  return n
}

const ITEM_KINDS: [ItemKind, string][] = [['weapon', 'Weapons'], ['armor', 'Armor'], ['gear', 'Gear'], ['spell', 'Spells'], ['complex-form', 'Complex forms']]
const vals = (xs: [string, unknown][]) => xs.filter(([, v]) => v != null && v !== '' && v !== false).map(([k, v]) => v === true ? k : `${k} ${v}`).join(' · ')

/** Every browsable kind of the catalog, each entry with its sub-category (amps by type, weapons by category…) and values. */
export function browseKinds(c: Catalog): BrowseKind[] {
  const row = (e: Ref & { name: string }, more: Partial<BrowseRow>): BrowseRow => ({ key: e.id, name: e.name, source: e.source, page: e.page, ...more })
  const edited = (e: { edited?: boolean }) => e.edited ? <EditedMark /> : undefined
  // a formula with its value (the standard price is B for an item's cost; Anarchy items have no ratings)
  const formulas = (e: { formulas?: Formula[] }, i?: Item) => (e.formulas ?? []).map(f => {
    const v = f.field === 'cost' && i ? itemPrice(c.pricing, { uid: '', kind: i.kind, name: i.name, specialist: i.specialist, armor: i.armor }, i) : undefined
    return `${f.field} = ${formulaText(f, v?.base.toLocaleString('en-US'))}${v ? ` (${v.error ? 'unpriced' : fmt(v.n)})` : ''}`
  }).join(' · ')
  const item = (i: Item): BrowseRow => row(i, { group: i.category, text: i.text, marks: edited(i), action: <EditButton kind="items" id={i.id} name={i.name} />,
    issues: i.issues, details: [vals([['specialist', i.specialist], ['armor', i.armor], ['dv', i.dv], ['ranges', i.ranges]]), formulas(i, i)].filter(Boolean).join(' · ') })
  const items = [...c.items.values()]
  return [
    { id: 'amps', label: 'Amps', rows: [...c.amps.values()].map(a => row(a, { group: c.ampTypes.get(a.type)?.name ?? a.type, text: a.narrative,
      marks: edited(a), action: <EditButton kind="amps" id={a.id} name={a.name} />, issues: a.issues,
      details: [levelLabel(c, a), vals([['rating', a.printedRating], ['effects', a.effects.map(x => c.ampEffects.get(x.ref)?.name ?? x.ref).join(', ')]]), formulas(a)].filter(Boolean).join(' · ') })) },
    { id: 'ampeffects', label: 'Amp effects', rows: [...c.ampEffects.values()].map(e => row(e, { group: e.category,
      details: vals([['rating', e.rating], ['for', e.types.join(', ')], ['max', e.max]]) })) },
    ...ITEM_KINDS.map(([k, label]) => ({ id: k, label, rows: items.filter(i => i.kind === k).map(item) })),
    { id: 'skills', label: 'Skills', rows: [...c.skills.values()].map(sk => row(sk, { group: c.attributes.get(sk.attr)?.name,
      details: vals([['specializations', sk.specs.map(x => x.name).join(', ')]]) })) },
    { id: 'metatypes', label: 'Metatypes', rows: [...c.metatypes.values()].map(m => row(m, { details: vals([['edge', m.edge]]) })) },
    { id: 'vehicles', label: 'Vehicles', rows: [...c.vehicles.values()].map(v => row(v, {
      details: vals([['handling', v.handling], ['speed', v.speed], ['body', v.body], ['armor', v.armor], ['pilot', v.pilot]]) })) },
    { id: 'packages', label: 'Packages', rows: [...c.packages.values()].map(k => row(k, { group: c.levels.get(k.level)?.name ?? k.level, details: k.archetype })) },
    { id: 'lifestyles', label: 'Lifestyles', rows: [...c.lifestyles.values()].map(l => row(l, { text: l.text, details: vals([['per run', l.perRun]]) })) },
    { id: 'rules', label: 'Rules', rows: [...c.rules.values()].map(r => row({ ...r, name: r.title }, { group: r.sheet, text: r.text, details: r.section,
      marks: edited(r), action: <EditButton kind="rules" id={r.id} name={r.title} /> })) },
  ]
}

/** Anarchy's edits layer as an override file (OverrideFiles): amps, items and rules; formulas and issues stay the book's. */
const overrides = (c: Catalog, books: { id: string; name: string }[]): OverrideGame => ({
  dir: 'custom/edits/', api: 'edits', ns: 'urn:chummer-anarchy2:data:1', prefix: 'ca2', file: 'chummer-edits', books,
  tags: { amp: 'amps', item: 'items', rule: 'rules' }, descTag: t => (t === 'amp' ? 'narrative' : 'text'), strip: ['issue', 'formula'],
  current: (kind, id) => {
    const e = KINDS.some(([k]) => k === kind) ? c[kind as EditKind].get(id) : undefined
    return e && { xml: entryXml(kind as EditKind, e), edited: !!e.edited, text: 'narrative' in e ? e.narrative : e.text }
  },
})

export function DataScreen({ c, reload }: { c: Catalog; reload: () => Promise<void> }) {
  const count = counts(c)
  const kinds = browseKinds(c), used = new Set(kinds.flatMap(k => k.rows.map(r => r.source)))
  const books = [...c.sources.values()].filter(s => used.has(s.id)).map(s => ({ id: s.id, name: s.name }))
  const openEdit = useOpenEdit()
  const me = useMe()
  const edits = KINDS.flatMap(([kind, label]) => [...(c[kind] as Map<string, { id: string; source: string; page: number; edited?: boolean; name?: string; title?: string }>).values()]
    .filter(e => e.edited).map(e => ({ kind, label, e, name: e.name ?? e.title ?? e.id, state: editState(c, kind, e as never) })))
  return (
    <GameDataPage game="ca2" kinds={kinds} books={books}
      sourcesIntro={<>
        <p>All rules and catalog data load from XML files next to this page. House rules and extra content go in the <code>custom/</code> folder
          (on Unraid: <code>/mnt/user/appdata/chummer-anarchy2/custom</code>), listed in <code>custom/index.xml</code>. Same id replaces a book entry,
          <code> &lt;remove id="…"/&gt;</code> deletes one, a new id adds one. Reload the page after changing them.</p>
        <p>Canon is the game’s official rules. Other published material is marked <NonCanon /> wherever it appears; the GM can flag it
          at their table (Table setup page). Descriptions are private: one file per source in <code>custom/texts/</code>, never part of the app itself.</p>
      </>}
      sources={[...c.sources.values()].map(s => ({ id: s.id, name: s.name, publisher: s.publisher, status: s.canon ? 'Canon' : <NonCanon />,
        entries: count.get(s.id) ?? 0, file: s.file, sha256: s.sha256, hash: s.sha256?.split(' ').map(h => `${h.slice(0, 12)}…`).join(' '),
        texts: !s.texts ? <span className="muted">none</span> : c.files.some(f => f.file === `custom/${s.texts}`) ? 'installed' : <span className="muted">not installed</span> }))}
      foundry={canEdit(me) && <ExportBooksPanel c={c} />}
      edits={openEdit ? { rows: edits.map(({ kind, label, e, name, state }) => ({ key: `${kind} ${e.id}`, name, kind: label, state,
        source: <SourceLabel c={c} source={e.source} page={e.page} id={e.id} />, action: <EditButton kind={kind} id={e.id} name={name} /> })),
        intro: <>
          <p>Fix a book entry with its Edit button (amp and gear pickers, the Rules reference), or add your own under a house-rule source.
            Edits are kept apart from the imported books, so a re-import never touches them; Restore book version drops one.</p>
          <div className="row" style={{ marginBottom: '0.6rem' }}>
            <button className="btn small" onClick={() => openEdit({ kind: 'amps' })}>Add an amp</button>
            <button className="btn small" onClick={() => openEdit({ kind: 'items' })}>Add an item</button>
            <button className="btn small" onClick={() => openEdit({ kind: 'rules' })}>Add a rule</button>
          </div>
          <OverrideFiles g={overrides(c, books)} reload={reload} />
        </> } : undefined}
      errors={c.errors}
      docs={<>The file format and schemas are documented in <code>docs/data-format.md</code> and <code>data/schema/</code>.</>}>
      <h2 style={{ marginTop: '1.5rem' }}>Loaded files</h2>
      <div className="scroll-x"><table className="data"><thead><tr><th>File</th><th>Kind</th><th className="num">Entries</th><th>From</th></tr></thead>
        <tbody>{c.files.map(f => <tr key={f.file}><td>{f.file}</td><td>{f.kind}</td><td className="num">{f.entries}</td><td>{f.overlay ? 'custom overlay' : 'base data'}</td></tr>)}</tbody></table></div>
    </GameDataPage>
  )
}

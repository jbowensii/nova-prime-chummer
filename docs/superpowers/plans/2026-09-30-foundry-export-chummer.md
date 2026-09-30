# Foundry export (Chummer 0.6.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chummer downloads runners and book data as "Chummer Anarchy export v1" JSON for the Foundry importer module.

**Architecture:** A pure engine module `src/engine/export.ts` turns a runner (its current build and the engine's own
numbers) and the catalog's books into plain objects; a JSON Schema and a format document define the file; the UI adds
three download points (runner editor, runner list dialog, Game data for GMs). No server change.

**Tech Stack:** TypeScript, React 19, Vitest, Playwright, ajv (new dev dependency, schema checks only).

**Spec:** `docs/superpowers/specs/2026-09-30-foundry-export-design.md` (§2, §3, §5, §6). This is plan 1 of 3; the
module plans (runners 0.1.0, book data 0.2.0) are written after this ships, against the published format.

## Global Constraints

- File: one JSON document, UTF-8, `{ format: "chummer-anarchy2-export", version: 1, kind: "runners" | "books", exportedAt, app: { name: "Chummer Anarchy 2.0", version }, descriptions, runners | books + tableRules }`.
- File names: `runners-YYYY-MM-DD.ca2foundry.json`, `books-YYYY-MM-DD.ca2foundry.json`.
- Never in a file: passwords, sessions, keys, owner usernames, other users' data beyond the runners exported, PDFs.
- A runner is exported from `currentBuild(ch)` (via `derive(c, ch).build`), never `ch.build` directly.
- Book descriptions only when `descriptions` is true: amp `narrative`, item `text`, rule `text`. The UI default is on, with the note "For your own Foundry only. Don't share this file."
- Book-data export: admin and editors only (UI). Runners: whatever `repo.listAll()` already returns to the user.
- Ranges in the file: `"ok" | "disadvantage" | "none"` for melee, short, medium, long.
- Vehicle weapons aren't separate items in Chummer: a vehicle carries its `mount` text (spec §2.1).
- Repo rules: work on branch `feat/0.6.0` (made from `spec/foundry-export`, which holds the spec and this plan); never touch `public/data/*.xml`, `public/custom/`, `custom/`, `library/`; no book text in tests (only `tests/fixtures/mini`, which is made up).

---

### Task 1: Runner export (engine)

**Files:**
- Create: `src/engine/export.ts`
- Modify: `src/engine/index.ts` (add `export * from './export'`)
- Test: `tests/engine/export.test.ts`

**Interfaces:**
- Consumes: `derive`, `ampRating`, `ampCtx`, `ampEssence`, `balance`, `price`, `activeEvents`, `changeText`, `itemCost`, `isCanonSource`, `DEVICE_TYPES` (all in `src/engine`).
- Produces:
  - `EXPORT_FORMAT = 'chummer-anarchy2-export'`, `EXPORT_VERSION = 1`
  - types `ExportFile`, `ExportRunner`, `ExportAmp`, `ExportItem`, `ExportEffect`, `ExportRR`, `ExportBonuses`, `Range`
  - `exportRunner(c: Catalog, ch: Character, opts: ExportOpts): ExportRunner`
  - `exportRunners(c: Catalog, chs: Character[], opts: ExportOpts): ExportFile`
  - `type ExportOpts = { descriptions: boolean; now: string; appVersion: string }`
  - `parseRanges(s?: string): { melee: Range; short: Range; medium: Range; long: Range }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/engine/export.test.ts
// Chummer Anarchy export v1: runners as the engine sees them (made-up books in tests/fixtures/mini).
import { describe, expect, test } from 'vitest'
import { derive } from '../../src/engine/derive'
import { exportRunners, parseRanges } from '../../src/engine/export'
import { finalize } from '../../src/engine/career'
import { blankCharacter } from '../../src/engine/file'
import type { Character } from '../../src/model/types'
import { cat } from '../helpers'

const OPTS = { descriptions: true, now: '2026-10-02T09:15:00.000Z', appVersion: '0.6.0' }
const rush = (): Character => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Test Runner'
  ch.build.amps = [{ uid: 'a', catalogId: 'testc.rush', type: 'equipment', name: 'Rush', narrative: 'Made-up text.',
    effects: cat.amps.get('testc.rush')!.effects, linkedItem: 'i' }]
  ch.build.items = [{ uid: 'i', kind: 'gear', name: 'Rush' }]
  return ch
}

describe('export: runners', () => {
  test('the envelope', () => {
    const f = exportRunners(cat, [rush()], OPTS)
    expect(f).toMatchObject({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners', exportedAt: OPTS.now,
      app: { name: 'Chummer Anarchy 2.0', version: '0.6.0' }, descriptions: true })
    expect(f.runners).toHaveLength(1)
    expect(f.books).toBeUndefined()
  })
  test('numbers are the engine’s own', () => {
    const ch = rush(), d = derive(cat, ch), r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.streetName).toBe('Test Runner')
    expect(r.essence).toBe(d.essence)
    expect(r.monitor).toEqual(d.monitor)
    expect(r.attributes).toEqual(d.build.attributes)
    expect(r.amps[0]).toMatchObject({ uid: 'a', catalogId: 'testc.rush', source: 'TESTC', canon: true, name: 'Rush' })
    expect(r.amps[0].effects.every(e => typeof e.name === 'string' && e.name.length > 0)).toBe(true)
  })
  test('descriptions only when asked', () => {
    expect(exportRunners(cat, [rush()], OPTS).runners![0].amps[0].description).toBe('Made-up text.')
    expect(exportRunners(cat, [rush()], { ...OPTS, descriptions: false }).runners![0].amps[0].description).toBeUndefined()
  })
  test('a finalized runner exports its current build, not its baseline', () => {
    let ch = rush()
    ch = finalize(cat, ch)
    ch.career.push({ id: 'e1', at: OPTS.now, type: 'earn', amount: 5000, run: 'Made-up run', date: '2026-10-01' })
    const r = exportRunners(cat, [ch], OPTS).runners![0]
    expect(r.finalized).toBe(true)
    expect(r.nuyen.balance).toBeGreaterThanOrEqual(5000)
    expect(r.ledger.some(l => l.type === 'earn' && l.amount === 5000)).toBe(true)
  })
  test('ranges become ok / disadvantage / none', () => {
    expect(parseRanges('OK/OK/Dis./–')).toEqual({ melee: 'ok', short: 'ok', medium: 'disadvantage', long: 'none' })
    expect(parseRanges('')).toEqual({ melee: 'none', short: 'none', medium: 'none', long: 'none' })
  })
  test('nothing about the account', () => {
    const json = JSON.stringify(exportRunners(cat, [{ ...rush(), campaign: 'c1' }], OPTS))
    expect(json).not.toMatch(/"owner"|"campaign"|password|session/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/engine/export.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/engine/export"

- [ ] **Step 3: Write the implementation**

```ts
// src/engine/export.ts
// Chummer Anarchy export v1 (docs/export-format.md; schema public/data/schema/export.schema.json): runners and book
// data as JSON for other tools, first the Foundry importer module (jbowensii/chummer-anarchy2-foundry). Every number is
// the engine's own (derive, ampRating, balance), from the runner's current build. Pure: no DOM.
import type { AmpEntry, AttrId, Catalog, Character, EffectPick, ItemEntry } from '../model/types'
import { ampCtx, ampEssence, ampRating } from './amps'
import { isCanonSource } from './canon'
import { activeEvents, balance, changeText } from './career'
import { DEVICE_TYPES, derive } from './derive'
import { itemCost, price } from './price'

export const EXPORT_FORMAT = 'chummer-anarchy2-export', EXPORT_VERSION = 1
export type Range = 'ok' | 'disadvantage' | 'none'
export interface ExportOpts { descriptions: boolean; now: string; appVersion: string }
export interface ExportEffect { id: string; name: string; category: string; param?: string; value?: string; note?: string }
export interface ExportRR { on: 'attribute' | 'skill' | 'spec'; id: string; name: string; value: number }
export interface ExportBonuses { light: number; serious: number; physicalThreshold: number; mentalThreshold: number;
  matrixThreshold: number; armor: number; anarchy: number; initiative: number }
export interface ExportAmp { uid: string; catalogId?: string; source?: string; page?: number; canon: boolean; type: string;
  typeName: string; name: string; rating: number; essence: number; effects: ExportEffect[]; rr: ExportRR[];
  bonuses: ExportBonuses; item?: string; vehicle?: string; description?: string }
export interface ExportItem { uid: string; catalogId?: string; kind: string; name: string; source?: string; page?: number;
  canon: boolean; price: number; starting?: string; note?: string; description?: string
  weapon?: { dv: string; dvText: string; ranges: Record<'melee' | 'short' | 'medium' | 'long', Range>; specialist: boolean; ammo: string[] }
  armor?: { value: number; over?: string } }
export interface ExportRunner {
  id: string; updatedAt: string; exportedAt: string; streetName: string; realName: string; finalized: boolean
  metatype: { id: string; name: string; ranges: Record<AttrId, [number, number]>; edge: number }
  level: { id: string; name: string }; lifestyle: { id: string; name: string; perRun: number }
  portrait: string | null; attributes: Record<AttrId, number>; edge: number; essence: number
  skills: { id: string; name: string; attr: string; rating: number; specs: { id: string; name: string; attr: string; custom: boolean }[] }[]
  knowledge: { name: string; kind: string; native: boolean }[]
  amps: ExportAmp[]; items: ExportItem[]
  vehicles: { uid: string; name: string; chassis: string; pilot: number; body: number; handling: number; speed: number;
    armor: number; mount: string; flying: boolean; thresholds: number[]; monitor: { light: number; serious: number } }[]
  monitor: { light: number; serious: number; incap: number }
  thresholds: Record<string, number[]>; armor: { main: number; alt: number }
  initiative: { level: number; realm?: string; source: string } | null
  pools: { skill: string; spec?: string; label: string; attr: string; dp: number; rr: number }[]
  narrative: { keywords: string[]; dispositions: string[]; cues: string[] }; background: string; notes: string
  nuyen: { balance: number }; ledger: { at: string; type: string; summary: string; amount: number }[]
}
export interface ExportFile { format: typeof EXPORT_FORMAT; version: typeof EXPORT_VERSION; kind: 'runners' | 'books'
  exportedAt: string; app: { name: string; version: string }; descriptions: boolean
  runners?: ExportRunner[]; books?: ExportBook[]; tableRules?: { name: string; text: string }[] }
// ExportBook: Task 2
export interface ExportBook { source: { id: string; name: string; publisher: string; canon: boolean } }

const RANGE = (s = ''): Range => (/^ok/i.test(s.trim()) ? 'ok' : /^dis/i.test(s.trim()) ? 'disadvantage' : 'none')
/** "OK/OK/Dis./–" (melee/short/medium/long) as the file writes ranges. */
export function parseRanges(s?: string) {
  const [melee, short, medium, long] = (s ?? '').split('/')
  return { melee: RANGE(melee), short: RANGE(short), medium: RANGE(medium), long: RANGE(long) }
}

const count = (effects: EffectPick[], ref: string) => effects.filter(e => e.ref === ref).length
function specName(c: Catalog, id: string) {
  for (const sk of c.skills.values()) { const s = sk.specs.find(x => x.id === id); if (s) return s.name }
  return id.replace(/^custom:/, '')
}
/** An amp's effects by name, its Risk Reduction lines and its fixed bonuses. */
export function ampParts(c: Catalog, type: string, effects: EffectPick[]) {
  const eff: ExportEffect[] = effects.map(e => {
    const a = c.ampEffects.get(e.ref)
    return { id: e.ref, name: a?.name ?? e.ref, category: a?.category ?? '', ...e.param ? { param: e.param } : {},
      ...e.value ? { value: e.value } : {}, ...e.note ? { note: e.note } : {} }
  })
  const rr = new Map<string, ExportRR>()
  for (const e of effects) {
    const on = e.ref === 'rr-attr' ? 'attribute' : e.ref === 'rr-skill' ? 'skill' : e.ref === 'rr-spec' ? 'spec' : null
    if (!on || !e.param) continue
    const name = on === 'attribute' ? c.attributes.get(e.param)?.name ?? e.param : on === 'skill' ? c.skills.get(e.param)?.name ?? e.param : specName(c, e.param)
    const k = `${on}|${e.param}`
    rr.set(k, { on, id: e.param, name, value: (rr.get(k)?.value ?? 0) + 1 })
  }
  const device = DEVICE_TYPES.includes(type) // a deck's or vehicle's boxes are its own (CRB p.62)
  const init = count(effects, 'init-3') ? 3 : count(effects, 'init-2') ? 2 : count(effects, 'init-1') ? 1 : 0
  const bonuses: ExportBonuses = { light: device ? 0 : Math.min(1, count(effects, 'wound-light')),
    serious: device ? 0 : Math.min(1, count(effects, 'wound-serious')), physicalThreshold: 0,
    mentalThreshold: count(effects, 'mental-armor'), matrixThreshold: count(effects, 'firewall-plus'),
    armor: count(effects, 'armor-plus'), anarchy: 0, initiative: init }
  return { effects: eff, rr: [...rr.values()], bonuses }
}

function exportAmp(c: Catalog, b: Character['build'], a: AmpEntry, o: ExportOpts): ExportAmp {
  const t = a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : a.snapshot
  return { uid: a.uid, ...a.catalogId ? { catalogId: a.catalogId } : {}, ...t ? { source: t.source, page: t.page } : {},
    canon: isCanonSource(c, t?.source), type: a.type, typeName: c.ampTypes.get(a.type)?.name ?? a.type, name: a.name,
    rating: ampRating(c, a, ampCtx(b, a, c)), essence: ampEssence(c, a), ...ampParts(c, a.type, a.effects),
    ...a.linkedItem ? { item: a.linkedItem } : {}, ...a.vehicle ? { vehicle: a.vehicle } : {},
    ...o.descriptions && a.narrative ? { description: a.narrative } : {} }
}

function exportItem(c: Catalog, it: ItemEntry, dv: Map<string, { dv: string; ammo: string[] }>, o: ExportOpts): ExportItem {
  const cat = it.catalogId ? c.items.get(it.catalogId) ?? it.snapshot : it.snapshot
  const text = cat?.text
  return { uid: it.uid, ...it.catalogId ? { catalogId: it.catalogId } : {}, kind: it.kind, name: it.name,
    ...cat ? { source: cat.source, page: cat.page } : {}, canon: isCanonSource(c, cat?.source), price: itemCost(c.pricing, it),
    ...it.starting ? { starting: it.starting } : {}, ...it.note ? { note: it.note } : {},
    ...it.kind === 'weapon' ? { weapon: { dv: dv.get(it.uid)?.dv ?? it.dv ?? cat?.dv ?? '', dvText: it.dv ?? cat?.dv ?? '',
      ranges: parseRanges(it.ranges ?? cat?.ranges), specialist: !!(it.specialist ?? cat?.specialist), ammo: dv.get(it.uid)?.ammo ?? [] } } : {},
    ...it.kind === 'armor' ? { armor: { value: it.armor ?? cat?.armor ?? 0, ...it.over ? { over: it.over } : {} } } : {},
    ...o.descriptions && text ? { description: text } : {} }
}

const ledgerLine = (e: ReturnType<typeof activeEvents>[number]) => ({ at: e.at, type: e.type,
  summary: e.type === 'earn' ? e.run : e.type === 'note' ? e.text : e.type === 'change' ? e.changes.map(changeText).join('; ') : e.type,
  amount: e.type === 'earn' ? e.amount : 'cost' in e && typeof e.cost === 'number' ? -e.cost : 0 })

export function exportRunner(c: Catalog, ch: Character, o: ExportOpts): ExportRunner {
  const d = derive(c, ch), b = d.build, meta = c.metatypes.get(ch.identity.metatype), life = c.lifestyles.get(ch.identity.lifestyle ?? 'low')
  const dv = new Map(d.weapons.map(w => [w.uid, { dv: w.dv, ammo: w.ammo ?? [] }]))
  return {
    id: ch.id, updatedAt: ch.updatedAt, exportedAt: o.now, streetName: ch.identity.streetName, realName: ch.identity.name,
    finalized: !!ch.finalizedAt,
    metatype: { id: ch.identity.metatype, name: meta?.name ?? ch.identity.metatype, ranges: meta?.ranges ?? {} as never, edge: d.edge },
    level: { id: ch.level, name: c.levels.get(ch.level)?.name ?? ch.level },
    lifestyle: { id: ch.identity.lifestyle ?? 'low', name: life?.name ?? '', perRun: life?.perRun ?? 0 },
    portrait: ch.identity.portrait ?? null, attributes: b.attributes, edge: d.edge, essence: d.essence,
    skills: b.skills.map(s => { const sk = c.skills.get(s.id)
      return { id: s.id, name: sk?.name ?? s.id, attr: sk?.attr ?? '', rating: s.rating,
        specs: s.specs.map(id => { const sp = sk?.specs.find(x => x.id === id)
          return { id, name: sp?.name ?? id.replace(/^custom:/, ''), attr: sp?.attr ?? sk?.attr ?? '', custom: id.startsWith('custom:') } }) } }),
    knowledge: d.knowledge.map(k => ({ name: k.name, kind: k.kind, native: !!k.native })),
    amps: b.amps.map(a => exportAmp(c, b, a, o)),
    items: b.items.map(it => exportItem(c, it, dv, o)),
    vehicles: d.vehicles.map(v => ({ uid: v.uid, name: v.name, chassis: v.chassis, pilot: v.pilot, body: v.body, handling: v.handling,
      speed: v.speed, armor: v.armor, mount: v.mount, flying: v.flying, thresholds: v.thresholds, monitor: v.monitor })),
    monitor: d.monitor, thresholds: { ...d.thresholds } as Record<string, number[]>, armor: { main: d.armor.main, alt: d.armor.alt },
    initiative: d.initiative ?? null,
    pools: d.pools.map(p => ({ skill: p.skill, ...p.spec ? { spec: p.spec } : {}, label: p.label, attr: p.attr, dp: p.dp, rr: p.rr })),
    narrative: { keywords: ch.narrative.keywords, dispositions: ch.narrative.dispositions, cues: ch.narrative.cues },
    background: ch.identity.background, notes: ch.identity.notes,
    nuyen: { balance: ch.finalizedAt ? balance(c, ch) : price(c, ch).remaining },
    ledger: activeEvents(ch).map(ledgerLine),
  }
}

const envelope = (kind: ExportFile['kind'], o: ExportOpts): ExportFile =>
  ({ format: EXPORT_FORMAT, version: EXPORT_VERSION, kind, exportedAt: o.now, app: { name: 'Chummer Anarchy 2.0', version: o.appVersion }, descriptions: o.descriptions })

export const exportRunners = (c: Catalog, chs: Character[], o: ExportOpts): ExportFile =>
  ({ ...envelope('runners', o), runners: chs.map(ch => exportRunner(c, ch, o)) })
```

Then add to `src/engine/index.ts`: `export * from './export'`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/engine/export.test.ts && npx tsc -b`
Expected: 6 passed, no type errors. If `activeEvents` event types don't narrow (`e.run`, `e.text`, `e.changes`), cast per branch the way `career.ts` does; don't widen the types.

- [ ] **Step 5: Commit**

```bash
git add src/engine/export.ts src/engine/index.ts tests/engine/export.test.ts
git commit -m "export: runners as Chummer Anarchy export v1 (engine)"
```

---

### Task 2: Book-data export (engine)

**Files:**
- Modify: `src/engine/export.ts` (replace the placeholder `ExportBook`, add `exportBooks`)
- Test: `tests/engine/export.test.ts` (add a `describe`)

**Interfaces:**
- Consumes: Task 1's `ampParts`, `parseRanges`, `envelope`, `ExportOpts`; `ampFromTemplate`, `ampRating` from `./amps`.
- Produces: `exportBooks(c: Catalog, sources: string[], tableRules: { name: string; text: string }[], o: ExportOpts): ExportFile`; `ExportBook`:
  `{ source: {id,name,publisher,canon}, amps: BookAmp[], items: BookItem[], vehicles: VehicleBase-like[], skills: {id,name,attr,alt?,specs[]}[], specs: {skill,id,name,attr}[], rules: {id,sheet,section,title,page,text?}[] }`

- [ ] **Step 1: Write the failing test** (append to `tests/engine/export.test.ts`)

```ts
import { exportBooks } from '../../src/engine/export'

describe('export: books', () => {
  test('only the ticked books, each entry cited, canon flagged', () => {
    const f = exportBooks(cat, ['TEST', 'TESTC'], [], OPTS)
    expect(f.kind).toBe('books')
    expect(f.books!.map(b => b.source.id)).toEqual(['TEST', 'TESTC'])
    const test = f.books![0], testc = f.books![1]
    expect(test.source.canon).toBe(false)
    expect(testc.source.canon).toBe(true)
    expect(test.amps.some(a => a.id === 'test.rush')).toBe(true)
    expect(test.amps.every(a => a.source === 'TEST' && typeof a.page === 'number' && a.rating >= 0)).toBe(true)
    expect(testc.amps.some(a => a.id === 'test.rush')).toBe(false)
  })
  test('descriptions only when asked; table rules pass through', () => {
    const on = exportBooks(cat, ['TEST'], [{ name: 'Made-up rule', text: 'Invented.' }], OPTS)
    const off = exportBooks(cat, ['TEST'], [], { ...OPTS, descriptions: false })
    expect(on.tableRules).toEqual([{ name: 'Made-up rule', text: 'Invented.' }])
    expect(JSON.stringify(off.books)).not.toMatch(/"description"|"text"/)
  })
  test('a rules sheet’s entries are the book’s', () => {
    const rules = exportBooks(cat, ['TEST'], [], OPTS).books![0].rules
    expect(rules.length).toBeGreaterThan(0)
    expect(rules.every(r => r.title && r.sheet)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/engine/export.test.ts -t books`
Expected: FAIL, "exportBooks is not exported"

- [ ] **Step 3: Implement** (in `src/engine/export.ts`: replace the placeholder `ExportBook` and add below `exportRunners`)

```ts
export interface ExportBook {
  source: { id: string; name: string; publisher: string; canon: boolean }
  amps: { id: string; source: string; page: number; canon: boolean; type: string; typeName: string; name: string; rating: number;
    essence: number; printedRating?: number; mod: boolean; effects: ExportEffect[]; rr: ExportRR[]; bonuses: ExportBonuses
    item?: { kind: string; specialist: boolean; armor?: number; dv?: string; ranges?: Record<'melee' | 'short' | 'medium' | 'long', Range> }
    vehicle?: string; description?: string }[]
  items: { id: string; source: string; page: number; canon: boolean; kind: string; name: string; category?: string; specialist: boolean
    armor?: number; dv?: string; ranges?: Record<'melee' | 'short' | 'medium' | 'long', Range>; description?: string }[]
  vehicles: { id: string; source: string; page: number; name: string; pilot: number; body: number; handling: number; speed: number
    flyingSpeed?: number; armor: number; mount: string }[]
  skills: { id: string; source: string; page: number; name: string; attr: string; alt?: string; specs: { id: string; name: string; attr: string }[] }[]
  specs: { skill: string; id: string; name: string; attr: string; page?: number }[]
  rules: { id: string; source: string; page: number; sheet: string; section: string; title: string; text?: string }[]
}

/** The ticked books as the app sees them (edits and house rules applied), with the table rules switched on. */
export function exportBooks(c: Catalog, sources: string[], tableRules: { name: string; text: string }[], o: ExportOpts): ExportFile {
  const books: ExportBook[] = sources.flatMap(id => {
    const s = c.sources.get(id)
    if (!s) return []
    const mine = <T extends { source: string }>(m: Map<string, T>) => [...m.values()].filter(e => e.source === id)
    return [{
      source: { id: s.id, name: s.name, publisher: s.publisher, canon: s.canon },
      amps: mine(c.amps).map(t => {
        const { amp } = ampFromTemplate(t, () => 'export')
        return { id: t.id, source: t.source, page: t.page, canon: s.canon, type: t.type, typeName: c.ampTypes.get(t.type)?.name ?? t.type,
          name: t.name, rating: ampRating(c, amp, { isFirstQuality: false }), essence: ampEssence(c, amp),
          ...t.printedRating != null ? { printedRating: t.printedRating } : {}, mod: !!t.mod, ...ampParts(c, t.type, t.effects),
          ...t.item ? { item: { kind: t.item.kind, specialist: !!t.item.specialist, ...t.item.armor != null ? { armor: t.item.armor } : {},
            ...t.item.dv ? { dv: t.item.dv } : {}, ...t.item.ranges ? { ranges: parseRanges(t.item.ranges) } : {} } } : {},
          ...t.vehicle ? { vehicle: t.vehicle } : {}, ...o.descriptions && t.narrative ? { description: t.narrative } : {} }
      }),
      items: mine(c.items).map(i => ({ id: i.id, source: i.source, page: i.page, canon: s.canon, kind: i.kind, name: i.name,
        ...i.category ? { category: i.category } : {}, specialist: !!i.specialist, ...i.armor != null ? { armor: i.armor } : {},
        ...i.dv ? { dv: i.dv } : {}, ...i.ranges ? { ranges: parseRanges(i.ranges) } : {}, ...o.descriptions && i.text ? { description: i.text } : {} })),
      vehicles: mine(c.vehicles).map(v => ({ id: v.id, source: v.source, page: v.page, name: v.name, pilot: v.pilot, body: v.body,
        handling: v.handling, speed: v.speed, ...v.flyingSpeed != null ? { flyingSpeed: v.flyingSpeed } : {}, armor: v.armor, mount: v.mount })),
      skills: mine(c.skills).map(k => ({ id: k.id, source: k.source, page: k.page, name: k.name, attr: k.attr, ...k.alt ? { alt: k.alt } : {},
        specs: k.specs.filter(p => !p.source || p.source === id).map(p => ({ id: p.id, name: p.name, attr: p.attr })) })),
      // this book's specs on another book's skill (a new style for the core Close Combat)
      specs: [...c.skills.values()].filter(k => k.source !== id).flatMap(k => k.specs.filter(p => p.source === id)
        .map(p => ({ skill: k.id, id: p.id, name: p.name, attr: p.attr, ...p.page ? { page: p.page } : {} }))),
      rules: mine(c.rules).map(r => ({ id: r.id, source: r.source, page: r.page, sheet: r.sheet, section: r.section, title: r.title,
        ...o.descriptions && r.text ? { text: r.text } : {} })),
    }]
  })
  return { ...envelope('books', o), books, tableRules: o.descriptions ? tableRules : tableRules.map(r => ({ name: r.name, text: '' })) }
}
```

Add `ampFromTemplate` to the `./amps` import. Note the test "descriptions off" checks no `"text"` key inside `books`; table rules are outside `books` and keep their key with an empty text.

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/engine/export.test.ts && npx tsc -b`
Expected: 9 passed. If the mini fixtures have no rules under `TEST`, point the rules test at the source that has them (`grep -l "<rule " tests/fixtures/mini/custom/imported/*/*.xml`) and keep the assertion.

- [ ] **Step 5: Commit**

```bash
git add src/engine/export.ts tests/engine/export.test.ts
git commit -m "export: book data as Chummer Anarchy export v1 (engine)"
```

---

### Task 3: The file's schema and format document

**Files:**
- Create: `public/data/schema/export.schema.json`, `docs/export-format.md`
- Modify: `package.json` (devDependency `ajv`), `tests/engine/export.test.ts`

**Interfaces:**
- Consumes: `exportRunners`, `exportBooks`.
- Produces: `public/data/schema/export.schema.json` (draft 2020-12), the contract the module's tests also load.

- [ ] **Step 1: Install ajv**

Run: `npm install --save-dev ajv@^8`
Expected: `package.json` devDependencies gains `"ajv": "^8.x"`.

- [ ] **Step 2: Write the failing test** (append)

```ts
import Ajv2020 from 'ajv/dist/2020'
import { readFileSync } from 'node:fs'

describe('export: the schema', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const check = ajv.compile(JSON.parse(readFileSync('public/data/schema/export.schema.json', 'utf8')))
  test('runners and books files are valid', () => {
    for (const f of [exportRunners(cat, [rush()], OPTS), exportBooks(cat, [...cat.sources.keys()], [{ name: 'X', text: 'Y' }], OPTS)])
      expect(check(f), JSON.stringify(check.errors)).toBe(true)
  })
  test('a wrong format or a newer version is not', () => {
    expect(check({ ...exportRunners(cat, [], OPTS), format: 'something-else' })).toBe(false)
    expect(check({ ...exportRunners(cat, [], OPTS), version: 2 })).toBe(false)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/engine/export.test.ts -t schema`
Expected: FAIL, ENOENT on `export.schema.json`

- [ ] **Step 4: Write the schema**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:chummer-anarchy2:export:1",
  "title": "Chummer Anarchy export v1",
  "description": "Runners or book data from Chummer Anarchy 2.0 (docs/export-format.md). Extra properties are allowed so later minor additions stay readable.",
  "type": "object",
  "required": ["format", "version", "kind", "exportedAt", "app", "descriptions"],
  "properties": {
    "format": { "const": "chummer-anarchy2-export" },
    "version": { "const": 1 },
    "kind": { "enum": ["runners", "books"] },
    "exportedAt": { "type": "string", "format": "date-time" },
    "app": { "type": "object", "required": ["name", "version"], "properties": { "name": { "type": "string" }, "version": { "type": "string" } } },
    "descriptions": { "type": "boolean" },
    "runners": { "type": "array", "items": { "$ref": "#/$defs/runner" } },
    "books": { "type": "array", "items": { "$ref": "#/$defs/book" } },
    "tableRules": { "type": "array", "items": { "type": "object", "required": ["name", "text"], "properties": { "name": { "type": "string" }, "text": { "type": "string" } } } }
  },
  "allOf": [
    { "if": { "properties": { "kind": { "const": "runners" } } }, "then": { "required": ["runners"] } },
    { "if": { "properties": { "kind": { "const": "books" } } }, "then": { "required": ["books"] } }
  ],
  "$defs": {
    "range": { "enum": ["ok", "disadvantage", "none"] },
    "ranges": { "type": "object", "required": ["melee", "short", "medium", "long"], "properties": {
      "melee": { "$ref": "#/$defs/range" }, "short": { "$ref": "#/$defs/range" }, "medium": { "$ref": "#/$defs/range" }, "long": { "$ref": "#/$defs/range" } } },
    "effect": { "type": "object", "required": ["id", "name", "category"], "properties": { "id": { "type": "string" }, "name": { "type": "string" },
      "category": { "type": "string" }, "param": { "type": "string" }, "value": { "type": "string" }, "note": { "type": "string" } } },
    "rr": { "type": "object", "required": ["on", "id", "name", "value"], "properties": { "on": { "enum": ["attribute", "skill", "spec"] },
      "id": { "type": "string" }, "name": { "type": "string" }, "value": { "type": "integer", "minimum": 1 } } },
    "bonuses": { "type": "object", "required": ["light", "serious", "physicalThreshold", "mentalThreshold", "matrixThreshold", "armor", "anarchy", "initiative"],
      "additionalProperties": { "type": "integer", "minimum": 0 } },
    "ampParts": { "type": "object", "required": ["type", "typeName", "name", "rating", "essence", "effects", "rr", "bonuses", "canon"], "properties": {
      "effects": { "type": "array", "items": { "$ref": "#/$defs/effect" } }, "rr": { "type": "array", "items": { "$ref": "#/$defs/rr" } },
      "bonuses": { "$ref": "#/$defs/bonuses" }, "rating": { "type": "number" }, "essence": { "type": "number" }, "canon": { "type": "boolean" },
      "description": { "type": "string" } } },
    "runner": { "type": "object",
      "required": ["id", "updatedAt", "exportedAt", "streetName", "realName", "finalized", "metatype", "level", "lifestyle", "portrait", "attributes",
        "edge", "essence", "skills", "knowledge", "amps", "items", "vehicles", "monitor", "thresholds", "armor", "initiative", "pools", "narrative",
        "background", "notes", "nuyen", "ledger"],
      "properties": {
        "portrait": { "type": ["string", "null"] },
        "attributes": { "type": "object", "required": ["str", "agi", "wil", "log", "cha"], "additionalProperties": { "type": "integer" } },
        "amps": { "type": "array", "items": { "allOf": [{ "$ref": "#/$defs/ampParts" }, { "required": ["uid"] }] } },
        "items": { "type": "array", "items": { "type": "object", "required": ["uid", "kind", "name", "canon", "price"], "properties": {
          "kind": { "enum": ["gear", "weapon", "armor", "spell", "complex-form"] },
          "weapon": { "type": "object", "required": ["dv", "ranges"], "properties": { "ranges": { "$ref": "#/$defs/ranges" } } } } } },
        "narrative": { "type": "object", "required": ["keywords", "dispositions", "cues"] },
        "nuyen": { "type": "object", "required": ["balance"], "properties": { "balance": { "type": "number" } } }
      } },
    "book": { "type": "object", "required": ["source", "amps", "items", "vehicles", "skills", "specs", "rules"], "properties": {
      "source": { "type": "object", "required": ["id", "name", "publisher", "canon"] },
      "amps": { "type": "array", "items": { "allOf": [{ "$ref": "#/$defs/ampParts" }, { "required": ["id", "source", "page"] }] } },
      "items": { "type": "array", "items": { "type": "object", "required": ["id", "source", "page", "kind", "name", "canon"], "properties": {
        "ranges": { "$ref": "#/$defs/ranges" } } } },
      "rules": { "type": "array", "items": { "type": "object", "required": ["id", "source", "page", "sheet", "section", "title"] } } } }
  }
}
```

- [ ] **Step 5: Write `docs/export-format.md`**

Cover, in the style of `docs/character-format.md`: purpose and the two kinds; file names; the envelope table; the runner fields (from `ExportRunner`, one line each, with where the number comes from: `derive`, `ampRating`, `balance`); the book fields (`ExportBook`); ranges; RR lines and bonuses (which effect ids feed which bonus: `wound-light`→light (0 on cyberdeck/vehicle amps), `wound-serious`→serious, `mental-armor`→mentalThreshold, `firewall-plus`→matrixThreshold, `armor-plus`→armor, `init-1/2/3`→initiative); descriptions on/off and the sharing note; what never goes in a file; versioning (a breaking change is version 2; readers refuse versions they don't know; additions within v1 are optional fields). End with a short example file (a made-up runner, one amp, one weapon) that passes the schema.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/engine/export.test.ts && npm run check`
Expected: 11 export tests pass; the full check passes.

- [ ] **Step 7: Commit**

```bash
git add public/data/schema/export.schema.json docs/export-format.md package.json package-lock.json tests/engine/export.test.ts
git commit -m "export: the v1 schema and format document"
```

---

### Task 4: Download runners (editor button and runner-list dialog)

**Files:**
- Create: `src/ui/Foundry.tsx`
- Modify: `src/ui/EditorView.tsx:235` (button beside "Export file"), `src/ui/Library.tsx` (header button + dialog)
- Test: `e2e/foundry.spec.ts`

**Interfaces:**
- Consumes: `exportRunners`, `ExportOpts`; `Modal` (`./bits`); `Campaign` (`./Campaigns`); `__APP_VERSION__`.
- Produces: `downloadJson(name: string, data: unknown): void`; `exportOpts(descriptions: boolean): ExportOpts`; `<ExportRunnersDialog c runners campaigns open onClose />`; `runnersFileName(now: Date): string`.

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/foundry.spec.ts
// 0.6.0: runners and book data download as Chummer Anarchy export v1 for the Foundry importer.
import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

async function newRunner(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill(name)
  await expect(page.getByRole('status', { name: 'Save status' })).toContainText('All changes saved')
}
const json = async (p: Promise<import('@playwright/test').Download>) => JSON.parse(readFileSync((await (await p).path())!, 'utf8'))

test('a runner downloads for Foundry from its editor', async ({ page }) => {
  await newRunner(page, 'Export Me')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export for Foundry' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^runners-\d{4}-\d{2}-\d{2}\.ca2foundry\.json$/)
  const f = await json(dl)
  expect(f).toMatchObject({ format: 'chummer-anarchy2-export', version: 1, kind: 'runners' })
  expect(f.runners.map((r: { streetName: string }) => r.streetName)).toEqual(['Export Me'])
})

test('several runners download together from the runner list', async ({ page }) => {
  await newRunner(page, 'Pick One')
  await newRunner(page, 'Pick Two')
  await page.goto('/')
  await page.getByRole('button', { name: 'Export for Foundry…' }).click()
  const dlg = page.getByRole('dialog', { name: 'Export runners for Foundry' })
  await dlg.getByRole('button', { name: 'None' }).click()
  await dlg.getByRole('checkbox', { name: 'Pick One' }).check()
  await dlg.getByRole('checkbox', { name: 'Pick Two' }).check()
  const dl = page.waitForEvent('download')
  await dlg.getByRole('button', { name: 'Download 2 runners' }).click()
  const f = await json(dl)
  expect(f.runners.map((r: { streetName: string }) => r.streetName).sort()).toEqual(['Pick One', 'Pick Two'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run build && npx playwright test e2e/foundry.spec.ts --reporter=line`
Expected: FAIL, no button "Export for Foundry"

- [ ] **Step 3: Write `src/ui/Foundry.tsx`**

```tsx
// Export for the Foundry importer module (jbowensii/chummer-anarchy2-foundry): Chummer Anarchy export v1 files
// (docs/export-format.md). Runners from the editor and the runner list; book data on Game data (GMs).
import { useState } from 'react'
import { exportRunners, type ExportOpts } from '../engine'
import type { Catalog, Character } from '../model/types'
import { Modal } from './bits'
import type { Campaign } from './Campaigns'

export const exportOpts = (descriptions: boolean): ExportOpts => ({ descriptions, now: new Date().toISOString(), appVersion: __APP_VERSION__ })
export const fileDate = (d = new Date()) => d.toISOString().slice(0, 10)

/** Saves data as a .json download. */
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  URL.revokeObjectURL(url)
}
/** One or more runners as a runners file. Runner descriptions are the amps' own text, always included. */
export const downloadRunners = (c: Catalog, chs: Character[]) =>
  downloadJson(`runners-${fileDate()}.ca2foundry.json`, exportRunners(c, chs, exportOpts(true)))

const label = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'

/** The runner list's dialog: tick runners (or a whole campaign), download one file. */
export function ExportRunnersDialog({ c, runners, campaigns, open, onClose }: {
  c: Catalog; runners: Character[]; campaigns: Campaign[]; open: boolean; onClose: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [camp, setCamp] = useState('')
  const set = (ids: string[]) => setPicked(new Set(ids))
  const n = runners.filter(r => picked.has(r.id)).length
  return (
    <Modal open={open} onClose={onClose} title="Export runners for Foundry"
      actions={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!n} onClick={() => { downloadRunners(c, runners.filter(r => picked.has(r.id))); onClose() }}>
          Download {n} runner{n === 1 ? '' : 's'}</button></>}>
      <p className="muted">For the Chummer Anarchy 2.0 importer in Foundry VTT (sra2): upload the file there with Import from Chummer.</p>
      <div className="row">
        <button className="btn small quiet" onClick={() => set(runners.map(r => r.id))}>All</button>
        <button className="btn small quiet" onClick={() => set([])}>None</button>
        {campaigns.length > 0 && <label>Tick a campaign
          <select value={camp} onChange={e => { setCamp(e.target.value); if (e.target.value) set(runners.filter(r => r.campaign === e.target.value).map(r => r.id)) }}>
            <option value="">…</option>
            {campaigns.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select></label>}
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, maxHeight: '50vh', overflow: 'auto' }}>
        {runners.map(r => <li key={r.id}><label className="check"><input type="checkbox" checked={picked.has(r.id)}
          onChange={e => { const s = new Set(picked); if (e.target.checked) s.add(r.id); else s.delete(r.id); setPicked(s) }} /> {label(r)}</label></li>)}
      </ul>
    </Modal>
  )
}
```

- [ ] **Step 4: Wire it in**

`src/ui/EditorView.tsx`, after the "Export file" button (line 235):

```tsx
        <button className="btn quiet" onClick={() => downloadRunners(c, [ch])}>Export for Foundry</button>
```

with `import { downloadRunners } from './Foundry'`.

`src/ui/Library.tsx`: add `const [foundry, setFoundry] = useState(false)` beside the other state; in the header after "Import file"'s hidden input:

```tsx
          <button className="btn quiet" onClick={() => setFoundry(true)} disabled={!list?.length}>Export for Foundry…</button>
```

and beside the other `<Modal>`s at the end of the component:

```tsx
      <ExportRunnersDialog c={c} runners={(list ?? []).map(s => s.ch)} campaigns={campaigns} open={foundry} onClose={() => setFoundry(false)} />
```

with `import { ExportRunnersDialog } from './Foundry'`. (`list` already holds exactly what the server lets this user see: their own, plus everyone's for the admin and campaign runners for an editor.)

- [ ] **Step 5: Run the tests**

Run: `npx tsc -b && npm run build && npx playwright test e2e/foundry.spec.ts --reporter=line`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add src/ui/Foundry.tsx src/ui/EditorView.tsx src/ui/Library.tsx e2e/foundry.spec.ts
git commit -m "export: download runners for Foundry (editor, runner list)"
```

---

### Task 5: Download book data (Game data, GMs only)

**Files:**
- Modify: `src/ui/Foundry.tsx` (add `ExportBooksPanel`), `src/ui/tabs/Data.tsx` (render it for staff; fix the stale "each runner can be set to flag it (Concept tab)" sentence: 0.5.7 moved that to the GM's Rules page), `src/ui/TableRules.tsx` (export `tableRulesForExport`)
- Test: `e2e/foundry.spec.ts` (two tests)

**Interfaces:**
- Consumes: `exportBooks`, `loadTableRules`, `seeds`, `canEdit`, `useMe`.
- Produces: `tableRulesForExport(c: Catalog, saved: TableRule[]): { name: string; text: string }[]`; `<ExportBooksPanel c />`.

- [ ] **Step 1: Write the failing tests** (append to `e2e/foundry.spec.ts`)

```ts
test('the GM downloads ticked books, with or without descriptions', async ({ page }) => {
  await page.goto('/#/data')
  const panel = page.getByRole('region', { name: 'Export book data for Foundry' })
  await expect(panel.getByRole('checkbox', { name: /Include book descriptions/ })).toBeChecked()
  await expect(panel).toContainText('For your own Foundry only. Don’t share this file.')
  await panel.getByRole('button', { name: 'None' }).click()
  await panel.getByRole('checkbox', { name: /^TEST\b/ }).check()
  let dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  expect((await dl).suggestedFilename()).toMatch(/^books-\d{4}-\d{2}-\d{2}\.ca2foundry\.json$/)
  let f = await json(dl)
  expect(f.books.map((b: { source: { id: string } }) => b.source.id)).toEqual(['TEST'])
  expect(f.descriptions).toBe(true)
  await panel.getByRole('checkbox', { name: /Include book descriptions/ }).uncheck()
  dl = page.waitForEvent('download')
  await panel.getByRole('button', { name: 'Download book data' }).click()
  f = await json(dl)
  expect(f.descriptions).toBe(false)
  expect(JSON.stringify(f.books)).not.toContain('"description"')
})
```

and a player-side check in the accounts-style server test that already signs in a player (`e2e/tablerules.spec.ts` has `signIn(page, 'pat')`): add to that file

```ts
test('a player has no book-data export', async ({ page }) => {
  await signIn(page, 'pat')
  await page.goto('/#/data')
  await expect(page.getByRole('heading', { name: 'Game data' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Export book data for Foundry' })).toHaveCount(0)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run build && npx playwright test e2e/foundry.spec.ts e2e/tablerules.spec.ts --reporter=line`
Expected: the GM test FAILS (no region); the player test passes already (that's fine: it guards the rule).

- [ ] **Step 3: Implement**

`src/ui/TableRules.tsx`, below `tableFlags`:

```ts
/** The rules switched on, as the export writes them (the app's own switches aren't rules). */
export const tableRulesForExport = (c: Catalog, saved: TableRule[]) => saved.filter(r => r.on && !APP_RULES.some(a => a.id === r.id))
  .flatMap(r => r.name !== undefined ? [{ name: r.name, text: r.text ?? '' }]
    : c.rules.has(r.id) ? [{ name: c.rules.get(r.id)!.title, text: c.rules.get(r.id)!.text }] : [])
```

`src/ui/Foundry.tsx`, add:

```tsx
import { exportBooks } from '../engine'
import { loadTableRules, tableRulesForExport } from './TableRules'
import { NonCanon } from './bits'

/** Game data (admin and editors): tick books, choose descriptions, download. */
export function ExportBooksPanel({ c }: { c: Catalog }) {
  const all = [...c.sources.values()]
  const [picked, setPicked] = useState<Set<string>>(() => new Set(all.map(s => s.id)))
  const [desc, setDesc] = useState(true)
  const [busy, setBusy] = useState(false)
  const download = async () => {
    setBusy(true)
    try {
      const rules = tableRulesForExport(c, await loadTableRules())
      downloadJson(`books-${fileDate()}.ca2foundry.json`, exportBooks(c, all.filter(s => picked.has(s.id)).map(s => s.id), rules, exportOpts(desc)))
    } finally { setBusy(false) }
  }
  return (
    <section aria-labelledby="ca2-foundry-books" className="stack">
      <h2 id="ca2-foundry-books">Export book data for Foundry</h2>
      <p className="muted">For the Chummer Anarchy 2.0 importer in Foundry VTT (sra2). The books go out as this app sees them, with your
        corrections, house rules and the table rules switched on.</p>
      <div className="row">
        <button className="btn small quiet" onClick={() => setPicked(new Set(all.map(s => s.id)))}>All</button>
        <button className="btn small quiet" onClick={() => setPicked(new Set())}>None</button>
      </div>
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {all.map(s => <li key={s.id}><label className="check"><input type="checkbox" checked={picked.has(s.id)}
          onChange={e => { const n = new Set(picked); if (e.target.checked) n.add(s.id); else n.delete(s.id); setPicked(n) }} />
          <span><b>{s.id}</b> {s.name} {s.canon ? <span className="muted">Canon</span> : <NonCanon />}</span></label></li>)}
      </ul>
      <label className="check"><input type="checkbox" checked={desc} onChange={e => setDesc(e.target.checked)} />
        <span>Include book descriptions <span className="muted">For your own Foundry only. Don’t share this file.</span></span></label>
      <div><button className="btn primary" disabled={!picked.size || busy} onClick={() => void download()}>Download book data</button></div>
    </section>
  )
}
```

`src/ui/tabs/Data.tsx`: `import { canEdit, useMe } from '../auth'` (merge with the existing `AccountMenu` import) and `import { ExportBooksPanel } from '../Foundry'`; in `DataScreen` add `const me = useMe()` and, right after the Sources table's closing `</div>`, `{canEdit(me) && <ExportBooksPanel c={c} />}`. Replace "each runner can be set to flag it (Concept tab)" with "the GM can flag it at their table (Rules page)".

- [ ] **Step 4: Run the tests**

Run: `npx tsc -b && npm run build && npx playwright test e2e/foundry.spec.ts e2e/tablerules.spec.ts --reporter=line`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/Foundry.tsx src/ui/tabs/Data.tsx src/ui/TableRules.tsx e2e/foundry.spec.ts e2e/tablerules.spec.ts
git commit -m "export: book data for Foundry on Game data (GMs)"
```

---

### Task 6: Docs, version, release 0.6.0

**Files:**
- Modify: `README.md` (a "Foundry VTT" section: what the two exports are, who gets which, the sharing note, a link to `docs/export-format.md` and the module repo), `CHANGELOG.md` (0.6.0 entry), `package.json` + `package-lock.json` (version 0.6.0), `docs/character-format.md:6` (the "later Foundry VTT export" sentence now points to `docs/export-format.md`)

- [ ] **Step 1: Write the docs and bump the version** (`"version": "0.6.0"` in `package.json` and the first two `version` fields of `package-lock.json`).

- [ ] **Step 2: Full check**

Run: `npm run check && npm run build && npx playwright test --reporter=line`
Expected: every unit and e2e test passes.

- [ ] **Step 3: Commit, PR, release** (the approved release flow)

```bash
git add README.md CHANGELOG.md package.json package-lock.json docs/character-format.md
git commit -m "0.6.0: export runners and book data for Foundry VTT"
git push -u origin feat/0.6.0
gh pr create --fill
```

After CI passes: `gh pr merge --merge`, `git fetch && git update-ref refs/heads/main origin/main` (never switch the working tree across commits), tag `v0.6.0`, `gh release create v0.6.0` with the CHANGELOG section, wait for the publish workflow, then install on tower04 (pull `:0.6.0`, tag `:latest`, Apply on the Unraid template) and confirm the version in the header.

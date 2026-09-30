// .ca2.json character files: blank character, serialize, import checks, migrations, snapshots.
import type { Build, Catalog, Character, ItemEntry, KnowledgeEntry, StartingGear } from '../model/types'
import { BACKDROPS, newId } from '../model/types'
import { ampFromTemplate, isSinner, plain, sinnerTemplate } from './amps'

export const FORMAT_VERSION = 1

export function blankCharacter(level = 'runner', metatype = 'human'): Character {
  const ch: Character = {
    formatVersion: 1, id: newId(),
    identity: { name: '', streetName: '', metatype, background: '', notes: '' },
    narrative: { keywords: ['', '', '', '', ''], dispositions: ['', '', '', ''], cues: ['', '', '', ''] },
    level, package: 'free',
    build: { attributes: { str: 1, agi: 1, wil: 1, log: 1, cha: 1 }, skills: [], knowledge: [], amps: [], items: [] },
    career: [], overrides: [], updatedAt: new Date().toISOString(),
  }
  ensureStartingGear(ch.build)
  return ch
}

/** What every runner starts with, free (CRB p.85): a commlink with trodes and a fake SIN. */
export const STARTING_GEAR: Partial<Record<StartingGear, string>> = { commlink: 'Commlink (with trodes)', 'fake-sin': 'Fake SIN' }
/** The exact names a plain gear entry may carry to count as the free one (an imported pregen's "Fake SIN, Commlink"). */
const SAME: Record<string, string[]> = { commlink: ['commlink', 'commlink (with trodes)', 'commlink with trodes'], 'fake-sin': ['fake sin'] }

/** Adds the free starting gear a build lacks. On a draft, an unpriced gear entry with exactly that name becomes the free
 *  one instead, so there's never a second; a finalized runner's items are never touched (its recorded baseline stays),
 *  it only gains the missing free entries at 0¥. Fixed uids: reading a file twice gives the same runner. */
export function ensureStartingGear(b: Build, finalized = false): void {
  for (const [kind, name] of Object.entries(STARTING_GEAR) as [StartingGear, string][]) {
    if (b.items.some(i => i.starting === kind)) continue
    const same = finalized ? undefined
      : b.items.find(i => i.kind === 'gear' && !i.starting && !i.catalogId && i.price == null && SAME[kind].includes(plain(i.name)))
    if (same) same.starting = kind
    else b.items.unshift({ uid: `start-${kind}`, kind: 'gear', name, starting: kind })
  }
  // a SINner quality added by hand (before 0.5.3 had the box) means a real SIN: its free entry comes along
  if (b.amps.some(a => isSinner(a)) && !b.items.some(i => i.starting === 'real-sin')) b.items.push(realSinItem())
}

const realSinItem = (): ItemEntry => ({ uid: 'real-sin', kind: 'gear', name: 'Real SIN', starting: 'real-sin' })
/** The box's state: a Real SIN entry, or a SINner quality however it got there. */
export const hasRealSin = (b: Build, c?: Catalog) => b.items.some(i => i.starting === 'real-sin') || b.amps.some(a => isSinner(a, c))
/** SINner qualities the player added by hand: unticking the box removes them too, so the UI asks first. */
export const handAddedSinner = (b: Build, c?: Catalog) => b.amps.filter(a => !a.realSin && isSinner(a, c))

/** The Concept tab's "Has a real SIN": on adds a free Real SIN entry and, when a book has one and the runner lacks it,
 *  the SINner quality; off removes the entry and every SINner quality. */
export function setRealSin(c: Catalog, b: Build, on: boolean): void {
  if (!on) {
    b.items = b.items.filter(i => i.starting !== 'real-sin')
    b.amps = b.amps.filter(a => !isSinner(a, c))
    return
  }
  if (!b.items.some(i => i.starting === 'real-sin')) b.items.push(realSinItem())
  const t = sinnerTemplate(c)
  if (t && !b.amps.some(a => isSinner(a, c))) {
    const { amp } = ampFromTemplate(t, () => 'real-sin-amp')
    b.amps.push({ ...amp, realSin: true })
  }
}

/** After every edit: a SINner quality brings its free Real SIN entry, and taking the last one off takes the entry with it
 *  (kept when no book has a SINner, so a runner from before stays as it was). */
export function syncRealSin(c: Catalog, b: Build): void {
  const has = b.amps.some(a => isSinner(a, c)), entry = b.items.some(i => i.starting === 'real-sin')
  if (has && !entry) b.items.push(realSinItem())
  if (!has && entry && sinnerTemplate(c)) b.items = b.items.filter(i => i.starting !== 'real-sin')
}

export const serialize = (ch: Character) => JSON.stringify(ch, null, 2) + '\n'

// formatVersion -> function upgrading a file of that version to the next one
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

/** A knowledge entry from any release: before 0.5.2 a plain string, a language written "Language: X". */
export function knowledgeEntry(k: string | Partial<KnowledgeEntry>): KnowledgeEntry {
  const e = typeof k === 'string' ? { name: k } : k
  const lang = !e.kind && /^language:\s*/i.exec(e.name ?? '')
  const out: KnowledgeEntry = { name: lang ? e.name!.slice(lang[0].length) : e.name ?? '', kind: lang ? 'language' : e.kind ?? 'knowledge' }
  if (e.from) out.from = e.from
  if (e.native) out.native = true
  if (e.id) out.id = e.id
  return out
}

export function migrate(raw: Record<string, unknown>): Character {
  let v = raw.formatVersion as number
  while (v < FORMAT_VERSION) { raw = MIGRATIONS[v](raw); v = raw.formatVersion as number }
  const ch = raw as unknown as Character
  if (Array.isArray(ch.build?.knowledge)) {
    ch.build.knowledge = ch.build.knowledge.map(knowledgeEntry)
    // 0.5.3 before review keyed a paid entry's order and hidden mark by "<kind>:<name>": each entry gets an id of its
    // own (deterministic, so an unsaved reload gives the same one) and those keys move to it, one entry per key
    const byName = new Map<string, string>()
    ch.build.knowledge.forEach((k, i) => {
      if (k.from || k.id) return
      k.id = `k${i}`
      if (!byName.has(`${k.kind}:${k.name}`)) byName.set(`${k.kind}:${k.name}`, k.id)
    })
    for (const f of ['knowledgeOrder', 'knowledgeHidden'] as const)
      if (Array.isArray(ch.build[f])) ch.build[f] = ch.build[f]!.map(key => byName.get(key) ?? key)
  }
  if (Array.isArray(ch.build?.items)) ensureStartingGear(ch.build, !!ch.finalizedAt)
  // an unknown portrait backdrop (or none: files before 0.5.4) is no backdrop
  if (ch.identity && ch.identity.backdrop !== undefined && !BACKDROPS.includes(ch.identity.backdrop)) delete ch.identity.backdrop
  for (const e of Array.isArray(ch.career) ? ch.career : [])
    if (e.type === 'knowledge-add') Object.assign(e, knowledgeEntry({ name: e.name, kind: e.kind, from: e.from }))
  return ch
}

type Parsed = { ok: true; character: Character } | { ok: false; reason: string }

/** Never throws; a bad file comes back with a human-readable reason. */
export function parseCharacterFile(text: string): Parsed {
  let raw: Record<string, unknown>
  try { raw = JSON.parse(text) } catch (e) { return { ok: false, reason: `Not valid JSON: ${(e as Error).message}` } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'Not a character file.' }
  const v = raw.formatVersion
  if (typeof v !== 'number') return { ok: false, reason: 'Missing formatVersion; not a Chummer Anarchy 2.0 character.' }
  if (v > FORMAT_VERSION) return { ok: false, reason: `This file is from a newer version of the app (format ${v}).` }
  const ch = migrate(raw)
  const b = ch.build as Partial<Character['build']> | undefined
  const problems = [
    typeof ch.id !== 'string' && 'id',
    (!ch.identity || typeof ch.identity.metatype !== 'string') && 'identity.metatype',
    typeof ch.level !== 'string' && 'level',
    (!b || typeof b.attributes !== 'object' || !Array.isArray(b.skills) || !Array.isArray(b.amps) || !Array.isArray(b.items)) && 'build',
    !Array.isArray(ch.career) && 'career',
  ].filter(Boolean)
  if (problems.length) return { ok: false, reason: `Missing or invalid: ${problems.join(', ')}.` }
  ch.narrative ??= { keywords: [], dispositions: [], cues: [] }
  ch.overrides ??= []
  ch.build.knowledge ??= []
  ch.package ??= 'free'
  return { ok: true, character: ch }
}

/** Store a copy of each catalog entry on the character so it still prints if the data later disappears. */
export function snapshotEntries(c: Catalog, ch: Character): Character {
  const out = structuredClone(ch)
  for (const a of out.build.amps) if (a.catalogId && c.amps.has(a.catalogId)) a.snapshot = c.amps.get(a.catalogId)
  for (const i of out.build.items) if (i.catalogId && c.items.has(i.catalogId)) i.snapshot = c.items.get(i.catalogId)
  return out
}

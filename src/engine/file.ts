// .ca2.json character files: blank character, serialize, import checks, migrations, snapshots.
import type { Catalog, Character, KnowledgeEntry } from '../model/types'
import { newId } from '../model/types'

export const FORMAT_VERSION = 1

export function blankCharacter(level = 'runner', metatype = 'human'): Character {
  return {
    formatVersion: 1, id: newId(),
    identity: { name: '', streetName: '', metatype, background: '', notes: '' },
    narrative: { keywords: ['', '', '', '', ''], dispositions: ['', '', '', ''], cues: ['', '', '', ''] },
    level, package: 'free',
    build: { attributes: { str: 1, agi: 1, wil: 1, log: 1, cha: 1 }, skills: [], knowledge: [], amps: [], items: [] },
    career: [], overrides: [], updatedAt: new Date().toISOString(),
  }
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
  return out
}

export function migrate(raw: Record<string, unknown>): Character {
  let v = raw.formatVersion as number
  while (v < FORMAT_VERSION) { raw = MIGRATIONS[v](raw); v = raw.formatVersion as number }
  const ch = raw as unknown as Character
  if (Array.isArray(ch.build?.knowledge)) ch.build.knowledge = ch.build.knowledge.map(knowledgeEntry)
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

// SR6 NPCs (S3): a grunt, critter, spirit or sprite is an SR6 runner file with an <npc> block and a blank build. Its stat
// block is a copy of the catalog entry's printed values and its rating (Professional Rating, Force or Level), read at
// that rating with formula(); its skills line gives dice pools against the catalog's skills. No book numbers here.
import { blankSr6, SR6_NPC_PARTS, type Sr6Character, type Sr6Npc, type Sr6NpcKind } from '../model/character'
import type { Sr6Entry } from '../model/types'
import { normName, type Sr6Data } from './data'
import { formula } from './values'

export const NPC_KINDS: Record<Sr6NpcKind, { label: string; kind: 'npcs' | 'critters' | 'spirits' | 'sprites';
  rating?: { label: 'Professional Rating' | 'Force' | 'Level'; letter?: 'F' | 'L' } }> = {
  grunt: { label: 'Grunt', kind: 'npcs', rating: { label: 'Professional Rating' } },
  critter: { label: 'Critter', kind: 'critters' },
  spirit: { label: 'Spirit', kind: 'spirits', rating: { label: 'Force', letter: 'F' } },
  sprite: { label: 'Sprite', kind: 'sprites', rating: { label: 'Level', letter: 'L' } },
}

/** The standard stat keys in stat-block order, with their labels. */
export const NPC_STATS: [string, string][] = [['bod', 'BOD'], ['agi', 'AGI'], ['rea', 'REA'], ['str', 'STR'], ['wil', 'WIL'],
  ['log', 'LOG'], ['int', 'INT'], ['cha', 'CHA'], ['edg', 'EDG'], ['ess', 'Essence'], ['mag', 'Magic'], ['res', 'Resonance'],
  ['attack', 'Attack'], ['sleaze', 'Sleaze'], ['data', 'Data Processing'], ['firewall', 'Firewall'],
  ['dr', 'Defense Rating'], ['init', 'Initiative'], ['actions', 'Actions'], ['cm', 'Condition monitor'], ['move', 'Movement']]
const NOT_STATS = new Set(['category', 'rating', 'group'])
const SPIRIT_ATTRS = new Set(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'ess', 'mag'])
const PARTS = new Set<string>(SR6_NPC_PARTS)

const kindOf = (e: Sr6Entry): Sr6NpcKind => {
  const k = (Object.keys(NPC_KINDS) as Sr6NpcKind[]).find(k => NPC_KINDS[k].kind === e.kind)
  if (!k) throw new Error(`${e.kind} entries aren’t NPCs`)
  return k
}

/** A blank NPC of `kind`; a spirit or sprite at `rating` (1 when none: a UI default, R). */
export function blankSr6Npc(kind: Sr6NpcKind, rating?: number, now?: string): Sr6Character {
  const ch = blankSr6('priority', undefined, now)
  const r = rating ?? (NPC_KINDS[kind].rating?.letter ? 1 : undefined)
  ch.npc = { kind, ...(r != null ? { rating: r } : {}), stats: {}, lines: [] }
  return ch
}

/** An NPC copied from a catalog npcs, critters, spirits or sprites entry; a grunt at its Professional Rating, a spirit or
 *  sprite at `rating`. Keys and values the runner file can't hold (its XSD) are left out. */
export function npcFromEntry(e: Sr6Entry, rating?: number, now?: string): Sr6Character {
  const kind = kindOf(e)
  const ch = blankSr6Npc(kind, kind === 'grunt' ? (Number(e.attrs.rating) || undefined) : rating, now)
  const stats = Object.entries(e.attrs).filter(([k, v]) => !NOT_STATS.has(k) && /^[a-z]{1,20}$/.test(k) && v.length <= 80)
  ch.npc = { ...ch.npc!, ...(kind === 'grunt' && e.attrs.group ? { group: e.attrs.group } : {}),
    from: { kind: e.kind, id: e.id, name: e.name, source: e.source, page: e.page },
    stats: Object.fromEntries(stats), lines: e.parts.filter(p => PARTS.has(p.tag)).map(p => ({ part: p.tag, text: p.text })) }
  ch.identity.streetName = e.name
  return ch
}

/** The key a book NPC is loaded under (Sr6Character.sampleKey). */
export const bookNpcKey = (e: Sr6Entry) => `${e.source}|${e.id}`

/** Each stat as printed and at the NPC's rating (a stat with the kind's letter; otherwise as printed). ok false: the
 *  value can't be read, shown as printed. */
export function npcValues(npc: Sr6Npc): { key: string; label: string; printed: string; value: string; ok: boolean }[] {
  const letter = NPC_KINDS[npc.kind].rating?.letter
  const has = new RegExp(`\\b(?:Rating|${letter})\\b`)
  const read = (key: string, printed: string) => {
    if (!letter || !has.test(printed)) return { value: printed, ok: true }
    const f = formula(printed, npc.rating ?? 1, letter)
    // CRB p. 147: a spirit's attribute is never below 1, whatever its adjustment
    const n = f.n != null && npc.kind === 'spirit' && SPIRIT_ATTRS.has(key) ? Math.max(1, f.n) : f.n
    return !f.ok ? { value: printed, ok: false } : { value: n == null ? printed : f.dice ? `${n} + ${f.dice}` : String(n), ok: true }
  }
  const known = new Map(NPC_STATS)
  const keys = [...NPC_STATS.map(([k]) => k).filter(k => k in npc.stats), ...Object.keys(npc.stats).filter(k => !known.has(k))]
  return keys.map(key => ({ key, label: known.get(key) ?? key, printed: npc.stats[key], ...read(key, npc.stats[key]) }))
}

/** The skills line as dice pools: "Name N" or a bare name (a spirit's or sprite's at its rating, R), resolved against the
 *  catalog's skills by name; pool = rating + the stat block's value of the skill's attribute. Unresolved: printed only. */
export function npcPools(npc: Sr6Npc, data: Pick<Sr6Data, 'skills'>): { name: string; rating: number | null; attr?: string; pool?: number; printed: string }[] {
  const byName = new Map(Object.values(data.skills).map(s => [normName(s.name), s]))
  const values = new Map(npcValues(npc).map(v => [v.key, v]))
  const bare = NPC_KINDS[npc.kind].rating?.letter ? npc.rating ?? null : null
  return (npc.lines.find(l => l.part === 'skills')?.text ?? '').split(',').map(p => p.trim()).filter(Boolean).map(printed => {
    // the regex backtracks quadratically on a long run of spaces: a skill longer than 100 characters is printed as it is
    // `Name N`, the book's `Name N(A)` (augmented) and `Name N (Specialization +2)`: the rank is N
    const m = printed.length <= 100 ? printed.match(/^(.*?)\s+(\d+)(?:\s*\(\d+\))?(?:\s*\([^()]*\))*$/) : null
    const name = m ? m[1] : printed, rating = m ? Number(m[2]) : bare
    const skill = byName.get(normName(name))
    if (!skill) return { name, rating, printed }
    const v = values.get(skill.attr)
    const attr = v?.ok && /^\d+$/.test(v.value) ? Number(v.value) : null
    return { name: skill.name, rating, attr: skill.attr, ...(rating != null && attr != null ? { pool: rating + attr } : {}), printed }
  })
}

/** The NPC block's headline: "Grunt, Professional Rating 2 · Street Crew", "Spirit, Force 4", "Sprite, Level 3", "Critter". */
export function npcHeadline(npc: Sr6Npc): string {
  const k = NPC_KINDS[npc.kind]
  return [k.label, k.rating && npc.rating != null && `${k.rating.label} ${npc.rating}`].filter(Boolean).join(', ')
    + (npc.kind === 'grunt' && npc.group ? ` · ${npc.group}` : '')
}

/** A skill as the NPC block prints it: "Gab 5 (pool 10)", or as printed when it has no pool. */
export const poolText = (p: ReturnType<typeof npcPools>[number]) => p.pool != null ? `${p.name}${p.rating != null ? ` ${p.rating}` : ''} (pool ${p.pool})` : p.printed

const PART_LABELS: Record<(typeof SR6_NPC_PARTS)[number], string> = { skills: 'Skills', powers: 'Powers', optionalPowers: 'Optional powers',
  weaknesses: 'Weaknesses', attacks: 'Attacks', augmentations: 'Augmentations', gear: 'Gear', weapons: 'Weapons' }
/** The line parts a kind uses, with their labels: a sprite has skills and powers, the others every part. */
export const npcParts = (kind: Sr6NpcKind): [string, string][] =>
  SR6_NPC_PARTS.filter(p => kind !== 'sprite' || p === 'skills' || p === 'powers').map(p => [p, PART_LABELS[p]])

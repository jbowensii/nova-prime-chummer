// SR6 NPCs (S3): a grunt, contact, critter, spirit or sprite is an SR6 runner file with an <npc> block and a blank build. Its stat
// block is a copy of the catalog entry's printed values and its rating (Professional Rating, Force or Level), read at
// that rating with formula(); its skills line gives dice pools against the catalog's skills. No book numbers here.
import { blankSr6, SR6_NPC_PARTS, type Sr6Character, type Sr6Npc, type Sr6NpcKind } from '../model/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../model/types'
import type { Sr6Data } from './data'
import { normName } from './names'
import { atLevel } from './levels'
import { formula } from './values'

export const NPC_KINDS: Record<
  Sr6NpcKind,
  { label: string; kind: 'npcs' | 'critters' | 'spirits' | 'sprites'; rating?: { label: 'Professional Rating' | 'Force' | 'Level'; letter?: 'F' | 'L' } }
> = {
  grunt: { label: 'Grunt', kind: 'npcs', rating: { label: 'Professional Rating' } },
  contact: { label: 'Contact', kind: 'npcs' },
  critter: { label: 'Critter', kind: 'critters' },
  spirit: { label: 'Spirit', kind: 'spirits', rating: { label: 'Force', letter: 'F' } },
  sprite: { label: 'Sprite', kind: 'sprites', rating: { label: 'Level', letter: 'L' } },
}

/** The standard stat keys in stat-block order, with their labels. */
export const NPC_STATS: [string, string][] = [
  ['bod', 'BOD'],
  ['agi', 'AGI'],
  ['rea', 'REA'],
  ['str', 'STR'],
  ['wil', 'WIL'],
  ['log', 'LOG'],
  ['int', 'INT'],
  ['cha', 'CHA'],
  ['edg', 'EDG'],
  ['ess', 'Essence'],
  ['mag', 'Magic'],
  ['res', 'Resonance'],
  ['attack', 'Attack'],
  ['sleaze', 'Sleaze'],
  ['data', 'Data Processing'],
  ['firewall', 'Firewall'],
  ['dr', 'Defense Rating'],
  ['init', 'Initiative'],
  ['actions', 'Actions'],
  ['cm', 'Condition monitor'],
  ['move', 'Movement'],
]
const NOT_STATS = new Set(['category', 'rating', 'group'])
const SPIRIT_ATTRS = new Set(['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'ess', 'mag'])
const PARTS = new Set<string>(SR6_NPC_PARTS)

/** The NPC kind of a catalog entry: an npcs entry is a grunt, or a contact when it is one of the book's sample contacts
 *  (group Contact, no Professional Rating: importer/sr6/recipes/crb.py contact()). */
export const npcKindOf = (e: Sr6Entry): Sr6NpcKind => {
  if (e.kind === 'npcs') return e.attrs.group === 'Contact' && !e.attrs.rating ? 'contact' : 'grunt'
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
  const kind = npcKindOf(e)
  const ch = blankSr6Npc(kind, kind === 'grunt' ? Number(e.attrs.rating) || undefined : rating, now)
  const stats = Object.entries(e.attrs).filter(([k, v]) => !NOT_STATS.has(k) && /^[a-z]{1,20}$/.test(k) && v.length <= 80)
  ch.npc = {
    ...ch.npc!,
    ...(kind === 'grunt' && e.attrs.group ? { group: e.attrs.group } : {}),
    from: { kind: e.kind, id: e.id, name: e.name, source: e.source, page: e.page },
    stats: Object.fromEntries(stats),
    lines: e.parts.filter(p => PARTS.has(p.tag)).map(p => ({ part: p.tag, text: p.text })),
  }
  ch.identity.streetName = e.name
  return ch
}

/** The key a book NPC is loaded under (Sr6Character.sampleKey). */
export const bookNpcKey = (e: Sr6Entry) => `${e.source}|${e.id}`

/** Sources in publication order (sources.xml published, then cat, then id), as a comparator of source ids; a source with
 *  no date (a GM's compendium, an imported book the app doesn't ship) last. */
export function byPublication(sources: Sr6Catalog['sources']): (a: string, b: string) => number {
  const key = (id: string) => [sources.get(id)?.published ?? '9999-99', sources.get(id)?.cat ?? '~', id] // ~ after any CAT number
  return (a, b) => {
    const x = key(a),
      y = key(b),
      i = x.findIndex((v, n) => v !== y[n])
    return i < 0 ? 0 : x[i] < y[i] ? -1 : 1
  }
}

/** A book NPC's stat block: everything but its id, source, page, name and description. */
const statBlock = (e: Sr6Entry) => {
  const sorted = (o: Record<string, string>) => Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))
  return JSON.stringify([sorted(e.attrs), e.parts.map(p => [p.tag, sorted(p.attrs), p.text.replace(/\s+/g, ' ').trim()])])
}

/** One version of a book NPC: the entries that print the same stat block, earliest first, and the name it loads under. */
export interface BookNpcVersion {
  name: string
  entries: Sr6Entry[]
}
/** The book NPCs as versions: per NPC kind and name (normName: case and punctuation don't count), each distinct stat block
 *  once, with every entry that prints it, earliest published first. A name printed with one stat block keeps its name;
 *  with several, each is "<Name> #1", "#2"… in the order its earliest printing came out. */
export function bookNpcVersions(entries: Sr6Entry[], sources: Sr6Catalog['sources']): BookNpcVersion[] {
  const order = byPublication(sources)
  const first = (a: Sr6Entry, b: Sr6Entry) => order(a.source, b.source) || a.page - b.page || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const groups = new Map<string, Map<string, Sr6Entry[]>>()
  for (const e of [...entries].sort(first)) {
    const g = `${npcKindOf(e)}|${normName(e.name)}`,
      v = statBlock(e),
      vs = groups.get(g) ?? new Map<string, Sr6Entry[]>()
    groups.set(g, vs.set(v, [...(vs.get(v) ?? []), e]))
  }
  return [...groups.values()].flatMap(vs => {
    const all = [...vs.values()]
    return all.map((es, i) => ({ name: all.length > 1 ? `${all[0][0].name} #${i + 1}` : es[0].name, entries: es }))
  })
}

/** The Force or Level Load book NPCs gives a spirit or sprite whose entry prints none (R: a default; the GM changes it on
 *  the Stat block tab). */
export const BOOK_NPC_RATING = 3
/** Load book NPCs' copy of an entry, under its book key: a spirit or sprite at the rating its entry prints, else
 *  BOOK_NPC_RATING. */
export function bookNpc(e: Sr6Entry, now?: string): Sr6Character {
  const letter = NPC_KINDS[npcKindOf(e)].rating?.letter
  return { ...npcFromEntry(e, letter ? Number(e.attrs.rating) || BOOK_NPC_RATING : undefined, now), sampleKey: bookNpcKey(e) }
}

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
  const bare = NPC_KINDS[npc.kind].rating?.letter ? (npc.rating ?? null) : null
  return (npc.lines.find(l => l.part === 'skills')?.text ?? '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean)
    .map(printed => {
      // the regex backtracks quadratically on a long run of spaces: a skill longer than 100 characters is printed as it is
      // `Name N`, the book's `Name N(A)` (augmented) and `Name N (Specialization +2)`: the rank is N
      const m = printed.length <= 100 ? printed.match(/^(.*?)\s+(\d+)(?:\s*\(\d+\))?(?:\s*\([^()]*\))*$/) : null
      const name = m ? m[1] : printed,
        rating = m ? Number(m[2]) : bare
      const skill = byName.get(normName(name))
      if (!skill) return { name, rating, printed }
      const v = values.get(skill.attr)
      const attr = v?.ok && /^\d+$/.test(v.value) ? Number(v.value) : null
      return { name: skill.name, rating, attr: skill.attr, ...(rating != null && attr != null ? { pool: rating + attr } : {}), printed }
    })
}

/** The NPC block's headline: "Grunt, Professional Rating 2 · Street Crew", "Spirit, Force 4", "Sprite, Level 3", "Critter",
 *  "Contact". */
export function npcHeadline(npc: Sr6Npc): string {
  const k = NPC_KINDS[npc.kind]
  return (
    [k.label, k.rating && npc.rating != null && `${k.rating.label} ${npc.rating}`].filter(Boolean).join(', ') +
    (npc.kind === 'grunt' && npc.group ? ` · ${npc.group}` : '')
  )
}

/** A skill as the NPC block prints it: "Gab 5 (pool 10)", or as printed when it has no pool. */
export const poolText = (p: ReturnType<typeof npcPools>[number]) =>
  p.pool != null ? `${p.name}${p.rating != null ? ` ${p.rating}` : ''} (pool ${p.pool})` : p.printed

const PART_LABELS: Record<(typeof SR6_NPC_PARTS)[number], string> = {
  skills: 'Skills',
  powers: 'Powers',
  optionalPowers: 'Optional powers',
  weaknesses: 'Weaknesses',
  attacks: 'Attacks',
  augmentations: 'Augmentations',
  gear: 'Gear',
  weapons: 'Weapons',
}
/** The line parts a kind uses, with their labels: a sprite has skills and powers, the others every part. */
export const npcParts = (kind: Sr6NpcKind): [string, string][] =>
  SR6_NPC_PARTS.filter(p => kind !== 'sprite' || p === 'skills' || p === 'powers').map(p => [p, PART_LABELS[p]])

/** What an NPC's stat block prints for one weapon, attack, piece of gear, augmentation or power: the catalog entry it is
 *  (its printed level's), or none and the kind it is built as; the stat block's own numbers, which win over the entry's
 *  (an attack's DV and attack ratings worked out at the NPC's Force); and its `w/` accessories the catalog has. */
export interface Sr6NpcThing {
  part: string
  printed: string
  name: string
  kind: Sr6Kind
  entry?: Sr6Entry
  /** a weapon's printed category or skill (`Heavy Pistol`, `Close Combat`) and its DV as printed */
  category?: string
  dvText?: string
  values: { rating?: number; dv?: number; stun?: boolean; ar?: (number | null)[]; modes?: string[]; ammo?: number; defense?: number }
  accessories: Sr6NpcThing[]
}
/** The line parts that hold things, and the catalog kinds a thing on one is looked for in, the first kind first. */
const THING_KINDS: Record<string, Sr6Kind[]> = {
  weapons: ['weapons'],
  attacks: ['weapons'],
  gear: ['gear', 'electronics', 'armor', 'programs', 'vehicles', 'weapons'],
  augmentations: ['augmentations'],
}
const POWER_KINDS: Record<'being' | 'person', Sr6Kind[]> = {
  being: ['critterpowers', 'adeptpowers', 'spells', 'complexforms'],
  person: ['adeptpowers', 'critterpowers', 'spells', 'complexforms'],
}
const ACCESSORY_KINDS: Sr6Kind[] = ['weapons', 'armor', 'electronics', 'gear', 'augmentations', 'programs']
const ATTACK_SKILLS = new Set(['close combat', 'exotic weapons', 'firearms', 'athletics'])

/** `s` split at its commas outside any bracket; trimmed, empties dropped. */
function top(s: string): string[] {
  const out = ['']
  let depth = 0
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === ',' && !depth) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map(x => x.trim()).filter(Boolean)
}
/** five attack rating bands: `10/8/6/—/—`, `(F x 2) +4/—/—/—/—`, `8/2*` (a footnote mark), `6(8)` (with a focus) */
const BAND = String.raw`(?:\d+(?:\(\d+\))?\*?|[—–-])`
const AR_SRC = String.raw`(?:\(F\s*[x×*]\s*\d+\)\s*(?:[+-]\s*\d+)?|${BAND})(?:\s*\/\s*${BAND}){4}`
const AR_RUN = new RegExp(AR_SRC, 'g'),
  HAS_AR = new RegExp(AR_SRC)
const CLOSES: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
/** The top-level bracket groups of `s` as [opening index, closing index]: a closer closes the nearest opener of its own
 *  kind (an opener left open inside it closes with it: `[(DV 8S + Fatigue I, …]`); a stray closer counts for nothing. */
function groups(s: string): [number, number][] {
  const out: [number, number][] = [],
    stack: { ch: string; at: number }[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ('([{'.includes(ch)) stack.push({ ch, at: i })
    else if (CLOSES[ch]) {
      const k = stack.map(x => x.ch).lastIndexOf(CLOSES[ch])
      if (k < 0) continue
      if (k === 0) out.push([stack[0].at, i])
      stack.length = k
    }
  }
  return out
}
/** A weapons or attacks line split into its things: after each top-level `[…]` (`Bite [DV 2P, 8/—/—/—/—] Claws […]`)
 *  or `(…)` holding attack ratings (`Beretta (2P, SA, 9/8/6/—/—) Shotgun (…)`), after each run of attack ratings printed
 *  without one (`Bite 2P, 6/—/—/—/— Claw 1P, 4/—/—/—/—`), else at semicolons and at commas (but `Bite: DV 4P, Attack
 *  Rating 9` stays one). What follows a `**` or ` // ` (book text the reader ran on with) is left out. */
export function splitThings(text: string): string[] {
  const s = text.split(/\*\*|\s\/\/\s/)[0]
  const out: string[] = []
  const loose = (t: string) => {
    let at = 0
    for (const m of t.matchAll(AR_RUN)) {
      out.push(t.slice(at, m.index + m[0].length))
      at = m.index + m[0].length
    }
    for (const chunk of t.slice(at).split(';')) out.push(...(/:\s*(?:DV\s*)?\d|^\S.*?\s\d+\s*[PS]\b/i.test(chunk) ? [chunk] : top(chunk)))
  }
  let at = 0
  for (const [open, close] of groups(s)) {
    if (s[open] !== '[' && !(s[open] === '(' && HAS_AR.test(s.slice(open, close)))) continue
    // the group's thing is named by what follows the last comma or attack-rating run before it
    const head = s.slice(at, open)
    const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf(';'), ...[...head.matchAll(AR_RUN)].map(m => m.index + m[0].length - 1))
    if (cut >= 0) loose(head.slice(0, cut + 1))
    out.push(s.slice(at + cut + 1, close + 1))
    at = close + 1
  }
  loose(s.slice(at))
  return out.map(x => x.replace(/^[\s,;]+|[\s,;]+$/g, '')).filter(x => x && x.length <= 200)
}

/** A printed number, or a formula of the NPC's Force at its rating (`(Force/2) + 2`, `(F x 2) +4`); null when it can't
 *  be read. */
function valueAt(s: string, rating: number | undefined): number | null {
  let t = s
    .replace(/\bForce\b/gi, 'F')
    .replace(/\*/g, '')
    .trim()
  if (/^\d+$/.test(t)) return Number(t)
  // a closing bracket the book left over: `(F x 2) – 8)`
  while ((t.match(/\)/g) ?? []).length > (t.match(/\(/g) ?? []).length) t = t.replace(/\)\s*$/, '').trim()
  if (rating == null || !/\bF\b/.test(t)) return null
  const f = formula(t, rating, 'F')
  return f.ok && f.dice == null ? f.n : null
}
/** A thing's name and its stat pieces: those of the bracket it ends with (`[…]`; gear's `Armor jacket (+4)`), or what
 *  follows its name when it has none (`Bite: DV 19P, 38/—/—/—/—`, `Claws 2P, 11/—/—/—/—`). */
function pieces(printed: string): { name: string; stats: string[] } {
  const last = groups(printed).at(-1)
  if (last && last[0] > 0 && last[1] === printed.length - 1)
    return { name: printed.slice(0, last[0]).trim(), stats: top(printed.slice(last[0] + 1, -1).replace(/^\(\s*(?=DV)/i, '')) }
  const bare = printed.length <= 200 ? printed.match(/^(.+?)(?::\s*|\s+(?=(?:DV\s*)?\d+\s*\(?[PS]\b))(.*\d.*)$/i) : null
  return bare ? { name: bare[1].trim(), stats: top(bare[2]) } : { name: printed, stats: [] }
}
/** A thing's printed stats: its category, DV, attack ratings, firing modes, ammo, rating, Defense and `w/` accessories. */
function readStats(stats: string[], rating: number | undefined) {
  const v: Sr6NpcThing['values'] = {},
    accessories: string[] = []
  let category: string | undefined,
    dvText: string | undefined,
    fitted = false
  // a category and DV printed without a comma (`Light Pistol DV 2S(e)`), accessories after a run without one (`8/8/6/—/— w/ …`)
  const all = stats.flatMap(p => p.split(/\s+(?=DV\b)|\s+(?=w\/)|\s*;\s*/i))
  all.forEach((raw, i) => {
    const t = raw.replace(/^\(+(?=DV)/i, '').trim()
    let m: RegExpMatchArray | null
    if ((m = t.match(/^(?:w\/|with\s)\s*(.+)$/i))) {
      fitted = true
      accessories.push(...m[1].split(/\s+(?:and|&)\s+|\s*\+\s*/i))
    } else if (v.dv == null && !dvText && (m = t.match(/^(?:DV\s*)?(\[[^\]]*\]|\([^)]*\)|\d+)\s*\(?([PS])\)?(?![a-z])/i))) {
      dvText = t.replace(/^DV\s*/i, '')
      const n = valueAt(m[1].replace(/^[[(]|[\])]$/g, ''), rating)
      if (n != null) Object.assign(v, { dv: n, stun: m[2].toUpperCase() === 'S' })
    } else if (!v.ar && (m = t.match(/^(?:AR|Attack Ratings?)\s*:?\s*(\d+)$/i))) v.ar = [Number(m[1]), null, null, null, null]
    else if (!v.ar && (m = t.match(/^(?:AR|Attack Ratings?)?\s*([^/]*(?:\/[^/]*){4})$/i))) {
      // a band's footnote mark, focus bonus (`6(8)`) or note (`— (Venom)`) aside
      // a band's footnote mark, focus bonus (`6(8)`) or note (`— (Venom)`) aside; a band at 0 or less is none
      const bands = m[1].split('/').map(b => {
        const n = /\d|\bF\b/.test(b) ? valueAt(b.replace(/\(\d+\)|\s\((?!F\b).*$/g, ''), rating) : null
        return n != null && n > 0 ? n : null
      })
      if (bands.some(b => b != null)) v.ar = bands
    } else if (/^(SS|SA|BF|FA)(\s*\/\s*(SS|SA|BF|FA))*$/i.test(t)) v.modes = t.toUpperCase().split(/\s*\/\s*/)
    else if ((m = t.match(/^(\d+)\s*\(?[a-z]{1,2}\)?$/i))) v.ammo = Number(m[1])
    else if ((m = t.match(/^(?:R|Rating)\s*:?\s*(\d+)$/i))) v.rating = Number(m[1])
    else if ((m = t.match(/^(?:DR\s*\+?\s*(\d+)|\+\s*(\d+)\s*(?:DR)?)$/i))) v.defense = Number(m[1] ?? m[2])
    else if (i === 0 && /^[a-z][a-z -]{1,30}$/i.test(t)) category = t
    else if (fitted && !/\d/.test(t)) accessories.push(t)
  })
  return { values: v, category, dvText, accessories: accessories.map(a => a.trim()).filter(Boolean) }
}

/** per catalog: `<kind>/<normName>` -> the entries of that kind with that name, catalog order */
const byName = new WeakMap<Sr6Catalog['entries'], Map<string, Sr6Entry[]>>()
/** The catalog entry a printed name is, in `kinds` (the first kind with one wins), the NPC's own book's before another
 *  book's; failing the name as printed, without its trailing note (`Khopesh (Weapon Foci +2)`) or footnote mark. */
function findEntry(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string): Sr6Entry | undefined {
  let index = byName.get(c.entries)
  if (!index) {
    index = new Map()
    for (const [k, map] of Object.entries(c.entries))
      for (const e of map.values()) {
        const key = `${k}/${normName(e.name)}`
        index.set(key, [...(index.get(key) ?? []), e])
      }
    // a rated family's name (`Glow Eyes`, its levels `Glow Eyes 1`…): its lowest level
    for (const f of c.levels?.values() ?? []) {
      const key = `${f.kind}/${normName(f.parent?.name ?? '')}`,
        e = f.parent && c.entries[f.kind].get(f.levels.get(Math.min(...f.levels.keys()))!)
      if (e && !index.has(key)) index.set(key, [e])
    }
    byName.set(c.entries, index)
  }
  for (const n of [name, name.replace(/\s*\([^()]*\)\s*$/, ''), name.replace(/\*+$/, '')])
    for (const k of kinds) {
      const list = index.get(`${k}/${normName(n)}`)
      if (list?.length) return list.find(e => e.source === source) ?? list[0]
    }
  return undefined
}

/** The things an NPC's weapons, attacks, gear, augmentations and powers lines print, each its catalog entry where the
 *  catalog has one (a level by its printed number: `Improved Reflexes 2` is that level's entry), else built from what is
 *  printed: an attack printing a DV (read or not) or attack ratings as a weapon, gear with a printed Defense as armor,
 *  other gear as gear, an augmentation as one, a power as a critter power. A weapon or attack with none of those and no
 *  entry, or a Cybercombat one, is left out (its line stays in the notes). The printed numbers are kept (values), worked
 *  out at the NPC's rating where they use its Force. */
export function npcThings(npc: Sr6Npc, c: Sr6Catalog): Sr6NpcThing[] {
  const src = npc.from?.source,
    powers = POWER_KINDS[npc.kind === 'grunt' || npc.kind === 'contact' ? 'person' : 'being']
  const out: Sr6NpcThing[] = []
  for (const l of npc.lines) {
    const power = l.part === 'powers' || l.part === 'optionalPowers',
      attack = l.part === 'weapons' || l.part === 'attacks'
    const kinds = power ? powers : THING_KINDS[l.part]
    if (!kinds) continue
    for (const printed of attack ? splitThings(l.text) : top(l.text)) {
      const { name, stats } = power ? { name: printed, stats: [] } : pieces(printed)
      const s = readStats(stats, npc.rating)
      let entry = findEntry(c, name, kinds, src)
      // a trailing number is its rating or level: `white noise generator 3`, `Hardened Armor (4)`
      const lv = name.match(/^(.*?)\s*(?:\((\d{1,2})\)|\s(\d{1,2}))$/)
      if (lv && (!entry || normName(entry.name) === normName(lv[1]))) {
        entry ??= findEntry(c, lv[1], kinds, src)
        s.values.rating ??= Number(lv[2] ?? lv[3])
      }
      // the printed level's own entry: `Glow Eyes [rating 2]` is Glow Eyes 2, `control rig [rating 2]` Control Rig 2
      if (s.values.rating != null)
        entry = entry ? (atLevel(c, entry.kind, entry.id, s.values.rating) ?? entry) : findEntry(c, `${name} ${s.values.rating}`, kinds, src)
      // (a Cybercombat attack is a Matrix action, not a weapon)
      if (!entry && attack && ((s.values.dv == null && !s.values.ar && !s.dvText) || /cybercombat/i.test(s.category ?? ''))) continue
      const kind: Sr6Kind = entry
        ? entry.kind
        : attack
          ? 'weapons'
          : power
            ? 'critterpowers'
            : l.part === 'augmentations'
              ? 'augmentations'
              : s.values.defense != null
                ? 'armor'
                : 'gear'
      const accessories = s.accessories.flatMap(a => {
        const e = findEntry(c, a, ACCESSORY_KINDS, src)
        return e ? [{ part: l.part, printed: a, name: e.name, kind: e.kind, entry: e, values: {}, accessories: [] }] : []
      })
      out.push({
        part: l.part,
        printed,
        name: entry?.name ?? name.replace(/\*+$/, ''),
        kind,
        ...(entry ? { entry } : {}),
        ...(s.category ? { category: s.category } : {}),
        ...(s.dvText ? { dvText: s.dvText } : {}),
        values: s.values,
        accessories,
      })
    }
  }
  return out
}
/** A built attack's skill: the one it prints as its category; none when its category is a weapon class (`Heavy Pistol`:
 *  the class says); with no category, Exotic Weapons when it reaches past close range (an elemental attack), else Close
 *  Combat. */
export function attackSkill(t: Pick<Sr6NpcThing, 'category' | 'values'>): string | undefined {
  if (t.category) return ATTACK_SKILLS.has(t.category.toLowerCase()) ? t.category : undefined
  return (t.values.ar ?? []).slice(1).some(b => b != null) ? 'Exotic Weapons' : 'Close Combat'
}

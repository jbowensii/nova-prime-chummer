// SR6 NPCs (S3): a grunt, contact, critter, spirit or sprite is an SR6 runner file with an <npc> block and a blank build. Its stat
// block is a copy of the catalog entry's printed values and its rating (Professional Rating, Force or Level), read at
// that rating with formula(); its skills line gives dice pools against the catalog's skills. No book numbers here.
import { blankSr6, SR6_NPC_PARTS, type Sr6Character, type Sr6Npc, type Sr6NpcKind } from '../../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { matchKey, nameRatio, normName, quickRatio } from '../../../catalog/domain/names'
import { atLevel } from '../../../catalog/domain/levels'
import { formula, rated } from '../../../catalog/domain/values'

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
  spells: 'Spells',
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
  /** how it found its entry (none: built) */
  match?: Sr6NpcMatch
  /** how many (a weapon's ammunition: its two loads in rounds) */
  qty?: number
  /** an attack printed with stats the app can't roll (Cybercombat, a DV it can't read): kept as a note item */
  unread?: true
  /** a power's parameters as printed, apart from its name and rating: `Cold, Fire, Toxins` of `Immunity (Cold, Fire, Toxins)` */
  detail?: string
  /** its name as printed (`name` is its entry's when it has one) */
  printedName?: string
  /** the link is an owner ruling (not a guess): the notes say so */
  ruled?: true
  /** an augmentation's grade as printed (`betaware`, a line's `(all deltaware)`): alpha, beta, gamma or delta */
  grade?: string
  /** ammunition: the name of the weapon it is for */
  ammoFor?: string
  /** ammunition: the rounds in one load (it is `qty` of them: two loads, or a bow's 20), or a spare clip, speed loader or magazine */
  load?: number
  spare?: true
  accessories: Sr6NpcThing[]
}
/** The line parts that hold things, and the catalog kinds a thing on one is looked for in, the first kind first. */
const THING_KINDS: Record<string, Sr6Kind[]> = {
  weapons: ['weapons'],
  attacks: ['weapons'],
  gear: ['gear', 'electronics', 'armor', 'programs', 'vehicles', 'weapons'],
  augmentations: ['augmentations'],
}
// (a stat block's power the books define as a quality or a bioware, `Built Tough`, `Manasense`: after the powers)
const POWER_KINDS: Record<'being' | 'person', Sr6Kind[]> = {
  being: ['critterpowers', 'adeptpowers', 'spells', 'complexforms', 'qualities', 'augmentations'],
  person: ['adeptpowers', 'critterpowers', 'spells', 'complexforms', 'qualities', 'augmentations'],
}
const DEVICES = new Set<Sr6Kind>(['electronics', 'augmentations', 'programs'])
/** an attack's printed category that makes it a natural one */
const NATURAL = /close combat|unarmed|natural|exotic weapons/i
/** an attack's printed stats: a bracket, a DV, an attack rating, a damage (`4P`) or range bands (`9/—`) */
const STAT_SIGN = /\[|\bDV\b|\bAR\b|attack ratings?|\d\s*[PS]\b|\d\s*\/\s*(?:\d|[—–-])/i
const DEVICE_NAME = /commlink|deck|console|\brcc\b|cyberjack|motorcycle|\bbike\b|trike/i
const SPELL_KINDS: Sr6Kind[] = ['spells', 'rituals']
const ACCESSORY_KINDS: Sr6Kind[] = ['weapons', 'armor', 'electronics', 'gear', 'augmentations', 'programs', 'licencetypes']
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
    grade: string | undefined,
    count: number | undefined,
    fitted = false
  // a category and DV printed without a comma (`Light Pistol DV 2S(e)`), accessories after a run without one (`8/8/6/—/— w/ …`)
  const all = stats.flatMap(p => p.split(/\s+(?=DV\b)|\s+(?=w\/)|\s*;\s*/i))
  let licences = false
  all.forEach((raw, i) => {
    const t = raw.replace(/^\(+(?=DV)/i, '').trim()
    let m: RegExpMatchArray | null
    // (`licenses: augmentations, RCC`: each word after the colon a licence, until something else)
    if ((m = t.match(/^licen[sc]es?\s*:\s*(.+)$/i)) || (licences && /^[a-z][\w -]*$/i.test(t) && !/^(?:rating|dr|w)\b/i.test(t) && (m = [t, t]))) {
      licences = true
      accessories.push(...m[1].split(/\s+(?:and|&)\s+/i).map(x => `${x.trim()} license`))
      return
    }
    licences = false
    if ((m = t.match(/^(?:w\/|with\s)\s*(.+)$/i))) {
      fitted = true
      accessories.push(...m[1].split(/\s+(?:and|&)\s+|\s+\+\s+/i))
    } else if (v.dv == null && !dvText && (m = t.match(/^(?:DV\s*)?(\[[^\]]*\]|\([^)]*\)|F(?:\s*[x×*/+\-–]\s*\d+)*|\d+)\s*\(?([PS])\)?(?![a-z])/i))) {
      // a number, a bracketed formula, or a bare one of the Force (`F/2P`, `F + 2 S`, `F x2P`): dv only when it reads
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
    else if ((m = t.match(/^(?:R|(?:Device\s+)?Rating)\s*:?\s*(\d+)$/i))) v.rating = Number(m[1])
    else if ((m = t.match(/^(?:(?:DR|Defense(?:\s+Rating)?)\s*\+?\s*(\d+)|\+\s*(\d+)\s*(?:DR|Defense(?:\s+Rating)?)?)$/i))) v.defense = Number(m[1] ?? m[2])
    else if ((m = t.match(GRADE))) grade = m[1].toLowerCase()
    else if ((m = t.match(/^x\s*(\d+)$/i))) count = Number(m[1])
    else if (i === 0 && /^[a-z][a-z -]{1,30}$/i.test(t)) category = t
    else if (fitted && (!/\d/.test(t) || /^[a-z-]+(?:\s[a-z-]+){0,2}\s\d{1,2}$/i.test(t))) accessories.push(t)
  })
  return { values: v, category, dvText, grade, count, accessories: accessories.map(a => a.trim()).filter(Boolean) }
}

/** The least nameRatio of a printed name and a catalog entry's (their matchKeys) that links them (owner 2026-10-20: "75%
 *  guesses are fine for matching"; first "If you can find a perfect match, great. If not, 85% match will do"). */
export const NPC_MATCH = 0.75
/** How a stat block thing found its entry: by name (score 1), by a name at least NPC_MATCH alike, as a standard item
 *  (owner: "when in doubt use standard ammo, grenades, etc."), or as the regular ammunition of a weapon it carries. */
export type Sr6NpcMatch = { score: number; how: 'exact' | 'fuzzy' | 'standard' | 'ammo' }
interface Index {
  exact: Map<string, Sr6Entry[]>
  /** per kind: each matchKey with its entries */
  loose: Map<Sr6Kind, { key: string; entries: Sr6Entry[] }[]>
  /** per kind: each category's matchKey with its entries */
  categories: Map<Sr6Kind, Map<string, Sr6Entry[]>>
  /** gear and weapons by class (`AMMUNITION/BOWS`) */
  classes: Map<string, Sr6Entry[]>
  /** entries of three words or more by their initials (`bdu`: Basic Duty Utilities) */
  initials: Map<string, Sr6Entry[]>
  /** gear and augmentations named by the variant inside their name (`savior system`), nanites first */
  mids: Map<string, Sr6Entry[]>
  /** per kind: each entry with the words of its name, category and type (coveredBy) */
  words?: Map<Sr6Kind, { e: Sr6Entry; have: Set<string> }[]>
  /** the gear kinds' entries by normalised name (expandStuff) */
  norms?: { e: Sr6Entry; n: string }[]
}
const indexes = new WeakMap<Sr6Catalog['entries'], Index>()
function indexOf(c: Sr6Catalog): Index {
  let x = indexes.get(c.entries)
  if (x) return x
  x = { exact: new Map(), loose: new Map(), categories: new Map(), classes: new Map(), initials: new Map(), mids: new Map() }
  const add = <K>(m: Map<K, Sr6Entry[]>, k: K, e: Sr6Entry) => m.set(k, [...(m.get(k) ?? []), e])
  const loose = new Map<Sr6Kind, Map<string, Sr6Entry[]>>()
  const each = (k: Sr6Kind, name: string, e: Sr6Entry) => {
    add(x!.exact, `${k}/${normName(name)}`, e)
    add(loose.get(k) ?? loose.set(k, new Map()).get(k)!, matchKey(name), e)
  }
  for (const [k, map] of Object.entries(c.entries) as [Sr6Kind, Map<string, Sr6Entry>][])
    for (const e of map.values()) {
      each(k, e.name, e)
      if (e.attrs.category) add(x.categories.get(k) ?? x.categories.set(k, new Map()).get(k)!, matchKey(e.attrs.category), e)
      if (e.attrs.class && (k === 'gear' || k === 'weapons')) add(x.classes, e.attrs.class, e)
      const words = normName(e.name)
        .split(' ')
        .filter(w => !['and', 'of', 'the'].includes(w))
      if (words.length >= 3) add(x.initials, words.map(w => w[0]).join(''), e)
      // (and without a leading brand: `AAS` is `Securetech Armor Augmentation System`)
      if (words.length >= 4)
        add(
          x.initials,
          words
            .slice(1)
            .map(w => w[0])
            .join(''),
          e,
        )
    }
  // a variant named alone is the entry's (`Reakt`: Genotype Enhancement (Reakt); `Savior System`: Therapeutic Nanites (Savior
  // System) Nanites, the nanites before the colony): inside an entry's name, or of an augmentation family of three or more;
  // none when two families have it (`Plastic`, `Large`)
  const family = new Map<string, number>()
  const fam = (e: Sr6Entry) => e.name.match(/^(.*?)\s*\(([^()]+)\)$/)
  for (const e of c.entries.augmentations?.values() ?? []) {
    const m = fam(e)
    if (m) family.set(matchKey(m[1]), (family.get(matchKey(m[1])) ?? 0) + 1)
  }
  const raw: [string, string, Sr6Entry][] = []
  for (const k of ['gear', 'augmentations'] as const)
    for (const e of c.entries[k]?.values() ?? []) {
      const mid = e.name.match(/^(.*?)\s*\(([^()]+)\)\s+\S+$/),
        end = k === 'augmentations' ? fam(e) : null
      if (mid) raw.push([mid[2], matchKey(mid[1]), e])
      else if (end && (family.get(matchKey(end[1])) ?? 0) >= 3 && /[a-z]{4}/i.test(end[2]) && !/^(?:rating|level)/i.test(end[2]))
        raw.push([end[2], matchKey(end[1]), e])
    }
  // (every family that has the variant counts, small or large)
  const stems = new Map<string, Set<string>>()
  const seen = (v: string, stem: string) => stems.set(matchKey(v), (stems.get(matchKey(v)) ?? new Set()).add(stem))
  for (const [v, stem] of raw) seen(v, stem)
  for (const e of c.entries.augmentations?.values() ?? []) {
    const m = fam(e)
    if (m) seen(m[2], matchKey(m[1]))
  }
  for (const [v, , e] of raw.sort((a, b) => Number(/nanites$/i.test(b[2].name)) - Number(/nanites$/i.test(a[2].name))))
    if (stems.get(matchKey(v))!.size === 1) add(x.mids, matchKey(v), e)
  // a rated family's name (`Glow Eyes`, its levels `Glow Eyes 1`…): its lowest level
  for (const f of c.levels?.values() ?? []) {
    const e = f.parent && c.entries[f.kind].get(f.levels.get(Math.min(...f.levels.keys()))!)
    if (e && !x.exact.has(`${f.kind}/${normName(f.parent!.name)}`)) each(f.kind, f.parent!.name, e)
  }
  for (const [k, m] of loose)
    x.loose.set(
      k,
      [...m].map(([key, entries]) => ({ key, entries })),
    )
  indexes.set(c.entries, x)
  return x
}
/** Of entries that match alike: the NPC's own book's, then the latest printing's (owner: the current printing wins),
 *  then catalog order. */
const prefer = (c: Sr6Catalog, source: string | undefined) => {
  const order = byPublication(c.sources)
  return (list: Sr6Entry[]) => [...list].sort((a, b) => Number(b.source === source) - Number(a.source === source) || order(b.source, a.source))[0]
}
/** The catalog entry a printed name is, in `kinds`: by name (as printed, without its trailing note `Khopesh (Weapon Foci
 *  +2)` or footnote mark; the first kind with one wins); else the entry whose name is most alike, at least NPC_MATCH
 *  (matchKey, nameRatio, and sameWords; the first kind wins a tie; `how` loose or standard); else, with `standard`, the standard item of the category a generic
 *  name is (`commlink`: the category Commlinks' lowest rated, then cheapest entry). Ties: the NPC's own book, then the
 *  latest printing. */
function findEntry(
  c: Sr6Catalog,
  name: string,
  kinds: Sr6Kind[],
  source?: string,
  how: 'exact' | 'loose' | 'standard' = 'exact',
  rating?: number,
): { entry: Sr6Entry; match: Sr6NpcMatch } | undefined {
  const x = indexOf(c),
    pick = prefer(c, source)
  for (const n of [name, name.replace(/\s*\([^()]*\)\s*$/, ''), name.replace(/\*+$/, '')])
    for (const k of kinds) {
      const list = x.exact.get(`${k}/${normName(n)}`)
      if (list?.length) return { entry: pick(list), match: { score: 1, how: 'exact' } }
    }
  const key = matchKey(name)
  if (how === 'exact' || key.length < 3) return undefined
  // the same name but for its plural, its rating or its note (`data taps`: Data tap) is that entry, before any guess at a type
  for (const k of kinds) {
    const same = x.loose.get(k)?.find(l => l.key === key)
    if (same) return { entry: pick(same.entries), match: { score: 1, how: 'fuzzy' } }
  }
  const words = key.split(' '),
    head = words[words.length - 1],
    rest = words.slice(0, -1)
  // a guess's score: its name against the entry's, or without its type word (`Erika Elite commlink`: `Erika Elite`, 1)
  const standard = (entry: Sr6Entry) => {
    const ek = matchKey(entry.name),
      score = round(Math.max(nameRatio(key, ek), rest.length ? nameRatio(rest.join(' '), ek) : 0))
    return { entry, match: { score, how: score >= NPC_MATCH ? ('fuzzy' as const) : ('standard' as const) } }
  }
  // its type: its last word is a category's last word (`smoke grenade`, `Yamaha Rapier motorcycle`, `commlink`): that
  // category's entries and the entries of its kinds with that word in their names
  const ofType =
    how === 'standard' && head.length >= 3 && !KIND_WORDS.test(head)
      ? kinds.flatMap(k =>
          [...(x.categories.get(k) ?? [])]
            .filter(([ck]) => ck.split(' ').at(-1) === head || (head.length >= 7 && nameRatio(head, ck.split(' ').at(-1)!) >= 0.9))
            .flatMap(([, es]) => es),
        )
      : []
  const typeKinds = [...new Set(ofType.map(e => e.kind))]
  const typed = [
    ...new Set([...ofType, ...typeKinds.flatMap(k => (x.loose.get(k) ?? []).filter(l => l.key.split(' ').includes(head)).flatMap(l => l.entries))]),
  ]
  const hits = (e: Sr6Entry) => {
    const ws = matchKey(e.name).split(' ')
    return rest.filter(w => ws.some(v => nameRatio(w, v) >= 0.85)).length
  }
  const closest = (list: Sr6Entry[]) => {
    const top = Math.max(...list.map(e => nameRatio(key, matchKey(e.name))))
    return pick(list.filter(e => nameRatio(key, matchKey(e.name)) === top))
  }
  // of its type, one with all its other words (`smoke grenade`: `Smoke/thermal smoke`)
  const whole = rest.length ? typed.filter(e => hits(e) === rest.length) : []
  if (whole.length) return standard(closest(whole))
  let best: { score: number; entries: Sr6Entry[] } | undefined
  // the name, and the name without a trailing generic word its kinds' categories are (`Erika Elite commlink`; two words
  // left at least: `Basic spacesuit` is no `Basic`)
  const cats = kinds.flatMap(k => [...(x.categories.get(k)?.keys() ?? [])])
  const keys = [key, ...cats.filter(ck => key.endsWith(` ${ck}`)).map(ck => key.slice(0, -ck.length - 1))].filter((k, i) => !i || k.includes(' '))
  // (the most alike within its type's kinds when it has one: a motorcycle is no rifle)
  for (const kk of keys)
    for (const k of typeKinds.length ? typeKinds : kinds)
      for (const l of x.loose.get(k) ?? []) {
        if (!within(kk, l.key) || quickRatio(kk, l.key) < NPC_MATCH) continue
        const score = nameRatio(kk, l.key)
        if (score >= NPC_MATCH && score > (best?.score ?? 0)) best = { score, entries: l.entries }
      }
  if (best) return { entry: pick(best.entries), match: { score: round(best.score), how: 'fuzzy' } }
  if (how !== 'standard' || KIND_WORDS.test(key)) return undefined
  // of its type, the one with most of its other words, else the type's standard item
  if (typed.length) {
    const most = Math.max(...typed.map(hits))
    if (most > 0) return standard(closest(typed.filter(e => hits(e) === most)))
    // (the name is its type alone, `commlink`: a whole match of the type)
    const entry = standardOf(ofType, pick, rating)
    return rest.length ? standard(entry) : { entry, match: { score: 1, how: 'standard' as const } }
  }
  for (const k of kinds)
    for (const [cat, entries] of x.categories.get(k) ?? []) {
      const score = !within(key, cat) || quickRatio(key, cat) < NPC_MATCH ? 0 : nameRatio(key, cat)
      if (score >= NPC_MATCH && score > (best?.score ?? 0)) best = { score, entries }
    }
  if (best) return { entry: standardOf(best.entries, pick, rating), match: { score: round(best.score), how: 'standard' as const } }
  // its last word names a kind of thing (`jammer`): of the entries whose name or category has it, the one whose other
  // words are most alike, else their standard one
  if (head.length < 3 || /^\d+$/.test(head)) return undefined
  const has = (k: string) => k.split(' ').includes(head)
  const found = new Set<Sr6Entry>()
  for (const k of kinds) {
    for (const l of x.loose.get(k) ?? []) if (has(l.key)) l.entries.forEach(e => found.add(e))
    for (const [ck, es] of x.categories.get(k) ?? []) if (has(ck)) es.forEach(e => found.add(e))
  }
  if (!found.size) return undefined
  const others = (e: Sr6Entry) =>
    matchKey(e.name)
      .split(' ')
      .filter(w => w !== head)
      .join(' ')
  const scored = [...found].map(e => ({ e, score: rest.length ? nameRatio(rest.join(' '), others(e)) : 0 }))
  const top = Math.max(...scored.map(t => t.score))
  return standard(standardOf(top > 0 ? scored.filter(t => t.score === top).map(t => t.e) : [...found], pick, rating))
}
/** a generic name that is only a kind of thing (`augmentations`, `bioware`): no standard item */
const KIND_WORDS = /^(?:augmentation|cyberware|bioware|gear|equipment|weapon|electronic|armor|power|item|thing)$/
/** head gear: a helmet, hood, mask, visor, hat or cap */
const HEAD = /\b(?:helmet|hood|mask|visor|hat|cap)\b/i
/** The standard armor for a printed Defense the catalog has no armor of that name for: an armor at that Defense, else the
 *  nearest below, else the least; its standard one (standardOf). */
function standardArmor(c: Sr6Catalog, defense: number, name = ''): Sr6Entry | undefined {
  const d = (e: Sr6Entry) => Number((e.attrs.defense ?? '').replace('+', ''))
  // (body armor for body gear, head armor for a helmet, hood or mask: no cloak, shield or glove; and the same for every NPC, whichever book it is in)
  const all = [...(c.entries.armor?.values() ?? [])].filter(
    e =>
      /^\+?\d+$/.test(e.attrs.defense ?? '') &&
      !/accessor|mod/i.test(e.attrs.category ?? '') &&
      HEAD.test(e.name) === HEAD.test(name) &&
      !/\b(?:cloak|shield|gloves?|boots?|saddle|barding|cyclewear|goggles)\b/i.test(e.name),
  )
  // (a hood is head armor of the same kind when the catalog has it)
  const word = HEAD.exec(name)?.[0].toLowerCase()
  const same = word ? all.filter(e => e.name.toLowerCase().includes(word)) : []
  if (same.length) all.splice(0, all.length, ...same)
  if (!all.length) return undefined
  const at = all.filter(e => d(e) === defense),
    below = all.filter(e => d(e) < defense)
  const list = at.length ? at : below.length ? below.filter(e => d(e) === Math.max(...below.map(d))) : all.filter(e => d(e) === Math.min(...all.map(d)))
  return standardOf(list, prefer(c, undefined))
}
/** lengths that can still reach NPC_MATCH (nameRatio is at most 2 × the shorter / both) */
const within = (a: string, b: string) => (2 * Math.min(a.length, b.length)) / (a.length + b.length) >= NPC_MATCH
const round = (n: number) => Math.round(n * 1000) / 1000
/** A category's standard item: at the printed rating when one has it, else the nearest level below it, else its lowest; then its lowest
 *  price (a price it can't read last). */
function standardOf(list: Sr6Entry[], pick: (l: Sr6Entry[]) => Sr6Entry, rating?: number): Sr6Entry {
  const level = (e: Sr6Entry) => Number(e.attrs.level ?? e.attrs.rating) || 0,
    cost = (e: Sr6Entry) => rated(e.attrs.cost, level(e) || 1).n ?? Infinity
  // (the printed rating's, else the nearest below it, else the lowest)
  const below = rating == null ? [] : list.map(level).filter(l => l > 0 && l <= rating)
  const low = list.some(e => level(e) === rating) ? rating! : below.length ? Math.max(...below) : Math.min(...list.map(level)),
    l1 = list.filter(e => level(e) === low)
  const cheap = Math.min(...l1.map(cost))
  return pick(l1.filter(e => cost(e) === cheap))
}

/** A ranged weapon's regular ammunition (owner 2026-10-20: "add regular ammo for weapons"): its class or printed category
 *  -> the catalog's ammunition class and the name of its regular kind there. Melee and natural attacks match none. */
const AMMO: [RegExp, string, RegExp][] = [
  [/\bdart\b/, 'AMMUNITION/AMMUNITION_SPECIAL', /dart/i],
  [/holdout|pistols? light|light pistol|machine pistol|\bmp\b/, 'AMMUNITION/AMMUNITION', /light pistol/i],
  [/pistols? heavy|heavy pistol|submachine|\bsmg\b/, 'AMMUNITION/AMMUNITION', /heavy pistol/i],
  [/shotgun/, 'AMMUNITION/AMMUNITION', /^shotgun/i],
  [/rifle|sniper/, 'AMMUNITION/AMMUNITION', /^rifles?$/i],
  [/\b[lmh]mg\b|machine gun/, 'AMMUNITION/AMMUNITION', /^machine gun/i],
  [/assault cannon/, 'AMMUNITION/AMMUNITION', /^assault cannon/i],
  [/taser/, 'AMMUNITION/AMMUNITION_SPECIAL', /^taser/i],
  [/crossbow/, 'AMMUNITION/CROSSBOWS', /^bolts?(?: \d+)?$/i],
  [/\bbows?\b/, 'AMMUNITION/BOWS', /^arrows?(?: \d+)?$/i],
  [/grenade launcher/, 'AMMUNITION/GRENADES', /fragmentation/i],
  [/^(?=.*launcher).*(?:rocket|missile)/, 'AMMUNITION/ROCKETS', /high explosive|^standard/i],
  [/launcher/, 'AMMUNITION/GRENADES', /fragmentation/i],
  [/flamethrower/, 'AMMUNITION/AMMUNITION_SPECIAL', /^fuel tank \(small\)/i],
]
/** a weapon's ammo as printed or catalogued: `15(c)`, `6(cy)`, `100(belt)`, `1(br-3)`; the letters are its type (not the `(e)` of a DV) */
const LOAD = /(\d+)\s*\(\s*(c|m|cy|b|br|d|ml|belt|drum|tanks?)(?:-\d+)?\s*\)/i
/** a stat block that prints its own ammunition or spare clips for a weapon: a count and an ammunition noun (`30 rounds regular ammo`,
 *  `2 spare clips`, `6 frag grenades`); a part's name alone (`extended clip`, `drum magazine`) is no ammunition */
const OWN_AMMO =
  /(?<!\bfor\s+)\b\d+\s+(?:[a-z'’-]+\s+){0,3}?(?:ammo|ammunition|rounds?|clips?|magazines?|belts?|speed ?loaders?|grenades|rockets|missiles|arrows|bolts|tanks?)\b/i
/** the catalog's named weapon accessory, preferring the NPC's book's */
function accessoryNamed(c: Sr6Catalog, name: RegExp, source: string | undefined): Sr6Entry | undefined {
  const list = [...(c.entries.weapons?.values() ?? [])].filter(e => name.test(e.name))
  return list.length ? prefer(c, source)(list) : undefined
}
/** The catalog's ammunition type a stat block names for a weapon without a count (`gel ammo`, `APDS ammo`, `caseless rounds`),
 *  looked up by its name or alias; none for `regular ammo` or a type the catalog lacks. */
function ammoTypeOf(c: Sr6Catalog, t: Sr6NpcThing, source: string | undefined): { printed: string; entry: Sr6Entry } | undefined {
  // (the stat block's parts, `w/ gel ammo` or a bare `gel rounds` the reader left in the line)
  for (const part of t.printed.slice(t.printed.lastIndexOf('[') + 1).split(/[,;]|\bw\//i)) {
    const m = /^(.+?)\s+(?:ammo|ammunition|rounds)]?$/i.exec(part.trim())
    if (!m) continue
    const words = [normName(m[1]), normName(part)]
    const hits = [...(c.entries.ammotypes?.values() ?? [])].filter(e => [e.name, ...(e.aliases ?? [])].some(n => words.includes(normName(n))))
    if (hits.length) return { printed: part.trim(), entry: prefer(c, source)(hits) }
  }
}
/** A firearm's ammunition (owner 2026-10-21, "NPC ammo"): two loads of its regular ammunition (one loaded, one spare) and the
 *  spare's container by its ammo type (clip: a spare clip; magazine: the weapon's own spare magazine, else a spare clip;
 *  cylinder: a speed loader; belt, drum and the rest: none, the two loads are two belts or drums); a bow or crossbow 20
 *  arrows or bolts; a printed ammo line (`w/ 30 rounds regular ammo`, `2 spare clips`) wins and adds none. A load is the
 *  printed ammo count, else the catalog weapon's, else 10. A grenade, rocket or other thrown thing is its printed quantity. */
function ammoFor(c: Sr6Catalog, t: Sr6NpcThing, source: string | undefined): Sr6NpcThing[] {
  const e = t.entry,
    what = [e?.attrs.class, e?.attrs.category, t.category, /\[\s*([^,\]]*)/.exec(t.printed)?.[1], t.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/_/g, ' ')
  // (a bow's category is "Throwing weapon/projectile"; an energy weapon takes power, a weapon accessory is no weapon)
  if (
    /close combat|melee|blade|club|unarmed|natural|laser|energy|accessory\//.test(what) ||
    (/throwing/.test(what) && !/bow/.test(what)) ||
    /energy/i.test(e?.attrs.ammo ?? '') ||
    e?.attrs.class?.startsWith('AMMUNITION/') ||
    OWN_AMMO.test(t.printed)
  )
    return []
  // (a weapon printed only as "Firearms": a rifle's ammunition when it reaches Far, else a pistol's; ponytail: the stat block's range bands are all it says)
  const generic = /firearm/.test(what) && !AMMO.some(([re]) => re.test(what)) ? (t.values.ar?.[3] != null ? ' rifle' : ' heavy pistol') : '',
    row = AMMO.find(([re]) => re.test(what + generic))
  const list = row && (indexOf(c).classes.get(row[1]) ?? []).filter(a => row[2].test(a.name))
  if (!list?.length) return []
  // (a rated ammunition, `Arrow 1` to `Arrow 14`, is one entry per level: its lowest)
  const lv = (a: Sr6Entry) => Number(a.attrs.level ?? a.attrs.rating) || 0,
    low = Math.min(...list.map(lv)),
    ammo = prefer(c, source)(list.filter(a => lv(a) === low)),
    bow = /BOWS$|CROSSBOWS$/.test(row![1]),
    type = (LOAD.exec(t.printed.slice(t.printed.lastIndexOf('[') + 1)) ?? LOAD.exec(e?.attrs.ammo ?? ''))?.[2].toLowerCase(),
    load = bow ? 20 : /^tanks?$/.test(type ?? '') ? 1 : (t.values.ammo ?? (Number(e?.attrs.ammo?.match(/^\s*(\d+)/)?.[1]) || 10))
  const made = (x: Sr6Entry, qty: number, spare?: true): Sr6NpcThing => ({
    part: t.part,
    printed: t.printed,
    name: x.name,
    kind: spare ? 'gear' : x.kind,
    entry: spare ? { ...x, kind: 'gear' } : x,
    match: { score: 1, how: 'ammo' },
    ammoFor: t.name,
    qty,
    ...(spare ? { spare } : { load }),
    values: {},
    // (a printed ammunition type, no count: the two loads are of it)
    accessories:
      !spare && kind
        ? [
            {
              part: t.part,
              printed: kind.printed,
              name: kind.entry.name,
              kind: 'ammotypes',
              entry: kind.entry,
              match: { score: 1, how: 'exact' },
              values: {},
              accessories: [],
            },
          ]
        : [],
  })
  const kind = ammoTypeOf(c, t, source)
  const own = e && [...(c.entries.gear?.values() ?? [])].find(g => g.attrs.supplyOf === e.id && /magazine/i.test(g.name))
  const box = bow
    ? undefined
    : type === 'cy'
      ? accessoryNamed(c, /^speed loader$/i, source)
      : type === 'm'
        ? (own ?? accessoryNamed(c, /^spare clip$/i, source))
        : type === 'c'
          ? accessoryNamed(c, /^spare clip$/i, source)
          : undefined
  return [made(ammo, bow ? load : 2 * load), ...(box ? [made(box, 1, true)] : [])]
}

/** A gear or augmentation line's helpers (owner 2026-10-21, "NPC unlinked gear"). */
/** A grade word alone or in a bracket (`delta`, `(betaware)`): the grade, without "ware". */
const GRADE = /^\(?(alpha|beta|gamma|delta)(?:ware)?\)?$/i
/** A GM's instruction where a line would print gear (`As needed`, `As selected by the gamemaster`, `Other gear as needed`,
 *  `Whatever she needs`, `Fit to situation`, `6 Copies`, `See text`): a note, never an item. */
const GM_NOTE =
  /^\W*(?:as\s+(?:needed|applicable|selected|noted|appropriate|required)\b|(?:any\s+)?other\s+(?:appropriate\s+)?(?:gear|equipment)\b|whatever\b|fit\s+to\b|\d+\s+copies\b|[^,]*\bneeded\s+for\b|(?:see\s+)?text\W*$)/i
/** A GM's instruction where a spells line would print a spell (`Gamemaster discretion`, `Any desired`, `others at
 *  gamemaster discretion`, `if needed (up to 10)`): a note, as GM_NOTE's are */
const SPELL_GM = /\bgamemaster|^\W*(?:any|others)\b|\bif\s+needed\b/i
/** a book reference printed after a spell (`Rot, p. 32, Street Wyrd (Range: T, …)`): its page */
const PAGE_REF = /^p(?:age|g)?\.?\s*\d+$/i
/** A spells line as the spells it prints, each with its name (its printed parameters, `Powerbolt [direct combat, …]`, left
 *  off): split after each `[…]` (a run-together `Powerbolt […] Fireball […]`), at commas, semicolons and a spaced slash
 *  (`Silence / Ward`); a `Rituals:` label dropped; GM instructions and prose left out (they stay in the line's text, the notes); a page
 *  or a book's name after a spell (`Rot, p. 32, Street Wyrd (…)`) kept in that spell's printed text. */
function spellLines(c: Sr6Catalog, text: string): { printed: string; name: string }[] {
  // (a book by its name, `Shadowrun: Street Wyrd`, or without the game's: `Street Wyrd`)
  const books = new Set([...c.sources.values()].flatMap(s => [normName(s.name), normName(s.name.replace(/^shadowrun\b[^:]*:\s*/i, ''))]))
  const nameOf = (p: string) => {
    const g = groups(p).at(-1)
    return g && g[0] > 0 && g[1] === p.length - 1 ? p.slice(0, g[0]).trim() : p
  }
  const chunks: string[] = []
  let at = 0
  for (const [open, close] of groups(text))
    if (text[open] === '[') {
      chunks.push(text.slice(at, close + 1))
      at = close + 1
    }
  chunks.push(text.slice(at))
  const out: { printed: string; name: string }[] = []
  // (a semicolon or spaced slash outside brackets parts spells as a comma does; inside, it is the spell's own text)
  const commas = (s: string) => {
    let depth = 0,
      o = ''
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if ('([{'.includes(ch)) depth++
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
      o += !depth && (ch === ';' || (ch === '/' && s[i - 1] === ' ' && s[i + 1] === ' ')) ? ',' : ch
    }
    return o
  }
  for (const piece of chunks.flatMap(ch => top(commas(ch)))) {
    const p = piece.replace(/^(?:spells?|rituals?)\s*:\s*/i, '').replace(/[\s.]+$/, ''),
      name = nameOf(p)
    // (prose is read on the name, its bracket aside: `Increase Reflexes [Physical, Touch, …]` is a spell)
    if (!p || GM_NOTE.test(p) || SPELL_GM.test(p) || (PROSE.test(name) && name.split(/\s+/).length >= 6)) continue
    if (out.length && (PAGE_REF.test(p) || books.has(normName(nameOf(p))))) out[out.length - 1].printed += `, ${p}`
    else out.push({ printed: p, name })
  }
  return out
}
/** prose where a line prints items: a sentence that says what the NPC has or gains */
const PROSE = /\b(?:has|have|gains?|increases?|bonus|noted)\b/i
/** the head of an introduction to a list (`he has the following deltaware items`, `Augmentations (all gammaware)`) */
const INTRO = /\bfollowing\b|\ball\s+\w+ware\b|^augmentations\b|^\W*\w+ware\W*$/i
const BOOK_WORDING = new Map([['longcoat', 'Lined coat']]) // ponytail: the one ruled wording (importer/sr6/archetypes.py); add a pair when the owner rules another
/** an attribute and its augmented value (`Agility 9`): a value in the stat block, not a thing */
const ATTRIBUTE_VALUE = /^(?:body|agility|reaction|strength|willpower|logic|intuition|charisma|edge|magic|resonance|essence|armor)\s+\d+(?:\.\d+)?$/i
const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
const PACKS = String.raw`(?:packs?|packets?|boxes|bottles?|vials?|doses?)\s+of\s`
const GEAR_KINDS: Sr6Kind[] = ['gear', 'electronics', 'armor', 'programs', 'vehicles', 'weapons', 'augmentations', 'lifestyles', 'datastructures']

/** `s` with its brackets paired: a closer of the wrong kind closes the opener (`[+1) w/ …` is `[+1]`), a stray closer and
 *  the opener left open at the end are fixed (the reader ran lines on and cut them). */
function paired(s: string): string {
  const open: string[] = []
  let out = ''
  for (const ch of s) {
    if ('([{'.includes(ch)) {
      open.push(ch)
      out += ch
    } else if (')]}'.includes(ch)) {
      const o = open.pop()
      if (o) out += ')]}'['([{'.indexOf(o)]
    } else out += ch
  }
  return (
    out +
    open
      .reverse()
      .map(o => ')]}'['([{'.indexOf(o)])
      .join('')
  )
}
/** `s` split at its first top-level `w/` or `with`: the thing, then its add-ons (`Auber bodyguard suit (+3) with electric
 *  insulation 1`) as separate accessories; the thing alone when it has none. */
function splitWith(s: string): string[] {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if ('([{'.includes(s[i])) depth++
    else if (')]}'.includes(s[i])) depth = Math.max(0, depth - 1)
    else if (!depth && i > 0 && /\s/.test(s[i - 1]) && /^(?:w\/|with\s)/i.test(s.slice(i))) {
      let head = s.slice(0, i).trim(),
        tail = s.slice(i).replace(/^(?:w\/|with)\s*/i, '')
      // (a bracket of numbers that ends the whole line is the thing's: `Armored kimono with ballistic hood (DR +5)`, not a list: `w/ licenses (a, b)`)
      const end = groups(tail).at(-1)
      if (
        end &&
        end[0] > 0 &&
        end[1] === tail.length - 1 &&
        /^[([]\s*(?:\+|DR\b|Defense|device|rating|R\s*\d|\d)/i.test(tail.slice(end[0])) &&
        !groups(head).some(g => g[1] === head.length - 1)
      ) {
        head += ` ${tail.slice(end[0])}`
        tail = tail.slice(0, end[0])
      }
      return [head, ...tail.split(/\s+(?:and|&)\s+|\s+\+\s+/i)]
    }
  }
  return [s]
}
/** `a + b (DR+5)` as `a (DR+5)`, `b`: things joined by a spaced plus at no depth are a list; the bracket that ends it is the
 *  first one's (the printed Defense of the set read as the first thing's). */
function plusList(el: string): string[] {
  const parts: string[] = ['']
  let depth = 0
  for (let i = 0; i < el.length; i++) {
    const ch = el[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (!depth && ch === '+' && /\s/.test(el[i - 1] ?? '') && /\s/.test(el[i + 1] ?? '')) parts.push('')
    else parts[parts.length - 1] += ch
  }
  const things = parts.map(x => x.trim()).filter(Boolean)
  if (things.length < 2) return [el]
  const end = groups(things.at(-1)!).at(-1)
  if (end && end[0] > 0 && end[1] === things.at(-1)!.length - 1 && !groups(things[0]).some(g => g[1] === things[0].length - 1)) {
    things[0] += ` ${things.at(-1)!.slice(end[0])}`
    things[things.length - 1] = things.at(-1)!.slice(0, end[0]).trim()
  }
  return things
}
/** A gear or augmentations line as the things it prints, each with the grade it sets: GM instructions and prose left out
 *  (they stay in the line's text, the notes), `(all deltaware):` or `the following deltaware items:` the grade of what
 *  follows, a lone `(delta)` the grade of the item before it, a lone `bioware` nothing. */
function stuffLines(text: string): { printed: string; grade?: string }[] {
  const out: { printed: string; grade?: string }[] = []
  let line: string | undefined
  for (const sentence of paired(text).split(/(?<=[\w)\]])\.\s+(?=[A-Z(])/)) {
    let s = sentence.trim()
    const intro = s.match(/^([^:]*?(?:\([^)]*\))?[^:]*):\s*(.+)$/s)
    if (intro && INTRO.test(intro[1])) {
      line = intro[1].match(/\b(alpha|beta|gamma|delta)ware\b/i)?.[1].toLowerCase()
      s = intro[2]
    } else if (intro && /^[\w\s]{1,30}$/.test(intro[1])) {
      // (a new label ends the grade of the one before: `Gear: …`)
      line = undefined
    } else if (PROSE.test(s.replace(/\([^)]*\)|\[[^\]]*\]/g, '')) && s.split(/\s+/).length >= 6) continue
    const lead = s.match(/^\(\s*(?:all\s+)?(alpha|beta|gamma|delta)ware\s*\)\s*(.*)$/i)
    if (lead) [line, s] = [lead[1].toLowerCase(), lead[2]]
    for (const el of top(s)
      .flatMap(e => (/^\[[^\]]*\]$/.test(e) ? top(e.slice(1, -1)) : [e]))
      .flatMap(plusList)) {
      const printed = el.replace(/[\s.]+$/, '')
      const g = printed.match(GRADE)
      if (!printed || GM_NOTE.test(printed) || ATTRIBUTE_VALUE.test(printed) || /^(?:cyber|bio|gene|nano)ware$/i.test(printed)) continue
      if (!g) out.push({ printed, ...(line ? { grade: line } : {}) })
      else if (out.length) out[out.length - 1].grade = g[1].toLowerCase()
      else line = g[1].toLowerCase()
    }
  }
  return out
}

/** What a glued name can be split by, per catalog and kinds: `ends`, the word keys it can end in (`goggles` in
 *  `smartgoggles`, `van` in `stepvan`: one-word entry names and the last words of categories) and `known`, every word the
 *  kinds' names and categories use (`crossbow` is one: not split). */
const wordSets = new WeakMap<Index, Map<string, { ends: Set<string>; known: Set<string> }>>()
function wordsOf(c: Sr6Catalog, kinds: Sr6Kind[]) {
  const x = indexOf(c),
    per = wordSets.get(x) ?? wordSets.set(x, new Map()).get(x)!,
    id = kinds.join()
  let sets = per.get(id)
  if (!sets) {
    sets = { ends: new Set<string>(), known: new Set<string>() }
    for (const k of kinds) {
      for (const l of x.loose.get(k) ?? []) {
        if (!l.key.includes(' ') && l.key.length >= 3) sets.ends.add(l.key)
        l.key.split(' ').forEach(w => sets!.known.add(w))
      }
      for (const ck of x.categories.get(k)?.keys() ?? []) {
        const words = ck.split(' ')
        if (words.at(-1)!.length >= 3) sets.ends.add(words.at(-1)!)
        words.forEach(w => sets!.known.add(w))
      }
    }
    per.set(id, sets)
  }
  return sets
}
/** The other forms a gear or augmentation name is printed in, from what is likely: either side of a colon
 *  (`cyberdeck: Fairlight Excalibur`), without its delivery or container (`jazz inhaler`, `dose of jazz`), an initialism's
 *  entry (`BDUs`), without trailing header capitals (`MCT 360 cyberdeck MATRIX STATS`), a glued word split
 *  (`smartgoggles`, `stepvan`, `cyberhand` with `obvious`: `hand (obvious)`); inner: a bracket's own name
 *  (`Adjudant Humà (Nissan Samurai)`). */
function formsOf(c: Sr6Catalog, name: string, printed: string, kinds: Sr6Kind[]): { forms: string[]; inner: string[] } {
  const forms: string[] = [],
    inner: string[] = []
  const add = (to: string[], s?: string) => {
    const t = s?.trim()
    if (t && t !== name && !to.includes(t)) to.push(t)
  }
  const colon = name.split(/:\s*/)
  // (`cyberdeck: Fairlight Excalibur` is the model; `jammer: directional 6`, either)
  if (colon.length === 2) (colon[1].trim().split(/\s+/).length >= 2 && !/\d/.test(colon[1]) ? [colon[1]] : colon.reverse()).forEach(t => add(forms, t))
  add(forms, name.replace(/\s+(?:inhalers?|syringes?|injectors?|pills?|tablets?|capsules?)$/i, ''))
  add(forms, name.replace(new RegExp(`^(?:\\d+\\s+)?${PACKS}`, 'i'), ''))
  add(forms, name.replace(/(?:\s+[A-Z]{3,})+$/, ''))
  add(forms, name.replace(/^(?:standard|regular|normal)\s+/i, ''))
  add(forms, name.replace(/\s+lifestyle$/i, ''))
  add(forms, name.replace(/\s+lenses$/i, ''))
  // (the owner's rulings on book wording, 2026-10-19: `long coat` is the Lined coat; joined or split)
  const joined = name.toLowerCase().replace(/\s+/g, '')
  add(forms, BOOK_WORDING.get(joined))
  const initials = name.match(/^([A-Z]{3,6})s?$/)?.[1].toLowerCase()
  // (an initialism two names share is none: `AAS`)
  const named = (initials ? (indexOf(c).initials.get(initials) ?? []) : []).filter(e => kinds.includes(e.kind))
  if (new Set(named.map(e => normName(e.name))).size === 1) add(forms, named[0].name)
  const quality = printed.match(/\b(obvious|synthetic)\b/i)?.[1].toLowerCase(),
    { ends, known } = wordsOf(c, kinds),
    words = name.split(' ')
  words.forEach((w, i) => {
    const lw = w.toLowerCase()
    if (!/^[a-z]{7,}$/.test(lw) || known.has(matchKey(lw))) return
    for (let cut = 3; cut <= lw.length - 3; cut++) {
      if (!ends.has(matchKey(lw.slice(cut)))) continue
      const to = (r: string) => words.map((x, j) => (j === i ? r : x)).join(' ')
      add(forms, to(`${lw.slice(0, cut)} ${lw.slice(cut)}`))
      if (quality) add(forms, `${matchKey(lw.slice(cut))} (${quality})`)
      add(forms, to(lw.slice(cut)))
      break
    }
  })
  for (const [open, close] of groups(printed)) {
    const t = printed.slice(open + 1, close)
    if (!/[,\d/]/.test(t) && t.includes(' ')) add(inner, t)
    // (`<model> form`: the model)
    for (const part of top(t)) add(inner, part.match(/^(.+?)\s+form$/i)?.[1])
  }
  return { forms, inner }
}
/** A gear or augmentation name's entry through its other forms (formsOf): by name first, then a 75% guess; `inner`, the
 *  names in its brackets, by name only. */
function viaForms(c: Sr6Catalog, name: string, printed: string, kinds: Sr6Kind[], source?: string, inner = false, standard?: { rating?: number }) {
  const f = formsOf(c, name, printed, kinds)
  const by = (how: 'exact' | 'loose' | 'standard') => f.forms.map(n => findEntry(c, n, kinds, source, how, standard?.rating)).find(Boolean)
  const found = inner
    ? f.inner.map(n => findEntry(c, n, kinds, source)).find(Boolean)
    : (by('exact') ?? close(by('loose')) ?? (standard ? close(by('standard'), true) : undefined))
  return found && guess(found, name)
}
/** A link found through another form of the printed name: shown to the GM as the guess it is (an exact hit on a form of the
 *  name is no exact hit on the name). */
const close = <T extends { match: Sr6NpcMatch } | undefined>(f: T, standard = false) =>
  f && (f.match.score >= 0.9 || (standard && f.match.how === 'standard')) ? f : undefined
const guess = (f: { entry: Sr6Entry; match: Sr6NpcMatch }, printed: string) =>
  f.match.how === 'exact' ? { entry: f.entry, match: { score: round(nameRatio(matchKey(printed), matchKey(f.entry.name))), how: 'fuzzy' as const } } : f
/** The entry whose name starts with the printed name's first word, when the other words only qualify it: a count, a rating,
 *  a side or quality, or a word of its category or type (`cybereyes obvious`); or when the printed rating is a level of that
 *  family (`linguasoft subscription (rating 4)`: Linguasofts 4; `synaptic accelerator 3`: Synaptic booster 3). `datajack
 *  adapter` is no Datajack. A word of 5 letters at least; the family's standard level. */
function leadWord(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string, rating?: number) {
  const words = matchKey(name).split(' ')
  if (words.length < 2 || words[0].length < 5) return undefined
  const first = words[0],
    x = indexOf(c)
  const same = kinds.flatMap(k => (x.loose.get(k) ?? []).filter(l => l.key.split(' ')[0] === first))
  const one = same.find(l => l.key === first) ?? (same.length === 1 ? same[0] : undefined)
  if (!one) return undefined
  const known = new Set(matchKey(one.entries.map(e => [e.attrs.category, e.attrs.type].filter(Boolean).join(' ')).join(' ')).split(' '))
  const qualifier = (w: string) => /^\d+$/.test(w) || ['left', 'right', 'obvious', 'synthetic', 'rating', 'level', 'net', 'set'].includes(w) || known.has(w)
  const level = rating != null && one.entries.some(e => Number(e.attrs.level ?? e.attrs.rating) === rating)
  if (!level && !words.slice(1).every(qualifier)) return undefined
  const entry = standardOf(one.entries, prefer(c, source), rating)
  return { entry, match: { score: round(nameRatio(matchKey(name), one.key)), how: 'standard' as const } }
}
/** The entry a shortened name is (`flare comp`: Flare compensation, `lowlight`: Low-light vision, `vision enh`): its words
 *  start the entry's, one for one, or are its first words whole; the shortest such name. Six letters at least. */
function abbreviated(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string) {
  const words = matchKey(name.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')).split(' '),
    whole = words.join('')
  if (whole.length < 6) return undefined
  const hits = kinds.flatMap(k =>
    (indexOf(c).loose.get(k) ?? []).filter(l => {
      const ws = l.key.split(' ')
      if (words.length === ws.length) return words.every((w, i) => w.length >= 3 && ws[i].startsWith(w))
      if (words.length > ws.length) return false
      // (whole words that begin it, or end it when two: `air tank` is `Internal Air Tank`)
      return (
        words.every((w, i) => w === ws[i]) ||
        (words.length === 1 && ws.join('').startsWith(whole)) ||
        (words.length > 1 && words.every((w, i) => w === ws[ws.length - words.length + i]))
      )
    }),
  )
  const shortest = hits.sort((a, b) => a.key.length - b.key.length)[0]
  return (
    shortest && { entry: prefer(c, source)(shortest.entries), match: { score: round(nameRatio(whole, shortest.key.replace(/ /g, ''))), how: 'fuzzy' as const } }
  )
}
/** The gear or augmentation a printed name is the variant of (`Therapeutic Nanites (Savior System) Nanites`). */
function viaMid(c: Sr6Catalog, name: string, source?: string) {
  const list = indexOf(c).mids.get(matchKey(name))
  const entry = list && prefer(c, source)(list.slice(0, list.filter(e => /nanites$/i.test(e.name)).length || list.length))
  return entry && guess({ entry, match: { score: 1, how: 'exact' } }, name)
}
/** The entry whose name, category and type together hold all of a printed name's words, in any order (`increased hearing
 *  spectrum`: Increased spectrum hearing; `regulator gauntlets`: the Regulator of type gun gauntlet; `hardened armor module`:
 *  Armor Plating, Hardened, a critter exoframe module): two words at least, and only one entry holds them. */
const wordKey = (t: string) => matchKey(t.replace(/[()[\]]/g, ' '))
function coveredBy(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string) {
  const words = wordKey(name).split(' ')
  if (words.length < 2 || words.some(w => w.length < 3)) return undefined
  const x = indexOf(c)
  x.words ??= new Map()
  const hits = kinds.flatMap(k => {
    let list = x.words!.get(k)
    if (!list) {
      list = [...(c.entries[k]?.values() ?? [])].map(e => ({
        e,
        have: new Set(wordKey([e.name, e.attrs.category, e.attrs.type].filter(Boolean).join(' ')).split(' ')),
      }))
      x.words!.set(k, list)
    }
    return list.filter(t => words.every(w => t.have.has(w))).map(t => t.e)
  })
  // (a rated family is one: its levels share a name)
  if (new Set(hits.map(e => matchKey(e.name))).size !== 1) return undefined
  const entry = standardOf(hits, prefer(c, source))
  return { entry, match: { score: round(nameRatio(words.join(' '), matchKey(entry.name))), how: 'fuzzy' as const } }
}
/** An add-on printing a list of licences, `licenses (augmentation, pistols, RCC)` or `fake licenses 3 (firearms, magic)`, as
 *  one licence each. */
const licences = (a: string): string[] => {
  const list = a.match(/^(?:fake\s+)?licen[sc]es?(?:\s+\d+)?\s*[([]([^)\]]*)[)\]]$|^licen[sc]es?:\s*(.+)$/i)
  return list ? (list[1] ?? list[2]).split(/\s*,\s*/).map(w => (/licen[sc]e$/i.test(w) ? w : `${w.trim()} license`)) : [a]
}
/** A licence a stat block prints by what it covers, as the owner ruled (2026-10-22): `augmentation` and `bioware` the generic
 *  augmentation licence (the catalog's if it has one, else plain gear), its detail what the NPC has; `pistols` the Firearm
 *  license, `magic` the Spellcasting license, `RCC` the Rigger remote console license, the printed word kept as detail. */
const LICENCE_RULINGS = new Map<string, string>([
  ['augmentation', ''],
  ['augmentations', ''],
  ['bioware', ''],
  ['pistols', 'Firearm license'],
  ['magic', 'Spellcasting license'],
  ['rcc', 'Rigger remote console license'],
])
/** A licence add-on as a thing: by the rulings, else by its catalog name, else plain gear. `generic` is set for an augmentation
 *  licence, whose detail npcThings fills in from what the NPC has. */
function licenceThing(c: Sr6Catalog, part: string, printed: string): { thing: Sr6NpcThing; generic?: string } {
  const said = printed.match(/^([\w'’]+)\s+licen[sc]e$/i)?.[1],
    word = said?.toLowerCase()
  const ruled = word === undefined ? undefined : LICENCE_RULINGS.get(word)
  const base = { part, printed, printedName: printed, values: {}, accessories: [] }
  if (ruled) {
    const f = licenceNamed(c, ruled)
    if (f) return { thing: { ...base, name: f.entry.name, kind: f.entry.kind, entry: f.entry, match: { score: 1, how: 'fuzzy' }, detail: said, ruled: true } }
  }
  if (word !== undefined && ruled === '') {
    const entry = [...(c.entries.licencetypes?.values() ?? [])].find(e => /^augmentation licen/i.test(e.name))
    const thing: Sr6NpcThing = entry
      ? { ...base, name: entry.name, kind: entry.kind, entry, match: { score: 1, how: 'fuzzy' }, ruled: true }
      : { ...base, name: 'Augmentation license', kind: 'gear', ruled: true }
    return { thing, generic: said }
  }
  const f = licenceNamed(c, printed)
  return {
    thing: f
      ? { ...base, name: f.entry.name, kind: f.entry.kind, entry: f.entry, match: f.match }
      : { ...base, name: printed.replace(/\s*[([].*$/, ''), kind: 'gear' },
  }
}
/** A licence by its name only (`Cyberware license`); a guess at one would be another licence (`bioware license`). */
const licenceNamed = (c: Sr6Catalog, a: string) => {
  const key = matchKey(a)
  const entry = [...(c.entries.licencetypes?.values() ?? [])].find(e => matchKey(e.name) === key)
  return entry && { entry, match: { score: 1, how: 'exact' as const } }
}
/** An initialism for an armor add-on (`AAS`: Securetech Armor Augmentation System, Defense +1): of the armors with those
 *  initials the one whose Defense is a plus (a bonus on the armor it is fitted to, cumulative), when only one is. */
function addOnInitialism(c: Sr6Catalog, name: string, host: Sr6Entry | undefined) {
  const initials = host?.kind === 'armor' ? name.match(/^([A-Z]{3,6})$/)?.[1].toLowerCase() : undefined
  const adds = (initials ? (indexOf(c).initials.get(initials) ?? []) : []).filter(e => e.kind === 'armor' && /^\+/.test(e.attrs.defense ?? ''))
  return adds.length === 1 ? { entry: adds[0], match: { score: 1, how: 'fuzzy' as const }, ruled: true } : undefined
}
/** A gear or augmentation name in every kind a stat block can print (owner: search them all) when its own kinds have none. */
function inAnyKind(c: Sr6Catalog, name: string, printed: string, source?: string, rating?: number) {
  return (
    findEntry(c, name, GEAR_KINDS, source) ??
    viaForms(c, name, printed, GEAR_KINDS, source) ??
    findEntry(c, name, GEAR_KINDS, source, 'loose') ??
    viaForms(c, name, printed, GEAR_KINDS, source, true) ??
    coveredBy(c, name, GEAR_KINDS, source) ??
    leadWord(c, name, GEAR_KINDS, source, rating)
  )
}
const normsOf = (c: Sr6Catalog) => (indexOf(c).norms ??= GEAR_KINDS.flatMap(k => [...(c.entries[k]?.values() ?? [])].map(e => ({ e, n: normName(e.name) }))))
/** A gear or augmentation printed as several things, when it is none: a list in a bracket of what a family prints
 *  (`genotype enhancements (Alpha Factor, Qualia)`: each its entry's name), `personal inhaler (jazz, novacoke, 1 dose each)`,
 *  `commlink and smartglasses (device rating 7)` and `biomonitor/killswitch` when each part is an entry. */
function expandStuff(c: Sr6Catalog, printed: string, source?: string): string[] {
  // (a part is only taken as a thing by name or a close guess: a split into wrong links is worse than one unlinked)
  const part = (n: string) => {
    const f = findEntry(c, n, GEAR_KINDS, source) ?? findEntry(c, n, GEAR_KINDS, source, 'loose')
    return (!!f && f.match.score >= 0.9) || !!viaForms(c, n, n, GEAR_KINDS, source)
  }
  const last = groups(printed).at(-1),
    tail = last && last[0] > 0 && last[1] === printed.length - 1 ? last : undefined,
    name = (tail ? printed.slice(0, tail[0]) : printed).trim(),
    list = tail ? top(printed.slice(tail[0] + 1, -1)) : []
  const delivery = name.match(/^(?:personal\s+)?(?:inhalers?|syringes?|injectors?)$/i)
  if (delivery && list.length) return list.filter(t => !/^\d/.test(t))
  // (only a name that could be several things is looked up further)
  if (list.length < 2 && !/\s+and\s+|[a-z]{2}\/[a-z]/i.test(name)) return [printed]
  if (findEntry(c, name, GEAR_KINDS, source)) return [printed]
  const stem = matchKey(name)
  if (list.length > 1) {
    const names = list.map(p => {
      const key = normName(`${stem} ${p}`)
      let best: { e: Sr6Entry; score: number } | undefined
      for (const { e, n } of normsOf(c)) {
        const score = n.startsWith(`${stem} `) ? nameRatio(key, n) : 0
        if (score >= 0.85 && score > (best?.score ?? 0)) best = { e, score }
      }
      return best?.e.name
    })
    if (names.every(Boolean)) return names as string[]
  }
  // a package that is none and lists parts that all are (`metahuman control package (skilljack 6, skillwires 6)`): itself, then its parts
  if (list.length > 1 && !findEntry(c, name, GEAR_KINDS, source, 'loose') && !viaForms(c, name, name, GEAR_KINDS, source) && list.every(p => part(p)))
    return [name, ...list]
  const parts = name.split(/\s+and\s+|(?<=[a-z]{2})\/(?=[a-z])/i)
  // (the bracket after them is theirs both, unless it is an armor value of the two together: `armor vest and lined coat (+3)`)
  const shared = tail && !/^\(\s*\+/.test(printed.slice(tail[0])) ? ` ${printed.slice(tail[0])}` : ''
  if (parts.length > 1 && parts.every(p => part(p.replace(/^an?\s+/i, '')))) return parts.map(p => `${p.replace(/^an?\s+/i, '')}${shared}`)
  return [printed]
}

// (the kinds a power is linked in by its name only, never by a guess)
const BY_NAME_ONLY = new Set<Sr6Kind>(['qualities', 'augmentations'])
/** A stat block power read as its name, its rating and its parameters: `Venom [Vector: Injection; Speed: 1 round]` is
 *  `Venom`, those words; `Hardened Armor (4)` and `Hardened Armor 4` are `Hardened Armor`, rating 4. */
function powerParts(printed: string): { name: string; rating?: number; detail: string } {
  const s = printed.replace(/\*+$/, '').trim(),
    g = groups(s)[0],
    head = (g ? s.slice(0, g[0]) : s).trim(),
    inside = g ? s.slice(g[0] + 1, g[1]).trim() : '',
    after = g ? s.slice(g[1] + 1).trim() : ''
  // (a bracket holding only a number is the rating: `Hardened Armor (4)`)
  const r = /^\d{1,2}$/.test(inside) ? inside : (head.match(/\s(\d{1,2})$/)?.[1] ?? after.match(/^\d{1,2}$/)?.[0])
  return {
    name: head.replace(/\s+\d{1,2}$/, ''),
    ...(r ? { rating: Number(r) } : {}),
    detail: [/^\d{1,2}$/.test(inside) ? '' : inside, /^\d{1,2}$/.test(after) ? '' : after].filter(Boolean).join(' '),
  }
}
/** Whether a guess drops or swaps no word: each word of one is a word of the other, at least NPC_MATCH alike or one the
 *  start of the other (`Wall Walk`, `Wall Walking`), or the names differ only in their spacing (`Mana Bolt`, `Manabolt`);
 *  not `Improved Close Combat` and `Improved Sense`. */
const CONNECTORS = new Set(['to', 'of', 'the', 'and', 'in', 'on', 'for', 'with', 'a', 'an'])
/** A name's content words, singular, without its bracket and the connectors a name has. */
const contentWords = (n: string) =>
  matchKey(n.replace(/\s*\([^()]*\)$/, ''))
    .split(' ')
    .filter(w => !CONNECTORS.has(w))
function sameWords(a: string, b: string): boolean {
  const wa = contentWords(a),
    wb = contentWords(b)
  // (a word that differs from the other in letters alone is another word: `Agility` and `Ability`)
  const alike = (x: string, y: string) =>
    x === y || (nameRatio(x, y) >= NPC_MATCH && x.length !== y.length) || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))
  const has = (w: string, list: string[]) => list.some(x => alike(w, x))
  const [ja, jb] = [wa.join(''), wb.join('')]
  return (wa.every(w => has(w, wb)) && wb.every(w => has(w, wa))) || ja === jb || (nameRatio(ja, jb) >= 0.9 && ja.length !== jb.length)
}
/** A power's catalog entry (the first kind with it; `Sapience digital assault`: the longest run of its first words that
 *  names one, the rest its parameters). A book's entry named with a bracket (`Heavy Scales (Western Drake)`, `Shift
 *  (Shifter add-on)`) is the bare name's when nothing else has it (the NPC's own book's first). */
function findPower(
  c: Sr6Catalog,
  printed: string,
  name: string,
  kinds: Sr6Kind[],
  source?: string,
): { found?: ReturnType<typeof findEntry>; rest: string; ruled?: true } {
  const words = name.split(/\s+/).filter(Boolean),
    guessKinds = kinds.filter(k => !BY_NAME_ONLY.has(k)) // (a guess among the powers, never the qualities)
  for (const n of [printed, name]) {
    const found = findEntry(c, n, kinds, source, 'exact')
    if (found) return { found, rest: '' }
  }
  // (the books' shorthand `Improved Agility 2` is the CRB adept power Improved Physical Attribute, the attribute its detail; owner
  // 2026-10-22, never `Improved Ability (Skill)`)
  const physical = name.match(/^improved\s+(body|agility|reaction|strength)$/i)
  const power = physical && findEntry(c, 'Improved Physical Attribute', ['adeptpowers'], source)
  if (power) return { found: { entry: power.entry, match: { score: 1, how: 'fuzzy' } }, rest: physical[1], ruled: true }
  const key = normName(name),
    set = contentWords(name).sort().join(' ')
  const among = (kind: Sr6Kind, test: (e: Sr6Entry) => boolean) => [...c.entries[kind].values()].filter(test)
  const best = (list: Sr6Entry[], how: 'exact' | 'fuzzy') => ({ found: { entry: prefer(c, source)(list), match: { score: 1, how } }, rest: '' })
  // (the whole name, then its first words, by name)
  for (let k = words.length; k >= 1; k--) {
    const found = findEntry(c, words.slice(0, k).join(' '), kinds, source, 'exact')
    if (found) return { found, rest: words.slice(k).join(' ') }
  }
  // (an entry named with a bracket, `Heavy Scales (Western Drake)`, is the bare name's; each kind in its turn)
  for (const kind of kinds) {
    const named = among(kind, e => e.name !== name && normName(e.name.replace(/\s*\([^()]*\)$/, '')) === key)
    if (named.length) return best(named, 'exact')
  }
  // (then the same by a 75% guess, but not on one word of several)
  for (let k = words.length; k >= 1; k--) {
    if (k === 1 && words.length > 1) continue
    const part = words.slice(0, k).join(' '),
      found = findEntry(c, part, guessKinds, source, 'loose')
    if (found && sameWords(part, found.entry.name)) return { found, rest: words.slice(k).join(' ') }
  }
  // (the same words in another order, `Mystic Hardened Armor`, `Hardened Mystic Armor`: a guess, so never among the qualities)
  for (const kind of guessKinds) {
    const same = among(kind, e => contentWords(e.name).sort().join(' ') === set)
    if (same.length) return best(same, 'fuzzy')
  }
  return { rest: '' }
}

/** The things an NPC's weapons, attacks, gear, augmentations and powers lines print, each its catalog entry where the
 *  catalog has one (a level by its printed number: `Improved Reflexes 2` is that level's entry), else built from what is
 *  printed: an attack printing a DV (read or not) or attack ratings as a weapon, gear with a printed Defense as armor,
 *  other gear as gear, an augmentation as one, a power as a critter power. A weapon or attack with none of those and no
 *  entry, or a Cybercombat one, is left out (its line stays in the notes). The printed numbers are kept (values), worked
 *  out at the NPC's rating where they use its Force. */
export function npcThings(npc: Sr6Npc, c: Sr6Catalog): Sr6NpcThing[] {
  const src = npc.from?.source,
    being = npc.kind !== 'grunt' && npc.kind !== 'contact',
    powers = POWER_KINDS[being ? 'being' : 'person']
  const out: Sr6NpcThing[] = []
  const generics: { thing: Sr6NpcThing; word: string }[] = []
  for (const l of npc.lines) {
    // (a spells line reads as a powers line does: names, linked by name or a 75% guess, else kept as printed)
    const spell = l.part === 'spells',
      power = l.part === 'powers' || l.part === 'optionalPowers' || spell,
      attack = l.part === 'weapons' || l.part === 'attacks'
    const lineKinds = spell ? SPELL_KINDS : power ? powers : THING_KINDS[l.part]
    if (!lineKinds) continue
    // (gear and augmentations: GM instructions and prose are notes, grades set, a line printing several things split)
    const stuff = l.part === 'gear' || l.part === 'augmentations'
    const printeds: { printed: string; grade?: string; name?: string }[] = attack
      ? splitThings(l.text).map(printed => ({ printed }))
      : stuff
        ? stuffLines(l.text).flatMap(t => expandStuff(c, t.printed, src).map(printed => ({ ...t, printed })))
        : spell
          ? spellLines(c, l.text)
          : top(l.text).map(printed => ({ printed }))
    for (const { printed, grade: lineGrade, name: spellName } of printeds) {
      // a data structure's own name: `data structure (Oracle 4)` is Oracle 4
      const bare = stuff ? printed.replace(/^data structures?\s*\((.*)\)(?:\s+\S.*)?$/i, '$1') : printed
      const kinds = bare === printed ? lineKinds : (['datastructures'] as Sr6Kind[])
      // (a name that is an entry's own keeps its `w/`: `Full body armor w/ helmet`)
      const whole = stuff && /\b(?:w\/|with)\s/i.test(bare) ? pieces(bare).name : undefined
      const spelt = whole?.replace(/\bwith\s/i, 'w/ ')
      const own = whole && (findEntry(c, whole, kinds, src) ?? findEntry(c, spelt!, kinds, src) ?? findEntry(c, spelt!, kinds, src, 'loose'))
      const [head, ...withs] = stuff && !(own && own.match.score >= 0.9) ? splitWith(bare) : [bare]
      const p = power ? { name: spellName ?? printed, stats: [] } : pieces(head)
      const s = readStats(p.stats, npc.rating)
      // (`with a rating 4` is the thing's rating; a GM's choice is no add-on)
      for (const w of withs) {
        const r = w.match(/^(?:a\s+)?rating\s+(\d+)$/i)
        if (r) s.values.rating ??= Number(r[1])
        else s.accessories.push(w)
      }
      // a count printed with it: `2 x smoke grenades`, `Meta Link x2`, `data chip (x5)`, `three packets of cigarettes`
      const n = p.name.length <= 200 ? p.name.match(/^(\d+)\s*x\s+(.+)$|^(.+?)(?:\s*\(x\s*(\d+)\)|\s+x\s*(\d+))$/i) : null
      const w = stuff && !n ? p.name.match(new RegExp(`^(${Object.keys(NUMBER_WORDS).join('|')})\\s+(${PACKS}.+)$`, 'i')) : null
      const name = n ? (n[2] ?? n[3]).trim() : w ? w[2] : p.name,
        qty = n ? Number(n[1] ?? n[4] ?? n[5]) : w ? NUMBER_WORDS[w[1].toLowerCase()] : s.count
      // (a name with its bracket may be an entry's own: `Hand (obvious)`)
      const pw = power ? powerParts(name) : undefined
      const pf = pw ? findPower(c, name, pw.name, kinds, src) : undefined
      let found =
        pf?.found ?? (stuff && p.name !== head ? findEntry(c, head.replace(/^\d+\s*x\s+/i, ''), kinds, src) : undefined) ?? findEntry(c, name, kinds, src)
      // a trailing number is its rating or level: `white noise generator 3`, `Hardened Armor (4)`
      const lv = pw ? undefined : name.match(/^(.*?)\s*(?:\((\d{1,2})\)|\s(\d{1,2}))$/)
      if (lv && (!found || normName(found.entry.name) === normName(lv[1]))) {
        found ??= findEntry(c, lv[1], kinds, src)
        s.values.rating ??= Number(lv[2] ?? lv[3])
      }
      // (not a spell's: `Fireball 6` is its Force, kept in its printed text)
      if (!spell && pw?.rating != null) s.values.rating ??= pw.rating
      if (!found && !power && s.values.rating != null) found = findEntry(c, `${name} ${s.values.rating}`, kinds, src)
      // no name: the most alike one (at least NPC_MATCH), else a standard item; a power only the most alike (a power the
      // catalog lacks stays as printed); a natural attack (a bite: its skill as category, or a close band only) by name
      // only, no catalog weapon being one
      const natural =
        attack &&
        (NATURAL.test(s.category ?? '') ||
          (!s.category && (s.values.dv != null || !!s.dvText) && (being || !(s.values.ar ?? []).slice(1).some(b => b != null))))
      // (a Cybercombat attack is a Matrix action: no catalog thing; gear printing a Defense, not a device's, is armor)
      const armored = !attack && !power && s.values.defense != null && !DEVICE_NAME.test(name)
      // (gear and augmentations: first the name in its other forms, then a leading word, then any kind)
      // (`Low lifestyle` is the lifestyle Low)
      let lifestyleRuled = false
      // (`Medium` is a typo for `Middle`: owner 2026-10-22)
      if (stuff && /\blifestyle$/i.test(name)) {
        const lifestyle = findEntry(c, name.replace(/\s+lifestyle$/i, '').replace(/^medium$/i, 'middle'), ['lifestyles'], src)
        // (`Medium` is the owner's ruling: a typo for Middle)
        const typo = /^medium\s+lifestyle$/i.test(name) && lifestyle
        const had = !!found
        found ??= lifestyle && (typo ? { entry: lifestyle.entry, match: { score: 1, how: 'fuzzy' as const } } : guess(lifestyle, name))
        if (typo && !had) lifestyleRuled = true
      }
      // (the CRB's certified credstick table lists the credsticks by colour: the one printed, else the standard one; `certified`
      // a detail of the certified ones; an owner ruling 2026-10-22)
      const stick = stuff ? name.match(/^(?:(certified)\s+)?(?:(standard|silver|gold|platinum|ebony)\s+)?(?:(certified)\s+)?cred\w*sticks?$/i) : null
      let ruled = false
      if (stick) {
        const sticks = [...c.entries.gear.values()].filter(e => /^credstick$/i.test(e.attrs.category ?? ''))
        const colour = (stick[2] ?? head.match(/\b(standard|silver|gold|platinum|ebony)\b/i)?.[1])?.toLowerCase()
        const named = sticks.filter(e => e.name.toLowerCase() === colour)
        if (sticks.length && !found) {
          found = { entry: standardOf(named.length ? named : sticks, prefer(c, src)), match: { score: 1, how: 'fuzzy' } }
          ruled = true
        }
      }
      const certified = !!(stick?.[1] ?? stick?.[3])
      if (stuff) found ??= viaForms(c, name, head, armored ? ['armor'] : kinds, src)
      if (stuff && !armored) found ??= viaMid(c, name, src)
      if (!natural && !power && !/cybercombat/i.test(s.category ?? ''))
        found ??= findEntry(c, name, armored ? ['armor'] : kinds, src, 'standard', s.values.rating ?? s.values.defense)
      // (a standard stand-in gives way to the name in its brackets: `rigger command console (Vulcan Liegelord)`)
      if (stuff && !armored && (!found || found.match.how === 'standard')) found = viaForms(c, name, head, kinds, src, true) ?? found
      if (stuff && !armored) found ??= viaForms(c, name, head, kinds, src, false, { rating: s.values.rating })
      if (stuff && !armored) found ??= leadWord(c, name, kinds, src, s.values.rating) ?? inAnyKind(c, name, head, src, s.values.rating)
      // (a cyberlimb word is that limb's base entry, `Arm (obvious)` or `(synthetic)` (synthetic when neither is printed, as for
      // every limb); an additional or extra limb only when the print says so; never another body part by spelling: `cyberarm`
      // is no `Cyberears`)
      const limb = stuff ? name.match(/\bcyber\s?(arm|leg|hand|foot|torso|skull)s?\b/i)?.[1] : undefined
      if (limb) {
        const quality = head.match(/\b(obvious|synthetic)\b/i)?.[1].toLowerCase() ?? 'synthetic'
        const extra = /\b(additional|extra)\b/i.test(head)
        const all = [...c.entries.augmentations.values()].filter(e => new RegExp(`\\b${limb}`, 'i').test(e.name))
        const base = all.filter(e => new RegExp(`^${limb}\\s*\\(${quality}\\)$`, 'i').test(e.name))
        const more = all.filter(e => /\b(additional|extra)\b/i.test(e.name) === extra && new RegExp(quality, 'i').test(e.name))
        const pick = extra ? more : base.length ? base : more
        if (pick.length) found = { entry: prefer(c, src)(pick), match: { score: 0.8, how: 'fuzzy' as const } }
        else if (found && !new RegExp(limb, 'i').test(found.entry.name)) found = undefined
      }
      // (a bound spirit is a creature entry, looked for nowhere else)
      if (stuff && !found && /^spirits? of\b/i.test(name)) found = findEntry(c, name, ['critters', 'spirits'], src)
      // (a standard stand-in far from the name is no guess: `certified credsticks` are not `Standard`)
      if (stuff && found?.match.how === 'standard' && found.match.score < (armored ? 0.5 : 0.3)) found = undefined
      // a device's or implant's `DR 6` is its Device Rating, not a Defense
      if (s.values.defense != null && (found ? DEVICES.has(found.entry.kind) : DEVICE_NAME.test(name))) {
        s.values.rating ??= s.values.defense
        delete s.values.defense
      }
      // armor printing a Defense and nothing like its name: the standard armor at that Defense
      const armor = !found && !attack && !power && s.values.defense != null ? standardArmor(c, s.values.defense, name) : undefined
      if (armor) found = { entry: armor, match: { score: round(nameRatio(matchKey(name), matchKey(armor.name))), how: 'standard' } }
      // the printed level's own entry: `Glow Eyes [rating 2]` is Glow Eyes 2
      if (found && s.values.rating != null) {
        // (`Cybereyes` of one book has levels 6 and 7: rating 3 is another entry named so, `Cybereyes basic system (Rating 3)`)
        const at = atLevel(c, found.entry.kind, found.entry.id, s.values.rating)
        const family = matchKey(found.entry.name)
        const level = (e: Sr6Entry) => Number(e.attrs.level ?? e.attrs.rating)
        const kin = at ? [] : [...c.entries[found.entry.kind].values()].filter(e => matchKey(e.name) === family || matchKey(e.name).startsWith(`${family} `))
        const other = kin.filter(e => level(e) === s.values.rating)
        // (a rating above the family's top level is its top level: `smartglasses (device rating 7)` is Glasses 4)
        const below = stuff ? kin.filter(e => matchKey(e.name) === family && level(e) < s.values.rating!) : []
        const top = Math.max(...below.map(level))
        found.entry = at ?? (other.length ? prefer(c, src)(other) : below.length ? prefer(c, src)(below.filter(e => level(e) === top)) : found.entry)
      }
      const entry = found?.entry
      // An attack it can't roll (a Cybercombat one is a Matrix action; another prints no DV or attack ratings it reads): an
      // item that is no weapon, its printed line kept (unread), when it prints stats at all; a bare name or book text the
      // reader ran into the line stays in the notes only.
      if (!entry && attack && ((s.values.dv == null && !s.values.ar && !s.dvText) || /cybercombat/i.test(s.category ?? ''))) {
        if (STAT_SIGN.test(printed)) out.push({ part: l.part, printed, name, printedName: name, kind: 'gear', unread: true, values: s.values, accessories: [] })
        continue
      }
      const kind: Sr6Kind = entry
        ? entry.kind
        : attack
          ? 'weapons'
          : power
            ? spell
              ? 'spells'
              : 'critterpowers'
            : l.part === 'augmentations'
              ? 'augmentations'
              : s.values.defense != null
                ? 'armor'
                : 'gear'
      const unbracketed = (a: string) => a.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
      const accessories = s.accessories
        .flatMap(licences)
        .filter(a => !GM_NOTE.test(a) && !ATTRIBUTE_VALUE.test(a) && !/\bchoice\b/i.test(a))
        .map(a => {
          if (/licen[sc]e$/i.test(a)) {
            const { thing, generic } = licenceThing(c, l.part, a)
            if (generic) generics.push({ thing, word: generic })
            return thing
          }
          const ruledAddOn = addOnInitialism(c, unbracketed(a), entry)
          const f =
            ruledAddOn ??
            findEntry(c, a, ACCESSORY_KINDS, src) ??
            abbreviated(c, a, ACCESSORY_KINDS, src) ??
            viaForms(c, unbracketed(a), a, ACCESSORY_KINDS, src) ??
            coveredBy(c, a, ACCESSORY_KINDS, src) ??
            viaMid(c, unbracketed(a), src) ??
            findEntry(c, a, ACCESSORY_KINDS, src, 'loose')
          // (an add-on the catalog lacks stays, as plain gear with its printed name; a pill is its drug, an owner ruling)
          const ruled = !!ruledAddOn || (!!f && /\b(?:pill|tablet|capsule)s?$/i.test(a))
          return f
            ? {
                part: l.part,
                printed: a,
                name: f.entry.name,
                printedName: a,
                kind: f.entry.kind,
                entry: f.entry,
                match: ruled ? { score: 1, how: 'fuzzy' as const } : f.match,
                ...(ruled ? { ruled: true as const } : {}),
                values: {},
                accessories: [],
              }
            : { part: l.part, printed: a, name: unbracketed(a), printedName: unbracketed(a), kind: 'gear' as Sr6Kind, values: {}, accessories: [] }
        })
      out.push({
        part: l.part,
        printed,
        name: entry?.name ?? (pw ? pw.name : name.replace(/\*+$/, '')),
        printedName: pw ? pw.name : name.replace(/\*+$/, ''),
        kind,
        ...((s.grade ?? lineGrade) ? { grade: s.grade ?? lineGrade } : {}),
        ...(pw && [pw.detail, pf?.rest].filter(Boolean).length ? { detail: [pf?.rest, pw.detail].filter(Boolean).join(' ') } : {}),
        ...(certified && found ? { detail: 'certified' } : {}),
        ...(ruled || lifestyleRuled || pf?.ruled ? { ruled: true as const } : {}),
        ...(found ? { entry: found.entry, match: found.match } : {}),
        ...(s.category ? { category: s.category } : {}),
        ...(s.dvText ? { dvText: s.dvText } : {}),
        values: s.values,
        ...(qty && qty > 1 ? { qty } : {}),
        accessories,
      })
      if (attack && kind === 'weapons') out.push(...ammoFor(c, out[out.length - 1], src))
    }
  }
  // an augmentation licence's detail is what the NPC has: cyberware, bioware, adept powers (`bioware` as printed)
  const type = (t: Sr6NpcThing) => t.entry?.attrs.type
  const has = [
    out.some(t => t.part === 'augmentations' && type(t) === 'cyberware') && 'cyberware',
    out.some(t => t.part === 'augmentations' && type(t) === 'bioware') && 'bioware',
    out.some(t => t.entry?.kind === 'adeptpowers') && 'physical adept',
  ].filter(Boolean)
  for (const { thing, word } of generics) thing.detail = word === 'bioware' ? 'bioware' : has.length ? has.join(', ') : word
  return out
}
/** The corrections npcThings made to a stat block, one line each, for the NPC's notes (owner 2026-10-20: "note the
 *  corrections in the notes section"): a guessed link (`Ares Predator V → Ares Predator VI (fuzzy, 0.82)`), a standard
 *  stand-in (`Smoke grenade → Smoke/thermal smoke (standard item)`), ammunition added, an attack kept that can't be rolled,
 *  and (one line) what has no catalog entry and was built from the stat block. Worked out afresh each time: never stored. */
export function npcCorrections(things: Sr6NpcThing[]): string[] {
  const all = (l: Sr6NpcThing[]): Sr6NpcThing[] => l.flatMap(t => [t, ...all(t.accessories)])
  const out: string[] = [],
    built: string[] = []
  for (const t of all(things)) {
    const was = t.printedName ?? t.name,
      m = t.match
    if (t.unread) out.push(`Kept, not rollable: ${t.printed}`)
    else if (m?.how === 'ammo')
      out.push(
        t.spare
          ? `Added: ${t.name} (spare) for ${t.ammoFor ?? 'its weapon'}`
          : `Added: ${t.name} (${t.accessories[0]?.name ?? 'regular'} ammo) ×${t.qty ?? 1}${t.load && t.qty !== t.load ? ` (${t.qty! / t.load} loads of ${t.load})` : ''} for ${t.ammoFor ?? 'its weapon'}`,
      )
    else if (t.ruled && normName(was) !== normName(t.name)) out.push(`${was} → ${t.name} (owner ruling)`)
    else if (m?.how === 'fuzzy' && normName(was) !== normName(t.name)) out.push(`${was} → ${t.name} (fuzzy, ${m.score.toFixed(2)})`)
    else if (m?.how === 'standard') out.push(`${was} → ${t.name} (standard item)`)
    else if (!m) built.push(was)
  }
  // an armor total the stat block prints over several linked pieces that add up to another (owner 2026-10-22): the error is
  // noted, the printed value kept
  const num = (e?: Sr6Entry) => Number((e?.attrs.defense ?? '').replace('+', ''))
  for (const t of things) {
    // (one body armor, the host; add-ons count when they are a cumulative one (AAS, by the ruling) or a helmet or shield; and only
    // when the printed (+N) ends the whole line, after the add-ons: not a number a piece prints itself)
    const addOn = (a: Sr6NpcThing) =>
      a.entry?.kind === 'armor' &&
      !/\d/.test(a.printed) &&
      num(a.entry) > 0 &&
      (a.ruled || /helmet|shield|hood|mask/i.test(`${a.entry.name} ${a.entry.attrs.category}`))
    const pieces = t.accessories.filter(addOn)
    const last = groups(t.printed).at(-1)
    const total = !!last && last[1] === t.printed.length - 1 && /\b(?:w\/|with)\s/i.test(t.printed.slice(0, last[0]))
    if (
      !total ||
      t.entry?.kind !== 'armor' ||
      t.match?.how === 'standard' ||
      t.values.defense == null ||
      !pieces.length ||
      t.accessories.some(a => /\d/.test(a.printed))
    )
      continue
    const sum = num(t.entry) + pieces.reduce((n, a) => n + num(a.entry), 0)
    if (sum === t.values.defense) continue
    const parts = [t.entry, ...pieces.map(a => a.entry)].map(e => `${e!.name} +${num(e)}`).join(', ')
    out.push(`Book error: ${parts} = +${sum}; the book prints +${t.values.defense}. Printed value kept.`)
  }
  if (built.length) out.push(`Not in the catalog, built from the stat block: ${[...new Set(built)].join(', ')}`)
  return out
}

const DRAIN_LABELS = { log: 'Logic', int: 'Intuition', cha: 'Charisma' } as const
/** The three drain attributes every tradition uses one of (owner 2026-10-22), in the order a tie lists them. */
const DRAIN_TRADITIONS = [
  { id: 'logic-based', name: 'Logic-Based Tradition', drainAttr: 'log' },
  { id: 'charisma-based', name: 'Charisma-Based Tradition', drainAttr: 'cha' },
  { id: 'intuition-based', name: 'Intuition-Based Tradition', drainAttr: 'int' },
] as const
export interface Sr6NpcTradition {
  /** the name of each tradition with that drain pool, joined by "or" on a tie */
  tradition: string
  drainAttr: 'log' | 'int' | 'cha'
  drain: number
  /** every tradition with that drain pool, the first the one set (one unless they tie) */
  traditions: { id: string; name: string; drainAttr: 'log' | 'int' | 'cha' }[]
}
/** A caster's tradition (an NPC whose spells line prints a spell; owner 2026-10-21 "NPC spells", 2026-10-22: every
 *  tradition resists Drain with Willpower and one of three attributes): of Willpower + Logic, + Charisma and + Intuition
 *  (CRB p. 127, from the NPC's own stats, augmented: `4(6)` is 6) the largest, as a Logic-, Charisma- or
 *  Intuition-Based Tradition; a tie lists each, the first set. None when Willpower or all three can't be read. */
export function npcTradition(npc: Sr6Npc, things: Sr6NpcThing[]): Sr6NpcTradition | undefined {
  if (!things.some(t => t.part === 'spells')) return
  const v = new Map(
    npcValues(npc).flatMap(x => {
      const m = x.ok ? x.value.match(/^(\d+)(?:\s*\((\d+)\))?$/) : null
      return m ? [[x.key, Number(m[2] ?? m[1])] as const] : []
    }),
  )
  const wil = v.get('wil')
  if (wil == null) return
  const all = DRAIN_TRADITIONS.flatMap(t => (v.has(t.drainAttr) ? [{ ...t, drain: wil + v.get(t.drainAttr)! }] : []))
  if (!all.length) return
  const drain = Math.max(...all.map(t => t.drain)),
    best = all.filter(t => t.drain === drain)
  return {
    tradition: best.map(t => t.name).join(' or '),
    drainAttr: best[0].drainAttr,
    drain,
    traditions: best.map(({ id, name, drainAttr }) => ({ id, name, drainAttr })),
  }
}
/** The tradition's line for the NPC's notes: `Tradition: Logic-Based Tradition (Willpower + Logic), drain pool 9`, a tie's `… or …`. */
export const traditionNote = (t: Sr6NpcTradition) =>
  `Tradition: ${t.traditions.map(x => `${x.name} (Willpower + ${DRAIN_LABELS[x.drainAttr]})`).join(' or ')}, drain pool ${t.drain}`

/** A built attack's skill: the one it prints as its category; none when its category is a weapon class (`Heavy Pistol`:
 *  the class says); with no category, Exotic Weapons when it reaches past close range (an elemental attack), else Close
 *  Combat. */
export function attackSkill(t: Pick<Sr6NpcThing, 'category' | 'values'>): string | undefined {
  if (t.category) return ATTACK_SKILLS.has(t.category.toLowerCase()) ? t.category : undefined
  return (t.values.ar ?? []).slice(1).some(b => b != null) ? 'Exotic Weapons' : 'Close Combat'
}

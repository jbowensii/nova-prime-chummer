// NPC things: the Sr6NpcThing shape, its match record, the NPC_MATCH threshold and the kind tables the matchers share.
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'

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
export const THING_KINDS: Record<string, Sr6Kind[]> = {
  weapons: ['weapons'],
  attacks: ['weapons'],
  gear: ['gear', 'electronics', 'armor', 'programs', 'vehicles', 'weapons'],
  augmentations: ['augmentations'],
}
// (a stat block's power the books define as a quality or a bioware, `Built Tough`, `Manasense`: after the powers)
export const POWER_KINDS: Record<'being' | 'person', Sr6Kind[]> = {
  being: ['critterpowers', 'adeptpowers', 'spells', 'complexforms', 'qualities', 'augmentations'],
  person: ['adeptpowers', 'critterpowers', 'spells', 'complexforms', 'qualities', 'augmentations'],
}
export const DEVICES = new Set<Sr6Kind>(['electronics', 'augmentations', 'programs'])
/** an attack's printed category that makes it a natural one */
export const NATURAL = /close combat|unarmed|natural|exotic weapons/i
/** an attack's printed stats: a bracket, a DV, an attack rating, a damage (`4P`) or range bands (`9/—`) */
export const STAT_SIGN = /\[|\bDV\b|\bAR\b|attack ratings?|\d\s*[PS]\b|\d\s*\/\s*(?:\d|[—–-])/i
export const DEVICE_NAME = /commlink|deck|console|\brcc\b|cyberjack|motorcycle|\bbike\b|trike/i
export const SPELL_KINDS: Sr6Kind[] = ['spells', 'rituals']
export const ACCESSORY_KINDS: Sr6Kind[] = ['weapons', 'armor', 'electronics', 'gear', 'augmentations', 'programs', 'licencetypes']
export const ATTACK_SKILLS = new Set(['close combat', 'exotic weapons', 'firearms', 'athletics'])

/** The least nameRatio of a printed name and a catalog entry's (their matchKeys) that links them (owner 2026-10-20: "75%
 *  guesses are fine for matching"; first "If you can find a perfect match, great. If not, 85% match will do"). */
export const NPC_MATCH = 0.75
/** How a stat block thing found its entry: by name (score 1), by a name at least NPC_MATCH alike, as a standard item
 *  (owner: "when in doubt use standard ammo, grenades, etc."), or as the regular ammunition of a weapon it carries. */
export type Sr6NpcMatch = { score: number; how: 'exact' | 'fuzzy' | 'standard' | 'ammo' }
export interface Index {
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
/** A grade word alone or in a bracket (`delta`, `(betaware)`): the grade, without "ware". */
export const GRADE = /^\(?(alpha|beta|gamma|delta)(?:ware)?\)?$/i

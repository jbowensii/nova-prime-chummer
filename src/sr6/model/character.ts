// The Shadowrun 6 runner model (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): one runner = one
// <sr6:character> file, read and written by src/sr6/engine/charxml.ts. The build holds what the player spent; budgets,
// rules and derived values are computed from it (src/sr6/engine/*), never stored.
import type { RunnerRule } from '../engine/creation'
import type { SampleCorrection } from '../engine/samplefix'
import { EFFECT_SWITCHES, type EffectSwitch } from '../../engine/effects'
import { newId, type Character, type Override } from '../../model/types'
import type { Sr6Entry, Sr6Kind } from './types'

/** The five creation methods. */
export type Sr6Method = 'priority' | 'sumtoten' | 'pointbuy' | 'karma' | 'lifepath'
export const SR6_METHODS: Sr6Method[] = ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath']
export const SR6_METHOD_LABELS: Record<Sr6Method, string> = { priority: 'Priority', sumtoten: 'Sum to ten', pointbuy: 'Point buy', karma: 'Karma build', lifepath: 'Lifepath' }
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']
export type PriorityColumn = 'metatype' | 'attributes' | 'magic' | 'skills' | 'resources'
export const PRIORITY_COLUMNS: PriorityColumn[] = ['metatype', 'attributes', 'magic', 'skills', 'resources']
/** The priority XSD's magic kinds (public/data/sr6/schema/common.xsd). */
export type MagicKind = 'full' | 'aspected' | 'mystic-adept' | 'adept' | 'technomancer' | 'mundane'
export const MAGIC_KIND_LABELS: Record<MagicKind, string> = {
  full: 'Full magician', aspected: 'Aspected magician', 'mystic-adept': 'Mystic adept', adept: 'Adept', technomancer: 'Technomancer', mundane: 'Mundane',
}
export type Sr6Attr = 'bod' | 'agi' | 'rea' | 'str' | 'wil' | 'log' | 'int' | 'cha' | 'edg' | 'mag' | 'res'
export const CORE_ATTRS: Sr6Attr[] = ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha']
export const SPECIAL_ATTRS: Sr6Attr[] = ['edg', 'mag', 'res']
export const SR6_ATTRS: Sr6Attr[] = [...CORE_ATTRS, ...SPECIAL_ATTRS]
/** Point buy's character-point pools. */
export type CpPool = 'attribute' | 'skill' | 'adjustment' | 'resources' | 'powerPoints' | 'spells' | 'complexForms'
export const CP_POOLS: CpPool[] = ['attribute', 'skill', 'adjustment', 'resources', 'powerPoints', 'spells', 'complexForms']

/** What a ware, power or item adds, entered by the player (or read from its catalog entry's effects, budgets.ts
 *  lineBonuses): an attribute, initiative dice, Defense Rating (dermal plating), Physical or Stun condition monitor boxes
 *  (a cyberlimb's, CRB p. 288), Damage Overflow boxes, a skill's dice pool (skill: its catalog id), the unarmed Attack
 *  Rating or Damage Value (bone lacing, CRB Hong Kong p. 286), movement metres or Matrix initiative dice (Hack & Slash's
 *  Matrix initiative booster). perRating: × the line's rating. */
export interface Bonus { target: Sr6Attr | 'initDice' | 'defense' | 'physical' | 'stun' | 'overflow' | 'skill' | 'unarmedAR' | 'unarmedDV' | 'movement' | 'matrixInitDice'; skill?: string; value: number; perRating?: true
  /** only on some tests or situations (`sound-based Con tests`): in the bracketed total (owner decision 2026-10-10) */
  when?: string
  /** only on the tests of a specialization (`Climbing`): added to that specialization's pool when the runner has it, else
   *  in the skill's bracketed total (owner decision 2026-10-10) */
  spec?: string
  /** a spell's or complex form's: on its caster (while sustained) or its target(s) (never counted on the caster) */
  affects?: 'caster' | 'target'
  /** how it is turned on (none: always on, folded into a stat block's printed number): a wireless bonus, ware or a power
   *  activated (released at will), a sustained one, or one holding on some tests only: counted in the bracketed total, as
   *  a book prints a switchable bonus in brackets, `4(5)` (owner, 2026-10-10). */
  switch?: BonusSwitch }
/** the switch both games' effects share (src/engine/effects.ts) */
export type BonusSwitch = EffectSwitch
export const BONUS_SWITCHES: BonusSwitch[] = EFFECT_SWITCHES
export const BONUS_TARGETS: Bonus['target'][] = [...SR6_ATTRS, 'initDice', 'defense', 'physical', 'stun', 'overflow', 'skill', 'unarmedAR', 'unarmedDV', 'movement', 'matrixInitDice']

export type PickKind = 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics' | 'echoes'
export const PICK_KINDS: PickKind[] = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes']
export type PurchaseKind = 'weapons' | 'armor' | 'augmentations' | 'electronics' | 'programs' | 'gear' | 'vehicles' | 'ammotypes'
export const PURCHASE_KINDS: PurchaseKind[] = ['weapons', 'armor', 'augmentations', 'electronics', 'programs', 'gear', 'vehicles', 'ammotypes']

/** A bought thing. No id: a custom item at the player's own cost/avail/essence (R). snapshot: the catalog entry as it was,
 *  written on export so the line still reads when the entry is gone. */
export interface Sr6Purchase {
  uid: string; kind: PurchaseKind; id?: string; name?: string; cost?: number; avail?: number; essence?: number; rating?: number
  qty: number; grade?: string; worn?: true; bonuses?: Bonus[]; note?: string; accessories: Sr6Purchase[]; snapshot?: Sr6Entry
}
export interface Sr6Skill { id: string; points: number; karma: number; spec?: string; expertise?: string }
export interface Sr6Knowledge { uid: string; name: string; kind: 'knowledge' | 'language'; native?: true; points: number; karma: number }
/** free: a metatype trait (costs nothing, can't be removed). name: the catalog name when it was added (shown if the entry goes).
 *  karma: for a quality priced in a range (karma–karmaMax, as Allergy's severity sets it), the karma it was taken for. */
export interface Sr6Quality { uid: string; id: string; level: number; free?: true; note?: string; name?: string; karma?: number }
export interface Sr6Pick { uid: string; kind: PickKind; id: string; level?: number; bonuses?: Bonus[]; name?: string }
/** A martial arts style (catalog martialarts) and the techniques learned under it (martialtechniques; its signature one
 *  free, Firing Squad p. 97). name: the catalog name when it was added. */
export interface Sr6MartialArt { uid: string; id: string; name?: string; techniques: Sr6Technique[] }
export interface Sr6Technique { uid: string; id: string; name?: string }
/** types: the Sixth World Companion's contact types (lifepath's contact points go by type). */
export interface Sr6Contact { uid: string; name: string; archetype: string; connection: number; loyalty: number; types?: ContactType[] }
export type ContactType = 'academic' | 'corporate' | 'criminal' | 'engineering' | 'government' | 'magic' | 'matrix' | 'media' | 'medical' | 'street'
export const CONTACT_TYPES: ContactType[] = ['academic', 'corporate', 'criminal', 'engineering', 'government', 'magic', 'matrix', 'media', 'medical', 'street']
/** A lifestyle always belongs to a SIN (the one it's paid under); id: the catalog lifestyle. */
export interface Sr6Lifestyle { uid: string; id: string; months: number }
/** gender: the identity's own (optional; the runner's is identity.gender). lifestyles: none, one or more. placeholder: an
 *  unnamed stand-in (kind real, no rating, free) holding an older file's lifestyle when the runner had no SIN (charxml.ts);
 *  naming it or setting its kind or rating makes it a normal SIN. */
export interface Sr6Sin { uid: string; name: string; kind: 'real' | 'fake'; rating?: number; gender?: string; licences: { name: string; rating: number }[]
  lifestyles?: Sr6Lifestyle[]; placeholder?: true }
/** A SIN's name as shown: a placeholder's reads Unnamed SIN. */
export const sinName = (s: Sr6Sin, fallback = 'SIN') => s.name || (s.placeholder ? 'Unnamed SIN' : fallback)
/** A SIN's kind as shown: `placeholder`, `real`, or `fake, rating 3`. */
export const sinKind = (s: Sr6Sin) => (s.placeholder ? 'placeholder' : s.kind === 'real' ? 'real' : `fake, rating ${s.rating ?? 1}`)
/** choices: a life module's mixed choice, by its index, to the option picked (an attribute abbr, skill:<id> or nuyen:<n>). */
export interface Sr6LifeModule { id: string; choices: Record<number, string> }
export interface Sr6AttrSpend { points: number; adjust: number; karma: number }

export interface Sr6Build {
  method: Sr6Method
  priorities: Record<PriorityColumn, Letter | null>
  cp: Record<CpPool, number>
  lifepath: Sr6LifeModule[]
  /** a metatype id, '' while none is picked */
  metatype: string
  magic: MagicKind
  aspectedSkill?: string; tradition?: string; drainAttr?: 'log' | 'int' | 'cha'
  /** lifepath: the best attribute (raised by lifepath.bestAttributeBonus up to its metatype maximum) and the one that
   *  takes what the maximum leaves over */
  bestAttr?: Sr6Attr; bestExtra?: Sr6Attr
  powerPointsBought: number; initiation: number; submersion: number
  attributes: Record<Sr6Attr, Sr6AttrSpend>
  skills: Sr6Skill[]
  knowledge: Sr6Knowledge[]
  qualities: Sr6Quality[]
  picks: Sr6Pick[]
  martialArts: Sr6MartialArt[]
  purchases: Sr6Purchase[]
  contacts: Sr6Contact[]
  /** each with its lifestyles (an older file's single build lifestyle loads onto its first SIN: charxml.ts) */
  sins: Sr6Sin[]
  karmaToNuyen: number
}

/** A career spend (S3), replayed on the finalized build (src/sr6/engine/career.ts). target: an attribute, a skill id or
 *  (buyoff, drop) the line's uid; line: what joins the build (buyoff, drop: the removed one, kept for the history).
 *  convert: karma > 0 turns karma into nuyen, < 0 nuyen into karma. */
export type Sr6Advance =
  | { op: 'attribute'; target: Sr6Attr }
  | { op: 'skill'; target: string }
  | { op: 'spec'; target: string; name: string }
  | { op: 'expertise'; target: string; name: string }
  | { op: 'knowledge'; line: Sr6Knowledge }
  | { op: 'quality'; line: Sr6Quality }
  | { op: 'buyoff'; target: string; line?: Sr6Quality }
  | { op: 'pick'; line: Sr6Pick }
  /** a style (with its signature technique), or a technique learned under the style whose uid is target */
  | { op: 'martialart'; line: Sr6MartialArt }
  | { op: 'technique'; target: string; line: Sr6Technique }
  | { op: 'powerpoint' }
  | { op: 'initiate'; line?: Sr6Pick }
  | { op: 'purchase'; line: Sr6Purchase }
  | { op: 'drop'; target: string; line?: Sr6Purchase }
  | { op: 'contact'; line: Sr6Contact }
  /** a new SIN (no lifestyles; licences bought with it), or, line.uid naming a placeholder SIN, that one named and made
   *  a normal SIN (its lifestyles kept) */
  | { op: 'sin'; line: Sr6Sin }
  /** sin, uid: the SIN it's paid under and the lifestyle's uid when new. An entry recorded before lifestyles belonged to
   *  SINs has neither: it goes to the first SIN's first lifestyle (more months of it, or another lifestyle replacing it). */
  | { op: 'lifestyle'; id: string; months: number; sin?: string; uid?: string }
  | { op: 'convert'; karma: number }
  | { op: 'other' }
export type Sr6AdvanceOp = Sr6Advance['op']
export const SR6_ADVANCE_OPS: Sr6AdvanceOp[] = ['attribute', 'skill', 'spec', 'expertise', 'knowledge', 'quality', 'buyoff', 'pick',
  'martialart', 'technique', 'powerpoint', 'initiate', 'purchase', 'drop', 'contact', 'sin', 'lifestyle', 'convert', 'other']
/** One career ledger line (append-only; a void entry undoes another). Advance amounts are spent; negative is gained. */
export type Sr6LedgerEntry = { id: string; at: string } & (
  | { type: 'finalize'; karma: number; nuyen: number }
  | { type: 'earn'; karma: number; nuyen: number; run: string; date: string }
  | { type: 'advance'; advance: Sr6Advance; label: string; karma: number; nuyen: number }
  | { type: 'note'; text: string }
  | { type: 'void'; eventId: string; reason: string })
export type Sr6LedgerType = Sr6LedgerEntry['type']
export const SR6_LEDGER_TYPES: Sr6LedgerType[] = ['finalize', 'earn', 'advance', 'note', 'void']

/** An SR6 NPC's stat block: the catalog entry's printed values (or the GM's) and its rating, evaluated at the rating. */
export type Sr6NpcKind = 'grunt' | 'contact' | 'critter' | 'spirit' | 'sprite'
export const SR6_NPC_KINDS: Sr6NpcKind[] = ['grunt', 'contact', 'critter', 'spirit', 'sprite']
export const SR6_NPC_PARTS = ['skills', 'powers', 'optionalPowers', 'weaknesses', 'attacks', 'augmentations', 'gear', 'weapons'] as const
export interface Sr6Npc {
  kind: Sr6NpcKind; rating?: number; group?: string
  from?: { kind: Sr6Kind; id: string; name: string; source: string; page: number }
  stats: Record<string, string>
  lines: { part: string; text: string }[]
}

/** A book sample's stat block numbers as printed (key: an attribute abbreviation, ess, init, cm or dr; value as printed,
 *  `5(7)`, `8(10) + 3D6`, `11/10`), with the book's source and page: Review compares them with the rules'. */
export interface Sr6Printed { source: string; page: number; values: Record<string, string> }

/** identity.metatype mirrors build.metatype (the file keeps it once, on the root). final: the karma and nuyen left at Finalize.
 *  npc: set on an NPC (its build stays blank). sampleKey: the catalog entry a book NPC was loaded from, or the book sample an
 *  example runner was copied from (`<source>|<id>`). house: copies of the GM compendium entries it uses
 *  (src/sr6/engine/house.ts), so it keeps them when the compendium is unshared or deleted. */
export interface Sr6Character {
  formatVersion: 1; id: string; identity: Character['identity']; build: Sr6Build
  finalizedAt?: string; final?: { karma: number; nuyen: number }; campaign?: string
  ledger: Sr6LedgerEntry[]; npc?: Sr6Npc; sampleKey?: string; house?: Sr6Entry[]; printed?: Sr6Printed
  overrides: Override[]; updatedAt: string; lastExportedAt?: string
  /** the runner's own choices of the optional creation rules (src/sr6/engine/creation.ts runnerRules); none: the table's */
  rules?: RunnerRule[]
  /** (never stored) its book sample's printed lines as the owner's override file corrects them (engine/samplefix.ts) */
  corrections?: SampleCorrection[]
  /** catalog ids turned into the ones a re-import gave the entries (src/sr6/engine/migrate.ts): `<kind>/<id>` each */
  migrated?: { from: string; to: string; at: string }[]
}

export const blankBuild = (method: Sr6Method = 'priority'): Sr6Build => ({
  method,
  priorities: { metatype: null, attributes: null, magic: null, skills: null, resources: null },
  cp: Object.fromEntries(CP_POOLS.map(p => [p, 0])) as Sr6Build['cp'],
  lifepath: [], metatype: '', magic: 'mundane', powerPointsBought: 0, initiation: 0, submersion: 0,
  attributes: Object.fromEntries(SR6_ATTRS.map(a => [a, { points: 0, adjust: 0, karma: 0 }])) as Sr6Build['attributes'],
  skills: [], knowledge: [], qualities: [], picks: [], martialArts: [], purchases: [], contacts: [], sins: [], karmaToNuyen: 0,
})

/** A new runner: no metatype, mundane, nothing spent. */
export function blankSr6(method: Sr6Method = 'priority', id = newId(), now = new Date().toISOString()): Sr6Character {
  return { formatVersion: 1, id, identity: { name: '', streetName: '', metatype: '', background: '', notes: '' },
    build: blankBuild(method), ledger: [], overrides: [], updatedAt: now }
}

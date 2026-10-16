// The Shadowrun 6 runner model (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): one runner = one
// <sr6:character> file, read and written by src/sr6/engine/charxml.ts. The build holds what the player spent; budgets,
// rules and derived values are computed from it (src/sr6/engine/*), never stored.
import { EFFECT_SWITCHES, type EffectSwitch } from '../../shared/effects'
import { newId, type Character, type Override } from '../../model/types'
import type { Sr6Entry, Sr6Kind } from './types'

/** The five creation methods. */
export type Sr6Method = 'priority' | 'sumtoten' | 'pointbuy' | 'karma' | 'lifepath'
export const SR6_METHODS: Sr6Method[] = ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath']
export const SR6_METHOD_LABELS: Record<Sr6Method, string> = {
  priority: 'Priority',
  sumtoten: 'Sum to ten',
  pointbuy: 'Point buy',
  karma: 'Karma build',
  lifepath: 'Lifepath',
}
export type Letter = 'A' | 'B' | 'C' | 'D' | 'E'
export const LETTERS: Letter[] = ['A', 'B', 'C', 'D', 'E']
export type PriorityColumn = 'metatype' | 'attributes' | 'magic' | 'skills' | 'resources'
export const PRIORITY_COLUMNS: PriorityColumn[] = ['metatype', 'attributes', 'magic', 'skills', 'resources']
/** The priority XSD's magic kinds (public/data/sr6/schema/common.xsd). */
export type MagicKind = 'full' | 'aspected' | 'mystic-adept' | 'adept' | 'technomancer' | 'mundane'
export const MAGIC_KIND_LABELS: Record<MagicKind, string> = {
  full: 'Full magician',
  aspected: 'Aspected magician',
  'mystic-adept': 'Mystic adept',
  adept: 'Adept',
  technomancer: 'Technomancer',
  mundane: 'Mundane',
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
export interface Bonus {
  target: Sr6Attr | 'initDice' | 'defense' | 'physical' | 'stun' | 'overflow' | 'skill' | 'unarmedAR' | 'unarmedDV' | 'movement' | 'matrixInitDice'
  skill?: string
  value: number
  perRating?: true
  /** less so much after the rating is counted (`R-1`: a level after the first, owner 2026-10-11); with perRating */
  minus?: number
  /** a value per rating, the book's own table (`1,1,2,2`: rating 1 gives 1, rating 3 gives 2; owner 2026-10-11) */
  byRating?: number[]
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
  switch?: BonusSwitch
}
/** the switch both games' effects share (src/shared/effects.ts) */
export type BonusSwitch = EffectSwitch
export const BONUS_SWITCHES: BonusSwitch[] = EFFECT_SWITCHES
export const BONUS_TARGETS: Bonus['target'][] = [
  ...SR6_ATTRS,
  'initDice',
  'defense',
  'physical',
  'stun',
  'overflow',
  'skill',
  'unarmedAR',
  'unarmedDV',
  'movement',
  'matrixInitDice',
]

/** datastructures: a technomancer's data structures (Hack & Slash pp. 70–72), by level */
export type PickKind = 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics' | 'echoes' | 'datastructures'
export const PICK_KINDS: PickKind[] = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes', 'datastructures']
/** critters: a critter the runner owns (catalog critters; the Critters tab, src/sr6/engine/critters.ts) */
export type PurchaseKind = 'weapons' | 'armor' | 'augmentations' | 'electronics' | 'programs' | 'gear' | 'vehicles' | 'ammotypes' | 'critters'
export const PURCHASE_KINDS: PurchaseKind[] = ['weapons', 'armor', 'augmentations', 'electronics', 'programs', 'gear', 'vehicles', 'ammotypes', 'critters']
/** The pet classes a player picks for a critter bought (Wild Life p. 180); Awakened and Emerged come from its Magic or
 *  Resonance. */
export type PetClass = 'mundane' | 'exotic' | 'wild'
export const PET_CLASSES: PetClass[] = ['mundane', 'exotic', 'wild']
/** One of an owned critter's companion qualities (Wild Life pp. 184-186, catalog qualities of class CRITTERWARE/QUALITY).
 *  how: none, specified when it was bought (its Karma moves the price, p. 180); tamed, the Wild Soul and the negative
 *  balancing it a tamed critter gets (p. 184); bonded, bought with the runner's own Karma through the Critter Bond path's
 *  Permanent Improvement (SWC p. 139). bought: (never stored; the career build's) the id and level one specified with
 *  the purchase had before a bond upgraded it: what its price still reads. */
export interface Sr6CritterQuality {
  uid: string
  id: string
  level: number
  name?: string
  how?: 'tamed' | 'bonded'
  bought?: { id: string; level: number }
}
/** One of an owned critter's trained commands or special trainings (Wild Life pp. 181-183: a catalog action of category
 *  Critter Command Actions or Critter Special Training; no id: an older file's unnamed one, kept from its count). taught:
 *  taught after it was bought (+500¥ a command, +750¥ a special training, p. 180; a tamed critter's always are); absent:
 *  it came with the purchase (+1 Body in the price formula and +1 Availability each, p. 183). */
export interface Sr6CritterTrained {
  uid: string
  what: 'command' | 'training'
  id?: string
  name?: string
  taught?: true
}

/** A bought thing. No id: a custom item at the player's own cost/avail/essence (R). snapshot: the catalog entry as it was,
 *  written on export so the line still reads when the entry is gone. */
/** A vehicle's or drone's mod slot categories (Double Clutch p. 120). */
export type SlotKind = 'chassis' | 'powertrain' | 'electronics'
export const SLOT_KINDS: SlotKind[] = ['chassis', 'powertrain', 'electronics']
/** One shift of mod slots (Double Clutch p. 120: any available slots can be shifted to another category at 2:1): two
 *  slots of `from` give one of `to`. */
export interface SlotShift {
  from: SlotKind
  to: SlotKind
}
export interface Sr6Purchase {
  uid: string
  kind: PurchaseKind
  id?: string
  name?: string
  cost?: number
  avail?: number
  essence?: number
  rating?: number
  qty: number
  grade?: string
  worn?: true
  bonuses?: Bonus[]
  note?: string
  accessories: Sr6Purchase[]
  snapshot?: Sr6Entry
  /** a vehicle's seats taken out for cargo (cargoWithoutSeats: Double Clutch p. 126) */
  seatsRemoved?: number
  /** a weapon fitted to a vehicle or drone: the uid of the weapon mount (its sibling accessory) it sits in */
  mount?: string
  /** a vehicle mod installed by the player: half its nuyen price (Double Clutch p. 120; never an accessory's: owner Q6) */
  diy?: true
  /** a vehicle or drone bought from a design in the Designer: the design's id (its line's id is `design.<id>`, its
   *  snapshot the vehicle the design worked out to when bought; later edits to the design never change it) */
  design?: string
  /** a vehicle or drone's mod slots shifted between categories, in the order made (Double Clutch p. 120) */
  slotShifts?: SlotShift[]
  /** a critter: the pet class the player chose (none: mundane), tamed from the wild instead of bought (no price, Wild
   *  Life p. 184), its named commands and special training (pp. 181-183) and companion qualities */
  pet?: PetClass
  tamed?: true
  trained?: Sr6CritterTrained[]
  critterQualities?: Sr6CritterQuality[]
}

/** A vehicle or drone design (the Designer, Double Clutch pp. 150-155): the parts picked (catalog vehicledesign ids),
 *  each option, modification or quality factor with its level (1 for one taken once; negative: an option taken in
 *  reverse), the mods built in as design options (gear lines: 2 Design Points per mod slot, their nuyen added to the
 *  price), built yourself (half the price, p. 155) and approved by a GM (bought designs then need no approval). Nothing
 *  derived is stored (src/sr6/engine/design.ts works it out). */
export interface Sr6Design {
  kind: 'vehicle' | 'drone'
  chassis?: string
  powertrain?: string
  console?: string
  /** road: Improved Handling for on-road or off-road only (3 Design Points a level, DC p. 151); absent: both */
  options: { id: string; level: number; road?: 'on' | 'off' }[]
  mods: Sr6Purchase[]
  diy?: true
  approved?: true
}
/** specs: specializations past the first (Exotic Weapons, CRB Hong Kong p. 95; any skill with the Sixth World Companion's
 *  Expanded Specializations, p. 153) */
export interface Sr6Skill {
  id: string
  points: number
  karma: number
  spec?: string
  expertise?: string
  specs?: string[]
}
export interface Sr6Knowledge {
  uid: string
  name: string
  kind: 'knowledge' | 'language'
  native?: true
  points: number
  karma: number
}
/** free: a metatype trait (costs nothing, can't be removed). name: the catalog name when it was added (shown if the entry goes).
 *  karma: for a quality priced in a range (karma–karmaMax, as Allergy's severity sets it), the karma it was taken for. */
export interface Sr6Quality {
  uid: string
  id: string
  level: number
  free?: true
  note?: string
  name?: string
  karma?: number
  /** Stolen Gear (No Future errata, NF p. 162): the converted karma bought off so far after creation, a part at a time */
  boughtOff?: number
}
/** note: the skill or attribute a power naming its choice is for (`Improved Ability (Skill)`: its note `Firearms`) */
export interface Sr6Pick {
  uid: string
  kind: PickKind
  id: string
  level?: number
  bonuses?: Bonus[]
  name?: string
  note?: string
}
/** A martial arts style (catalog martialarts) and the techniques learned under it (martialtechniques; its signature one
 *  free, Firing Squad p. 97). name: the catalog name when it was added. */
export interface Sr6MartialArt {
  uid: string
  id: string
  name?: string
  techniques: Sr6Technique[]
}
export interface Sr6Technique {
  uid: string
  id: string
  name?: string
}
/** types: the Sixth World Companion's contact types (lifepath's contact points go by type). */
export interface Sr6Contact {
  uid: string
  name: string
  archetype: string
  connection: number
  loyalty: number
  types?: ContactType[]
}
export type ContactType = 'academic' | 'corporate' | 'criminal' | 'engineering' | 'government' | 'magic' | 'matrix' | 'media' | 'medical' | 'street'
export const CONTACT_TYPES: ContactType[] = ['academic', 'corporate', 'criminal', 'engineering', 'government', 'magic', 'matrix', 'media', 'medical', 'street']
/** A lifestyle always belongs to a SIN (the one it's paid under); id: the catalog lifestyle. */
export interface Sr6Lifestyle {
  uid: string
  id: string
  months: number
}
/** gender: the identity's own (optional; the runner's is identity.gender). lifestyles: none, one or more. placeholder: an
 *  unnamed stand-in (kind real, no rating, free) holding an older file's lifestyle when the runner had no SIN (charxml.ts);
 *  naming it or setting its kind or rating makes it a normal SIN. */
export interface Sr6Sin {
  uid: string
  name: string
  kind: 'real' | 'fake'
  rating?: number
  gender?: string
  licences: Sr6Licence[]
  lifestyles?: Sr6Lifestyle[]
  placeholder?: true
}
/** One of a SIN's licences (every licence is one SIN's: owner 2026-10-16): a fake licence (`Firearm license 3`), or an
 *  owned item's (item: its line's uid, an accessory's too; named after the licence type covering it, purchases.ts
 *  licenceName, renamable). Rated as its SIN (licenceRating). Priced rating × licencePerRating, but an item's on a real
 *  SIN at the fee its Availability prints. Never enforced. */
export interface Sr6Licence {
  name: string
  rating: number
  item?: string
}
/** A licence's rating: its SIN's (owner 2026-10-16), at least 1; a real SIN has none, so 1. */
export const licenceRating = (s: Pick<Sr6Sin, 'kind' | 'rating'>) => Math.max(1, s.kind === 'fake' ? (s.rating ?? 1) : 1)
/** Every licence of a SIN rated as the SIN (after its rating or kind changes, and on load); the SIN, for chaining. */
export function rateLicences<S extends Pick<Sr6Sin, 'kind' | 'rating' | 'licences'>>(s: S): S {
  for (const l of s.licences) l.rating = licenceRating(s)
  return s
}
/** An owned item's licence on a SIN, rated as the SIN; `name`: the licence type covering it (absent, the line's own). */
export const itemLicence = (x: Sr6Purchase, s: Sr6Sin, name?: string): Sr6Licence => ({
  name: name || x.name || x.snapshot?.name || 'Custom item',
  rating: licenceRating(s),
  item: x.uid,
})
/** A SIN's name as shown: a placeholder's reads Unnamed SIN. */
export const sinName = (s: Sr6Sin, fallback = 'SIN') => s.name || (s.placeholder ? 'Unnamed SIN' : fallback)
/** A SIN's kind as shown: `placeholder`, `real`, or `fake, rating 3`. */
export const sinKind = (s: Sr6Sin) => (s.placeholder ? 'placeholder' : s.kind === 'real' ? 'real' : `fake, rating ${s.rating ?? 1}`)
/** choices: a life module's mixed choice, by its index, to the option picked (an attribute abbr, skill:<id> or nuyen:<n>). */
export interface Sr6LifeModule {
  id: string
  choices: Record<number, string>
}
export interface Sr6AttrSpend {
  points: number
  adjust: number
  karma: number
}

export interface Sr6Build {
  method: Sr6Method
  priorities: Record<PriorityColumn, Letter | null>
  cp: Record<CpPool, number>
  lifepath: Sr6LifeModule[]
  /** a metatype id, '' while none is picked */
  metatype: string
  magic: MagicKind
  /** the player's override of the Awakened flag (src/sr6/engine/infected.ts awakenedFlag); none: derived */
  awakened?: boolean
  /** the magic kind before the Infected type changed it (Awakened it, or took a technomancer's Resonance: SWC p. 105);
   *  the kind the method bought, and what taking the type away restores */
  infectedFrom?: MagicKind
  aspectedSkill?: string
  tradition?: string
  drainAttr?: 'log' | 'int' | 'cha'
  /** the mentor spirit followed (a catalog mentorspirits id; it comes with the Mentor Spirit quality, mentorSpiritQuality), and
   *  a mystic adept's pick of its advantages (CRB Hong Kong pp. 162–163: one, for good) */
  mentorSpirit?: string
  mentorAdvantage?: 'magician' | 'adept'
  /** lifepath: the best attribute (raised by lifepath.bestAttributeBonus up to its metatype maximum) and the one that
   *  takes what the maximum leaves over */
  bestAttr?: Sr6Attr
  bestExtra?: Sr6Attr
  powerPointsBought: number
  initiation: number
  submersion: number
  /** the Sixth World Companion's optional Transhumanism (p. 146): a mundane's transhumanist grades, each an Essence hole of 1.0 */
  transhuman: number
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
  /** target: the uid of the lower level of the same family the line replaces (levels.ts), priced at the difference;
   *  magic: the kind an Infected type leaves the runner (infected.ts infectedKind), set when it changes it */
  | { op: 'quality'; line: Sr6Quality; target?: string; magic?: MagicKind }
  /** part: Stolen Gear's converted karma bought off by this spend, a part of what is left (the line stays); none: all */
  | { op: 'buyoff'; target: string; line?: Sr6Quality; part?: number }
  /** target: as a quality's, the lower level replaced */
  | { op: 'pick'; line: Sr6Pick; target?: string }
  /** a style (with its signature technique), or a technique learned under the style whose uid is target */
  | { op: 'martialart'; line: Sr6MartialArt }
  | { op: 'technique'; target: string; line: Sr6Technique }
  | { op: 'powerpoint' }
  | { op: 'initiate'; line?: Sr6Pick; target?: string }
  | { op: 'purchase'; line: Sr6Purchase }
  | { op: 'drop'; target: string; line?: Sr6Purchase }
  /** a bought item (target: its uid) replaced by a higher level of its family (levels.ts), its accessories and grade
   *  kept, at the new level's full price (the core rulebook prints no trade-in rule) */
  | { op: 'upgrade'; target: string; line: Sr6Purchase }
  /** an accessory (a vehicle mod, a weapon in a mount, an autosoft) fitted to the owned line whose uid is target, at its
   *  price (do it yourself: half); unfit: the accessory whose uid is target taken off (no refund), kept for the history */
  | { op: 'fit'; target: string; line: Sr6Purchase }
  | { op: 'unfit'; target: string; line?: Sr6Purchase }
  /** two mod slots of `from` shifted to one of `to` on the owned vehicle or drone whose uid is target (Double Clutch p. 120;
   *  free); voiding it shifts them back */
  | ({ op: 'shift'; target: string } & SlotShift)
  /** a weapon (target: its uid) moved to another weapon mount of the same vehicle or drone (mount: that accessory's uid),
   *  no new charge; voiding it puts the weapon back in the mount it was in */
  | { op: 'move'; target: string; mount: string }
  /** a companion quality for the owned critter whose uid is target, bought with the runner's Karma (the Critter Bond
   *  path's Permanent Improvement, SWC p. 139), with the negative quality `with` taken alongside (Wild Life p. 184); a
   *  line whose uid names one of the critter's qualities upgrades that one (its id and level replaced) */
  | { op: 'bond'; target: string; line: Sr6CritterQuality; with?: Sr6CritterQuality }
  /** a command or special training taught to the owned critter whose uid is target (Wild Life p. 180: +500¥ a command,
   *  +750¥ a special training); past its limit it is recorded (Review warns); voiding it takes it back */
  | { op: 'teach'; target: string; line: Sr6CritterTrained }
  | { op: 'contact'; line: Sr6Contact }
  /** a new SIN (no lifestyles; licences bought with it), or, line.uid naming a placeholder SIN, that one named and made
   *  a normal SIN (its lifestyles kept) */
  | { op: 'sin'; line: Sr6Sin }
  /** sin, uid: the SIN it's paid under and the lifestyle's uid when new. An entry recorded before lifestyles belonged to
   *  SINs has neither: it goes to the first SIN's first lifestyle (more months of it, or another lifestyle replacing it). */
  | { op: 'lifestyle'; id: string; months: number; sin?: string; uid?: string }
  | { op: 'convert'; karma: number }
  /** the Awakened flag's override set after creation (value absent: derived again; infected.ts awakenedFlag), free */
  | { op: 'awakened'; value?: boolean }
  /** a licence for an owned line (target, its uid; an accessory's too) on one of the runner's SINs (sin, its uid): on a
   *  fake SIN one of its fake licences (rated as the SIN), on a real one at the fee its Availability prints; name: the
   *  licence's as recorded (the licence type covering the item) */
  | { op: 'licensed'; target: string; sin: string; name?: string }
  | { op: 'other' }
export type Sr6AdvanceOp = Sr6Advance['op']
export const SR6_ADVANCE_OPS: Sr6AdvanceOp[] = [
  'attribute',
  'skill',
  'spec',
  'expertise',
  'knowledge',
  'quality',
  'buyoff',
  'pick',
  'martialart',
  'technique',
  'powerpoint',
  'initiate',
  'purchase',
  'drop',
  'upgrade',
  'fit',
  'unfit',
  'shift',
  'move',
  'bond',
  'teach',
  'contact',
  'sin',
  'lifestyle',
  'convert',
  'awakened',
  'licensed',
  'other',
]
/** One career ledger line (append-only; a void entry undoes another). Advance amounts are spent; negative is gained. */
export type Sr6LedgerEntry = { id: string; at: string } & (
  | { type: 'finalize'; karma: number; nuyen: number }
  | { type: 'earn'; karma: number; nuyen: number; run: string; date: string }
  | { type: 'advance'; advance: Sr6Advance; label: string; karma: number; nuyen: number }
  | { type: 'note'; text: string }
  | { type: 'void'; eventId: string; reason: string }
)
export type Sr6LedgerType = Sr6LedgerEntry['type']
export const SR6_LEDGER_TYPES: Sr6LedgerType[] = ['finalize', 'earn', 'advance', 'note', 'void']

/** An SR6 NPC's stat block: the catalog entry's printed values (or the GM's) and its rating, evaluated at the rating. */
export type Sr6NpcKind = 'grunt' | 'contact' | 'critter' | 'spirit' | 'sprite'
export const SR6_NPC_KINDS: Sr6NpcKind[] = ['grunt', 'contact', 'critter', 'spirit', 'sprite']
export const SR6_NPC_PARTS = ['skills', 'powers', 'optionalPowers', 'weaknesses', 'attacks', 'augmentations', 'gear', 'weapons'] as const
export interface Sr6Npc {
  kind: Sr6NpcKind
  rating?: number
  group?: string
  from?: { kind: Sr6Kind; id: string; name: string; source: string; page: number }
  stats: Record<string, string>
  lines: { part: string; text: string }[]
  /** a critter the GM designs (the Design tab, src/sr6/engine/critterdesign.ts): its powers, weaknesses and skills, the
   *  lines generated from them */
  design?: Sr6CritterDesign
}
/** A designed critter's power or weakness: its catalog critter power (id; none: not in the catalog, by name), its level
 *  and note (`Enhanced Senses (Hearing, Smell)`: the note Hearing, Smell). Innate: 0 Karma. */
export interface Sr6CritterPower {
  id?: string
  name: string
  level?: number
  note?: string
}
export interface Sr6CritterDesign {
  powers: Sr6CritterPower[]
  weaknesses: Sr6CritterPower[]
  /** id: the catalog skill (none: by name) */
  skills: { id?: string; name: string; rank: number; spec?: string }[]
  /** initiative dice, as the GM enters them */
  dice: number
}

/** A book sample's stat block numbers as printed (key: an attribute abbreviation, ess, init, cm or dr; value as printed,
 *  `5(7)`, `8(10) + 3D6`, `11/10`), with the book's source and page: Review compares them with the rules'. */
export interface Sr6Printed {
  source: string
  page: number
  values: Record<string, string>
}

/** identity.metatype mirrors build.metatype (the file keeps it once, on the root). final: the karma and nuyen left at Finalize.
 *  npc: set on an NPC (its build stays blank). design: set on a vehicle or drone design (likewise). sampleKey: the catalog entry a book NPC was loaded from, or the book sample an
 *  example runner was copied from (`<source>|<id>`). house: copies of the GM compendium entries it uses
 *  (src/sr6/engine/house.ts), so it keeps them when the compendium is unshared or deleted. */
export interface Sr6Character {
  formatVersion: 1
  id: string
  identity: Character['identity']
  build: Sr6Build
  finalizedAt?: string
  final?: { karma: number; nuyen: number }
  campaign?: string
  ledger: Sr6LedgerEntry[]
  npc?: Sr6Npc
  /** set on a vehicle or drone design (the Designer's store; its build stays blank) */
  design?: Sr6Design
  sampleKey?: string
  house?: Sr6Entry[]
  printed?: Sr6Printed
  overrides: Override[]
  updatedAt: string
  lastExportedAt?: string
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
  lifepath: [],
  metatype: '',
  magic: 'mundane',
  powerPointsBought: 0,
  initiation: 0,
  submersion: 0,
  transhuman: 0,
  attributes: Object.fromEntries(SR6_ATTRS.map(a => [a, { points: 0, adjust: 0, karma: 0 }])) as Sr6Build['attributes'],
  skills: [],
  knowledge: [],
  qualities: [],
  picks: [],
  martialArts: [],
  purchases: [],
  contacts: [],
  sins: [],
  karmaToNuyen: 0,
})

/** A new runner: no metatype, mundane, nothing spent. */
export function blankSr6(method: Sr6Method = 'priority', id = newId(), now = new Date().toISOString()): Sr6Character {
  return {
    formatVersion: 1,
    id,
    identity: { name: '', streetName: '', metatype: '', background: '', notes: '' },
    build: blankBuild(method),
    ledger: [],
    overrides: [],
    updatedAt: now,
  }
}

/** A runner's own choice of a creation setting (Sr6Character.rules): `value` as stored ('' turns the setting off);
 *  assumed: a sample runner's, from its book's numbers (the book doesn't say). */
export interface RunnerRule {
  key: string
  value: string
  assumed?: true
  source?: string
  page?: number
}

/** One correction applied: the runner's line, what the book prints and what it reads as, the fix's page and note. */
export interface SampleCorrection {
  path: string
  item: string
  field: string
  from: string
  to: string
  source: string
  page: number
  note?: string
}

/** A GM's SR6 compendium (src/sr6/engine/compendium.ts): entries of the compendium kinds citing its own source, and NPCs.
 *  owner/ownerName come from the server (the folder it's stored in), never from the file. */
export interface Sr6Compendium {
  id: string
  name: string
  source: string
  sharing: 'private' | 'campaign' | 'table'
  campaign?: string
  rev?: number
  updatedAt: string
  owner?: string
  ownerName?: string
  entries: Sr6Entry[]
  npcs: Sr6Character[]
}

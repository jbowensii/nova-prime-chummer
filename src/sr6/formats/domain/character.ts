// The Shadowrun 6 runner model (docs/sr6-character-format.md, public/data/sr6/schema/character.xsd): one runner = one
// <sr6:character> file, read and written by src/sr6/formats/domain/charxml.ts. The build holds what the player spent; budgets,
// rules and derived values are computed from it (src/sr6/runner-builder/domain/), never stored.
import { EFFECT_SWITCHES, type EffectSwitch } from '../../../core/shared/effects'
import { newId, type Identity, type Override } from '../../../core/shared/types'
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
  target:
    | Sr6Attr
    | 'initDice'
    | 'defense'
    | 'physical'
    | 'stun'
    | 'overflow'
    | 'skill'
    | 'unarmedAR'
    | 'unarmedDV'
    | 'movement'
    | 'moveWalk'
    | 'moveSprint'
    | 'moveHit'
    | 'matrixInitDice'
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
  /** a `set` effect (Hardening's unarmed Attack Rating 6, a centaur body's 10/20/4 movement): a replacement value, never added
   *  (augmentBonus leaves it out; setBonus reads it) */
  set?: true
  /** the times a situational effect (a prose `when`) is switched on, set by the engine from the line's `sit`, never stored:
   *  its value is counted that many times (a `per barrel` one is counted as many times as the player says) */
  count?: number
}
/** The player's situational switches on a line (owner, 2026-10-29): effect index (in the line's bonuses) -> times on. 1 is
 *  an on switch, a bigger number the count of a `per ...` effect; absent or 0 is off (the bracketed total only). */
export type Sr6Situational = Record<string, number>
/** the switch both games' effects share (src/core/shared/effects.ts) */
export type BonusSwitch = EffectSwitch
export const BONUS_SWITCHES: BonusSwitch[] = EFFECT_SWITCHES
// (moveWalk, moveSprint and moveHit, the parts of a `a/b/c` movement effect, are made by the engine, never entered)
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

/** datastructures: a technomancer's data structures (Hack & Slash pp. 70–72), by level; critterpowers: an aware drake's
 *  dracogenesis powers (Lofwyr's Legions; src/sr6/runner-builder/domain/creation/drake.ts) */
export type PickKind = 'spells' | 'rituals' | 'adeptpowers' | 'complexforms' | 'metamagics' | 'echoes' | 'datastructures' | 'critterpowers'
export const PICK_KINDS: PickKind[] = ['spells', 'rituals', 'adeptpowers', 'complexforms', 'metamagics', 'echoes', 'datastructures', 'critterpowers']
/** critters: a critter the runner owns (catalog critters; the Critters tab, src/sr6/runner-builder/domain/assets/critters.ts) */
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
/** A vehicle's or drone's mod-slot families. The three core categories (Double Clutch p. 120) are always metered off
 *  the vehicle's Body; cf/accessory/tires are metered only when Commlink6 declares a capacity for them on the vehicle
 *  (the `vehicle-*` HOOK the slot generator records; owner ruling 2026-10-27). Hardpoints are a separate meter. */
export type SlotKind = 'chassis' | 'powertrain' | 'electronics' | 'cf' | 'accessory' | 'tires'
export const SLOT_KINDS: SlotKind[] = ['chassis', 'powertrain', 'electronics', 'cf', 'accessory', 'tires']
/** The core mod-slot categories, the only ones shifted 2:1 between each other (Double Clutch p. 120). */
export type ShiftKind = 'chassis' | 'powertrain' | 'electronics'
export const SHIFT_KINDS: ShiftKind[] = ['chassis', 'powertrain', 'electronics']
/** One shift of mod slots (Double Clutch p. 120: any available core slots can be shifted to another core category at
 *  2:1): two slots of `from` give one of `to`. */
export interface SlotShift {
  from: ShiftKind
  to: ShiftKind
}
export type Sr6ItemFlag = 'CUSTOM_FITTED' | 'CHEAP_KNOCK_OFF'
export interface Sr6Purchase {
  uid: string
  /** Assigned identity: Sr6Sin.uid; absent means unassigned, independent of licences. */
  sin?: string
  kind: PurchaseKind
  id?: string
  name?: string
  cost?: number
  /** a vehicle or drone bought at a GM-adjusted nuyen price instead of the catalog/design price (career Ledger); Review warns until a GM approves it */
  gmPrice?: number
  avail?: number
  /** a ready-made vehicle/drone's Design Points as set by a GM (otherwise estimated from its price: purchases.ts estimatedDp) */
  dp?: number
  /** a custom (id-less) mod built into a design: its own mod slots */
  slots?: number
  essence?: number
  rating?: number
  qty: number
  grade?: string
  worn?: true
  /** Commlink6's user-selectable item flags (AddUpPricesStep): custom-fitted or cheap knockoff armor */
  flags?: Sr6ItemFlag[]
  /** the order the line was taken in (creation actions and career advances stamp it: cyberadept.ts stampOrder) */
  seq?: number
  bonuses?: Bonus[]
  sit?: Sr6Situational
  note?: string
  accessories: Sr6Purchase[]
  /** a starter pack's line (Sr6PackExpansion.uid): priced 0 (the pack's header, whose uid it is, carries the price) */
  pack?: string
  snapshot?: Sr6Entry
  /** a vehicle's seats taken out for cargo (cargoWithoutSeats: Double Clutch p. 126) */
  seatsRemoved?: number
  /** a weapon fitted to a vehicle or drone: the uid of the weapon mount (its sibling accessory) it sits in */
  mount?: string
  /** a vehicle mod installed by the player: half its nuyen price (Double Clutch p. 120; never an accessory's: owner Q6) */
  diy?: true
  /** an ammunition line's material (purchases.ts materialOf): the catalog id of a material add-on, `bn.silver-bullets-silver`;
   *  the line costs that many times as much and its rounds are of that material */
  material?: string
  /** the sub-options and variant picked (catalog structure.ts subChoices): pick ref -> option id(s), `,`-joined */
  options?: Record<string, string>
  /** a vehicle or drone bought from a design in the Designer: the design's id (its line's id is `design.<id>`, its
   *  snapshot the vehicle the design worked out to when bought; later edits to the design never change it) */
  design?: string
  /** a weapon or cyberware line bought from a saved item design a GM made or approved (the item builders): Review asks nothing */
  approved?: true
  /** a vehicle or drone's mod slots shifted between categories, in the order made (Double Clutch p. 120) */
  slotShifts?: SlotShift[]
  /** GM override (owner 2026-10-27): the built-in mods removed from this vehicle/drone instance, each by its builtin
   *  uid (`builtin:<n>`, its place among the entry's <builtin>s). A removed built-in no longer counts toward slots,
   *  hardpoints or mounts and no weapon can sit in it; restoring it clears the uid. Round-trips (charxml). */
  removedBuiltins?: string[]
  /** Vehicle decomposition (docs/analysis/sr6-vehicle-decomposition.md 3.3): the catalog <part>s removed from this
   *  instance, each by the part's `id`. Same semantics as removedBuiltins for the catalog's <part>s; the two coexist
   *  (book-only vehicles keep <builtin>, ruling D2). Format only: nothing reads it yet. Round-trips (charxml). */
  removedParts?: string[]
  /** a GM-derived mod (decomposition plan 4.8, ruling D5): this accessory is custom content made from the catalog item `from`
   *  (its price, availability, rules and text carried in the `snapshot`), set by the GM to take `size` of the host's `hook`
   *  (a freed factory part's space, or any hook with room). origin synth: the app made it, so review says a GM must look. */
  derived?: { from: string; kind: string; hook: string; size: number; review: 'needs-owner' | 'none' }
  /** GM override: slots added to this host instance so an item can be fitted that has no matching catalog host slot, or
   *  to widen a budget. Each is a `<slot id value>` the app treats as if the catalog entry carried it (actions.ts `slot`
   *  op; honoured by the add-time slot guard). The id is any slot vocabulary id; the value is the capacity it offers. */
  addedSlots?: { id: string; value?: string }[]
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
 *  derived is stored (src/sr6/runner-builder/domain/assets/design.ts works it out). */
export interface Sr6Design {
  kind: 'vehicle' | 'drone'
  /** start from a known vehicle: a catalog `vehicles` id. Its stats, price and Availability are the baseline and you
   *  add mods on top (the from-scratch chassis/powertrain/console build is for a design with no base). */
  base?: string
  /** a based design: the starting vehicle's catalog <part>s (by id) taken off it (plan Stage 4); the bought design lacks them */
  removedParts?: string[]
  chassis?: string
  /** a custom (GM/house) chassis built in place of a catalog one: the chassis table's own columns (not book data) */
  customChassis?: {
    name: string
    dp: number
    body: number
    armor: number
    handling: number
    seats: number
    sizeClass: number
    /** its Cargo Factors: absent, by its seats (Commlink6's formula); `size`, the size class table's (Double Clutch) */
    cargoFrom?: 'size'
    /** Cargo Factors typed in: over either */
    cargo?: number
  }
  powertrain?: string
  /** a custom (GM/house) powertrain in place of a catalog one: the powertrain table's own columns (not book data) */
  customPowertrain?: { name: string; dp: number; accel: number; interval: number; topSpeed: number }
  console?: string
  /** road: Improved Handling for on-road or off-road only (3 Design Points a level, DC p. 151); absent: both */
  options: { id: string; level: number; road?: 'on' | 'off' }[]
  mods: Sr6Purchase[]
  /** mil-spec hardpoints (Deadly Arts pp. 151-153): each its Grade and the weapon assigned (catalog `weapons` id, its
   *  Size, how it is mounted) */
  hardpoints?: Sr6Hardpoint[]
  diy?: true
  approved?: true
}
/** A weapon or cyberware design (the item builders): the line as built, its add-ons and factory parts removed; approved
 *  when a GM made or approved it (a line bought from it then needs no approval). */
export interface Sr6ItemDesign {
  kind: 'weapon' | 'cyberware'
  line: Sr6Purchase
  approved?: true
}
export interface Sr6Hardpoint {
  grade: number
  weapon?: string
  /** the weapon's Size (DA's SIZE column, 0-8), typed in: the catalog does not carry it */
  size?: number
  /** absent: turreted (the default) */
  mount?: 'inline' | 'open'
  popOut?: true
  link?: 'twin' | 'quad'
  /** a dedicated primary weapon: built in, permanent, the Body minimum of a hardpoint one Grade smaller */
  dedicated?: true
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
  /** Purchased ranks; payment defaults to karma. Nuyen is creation-only, with Scholastic Mage. */
  karma: number
  payment?: 'nuyen'
}
/** free: a metatype trait (costs nothing, can't be removed). name: the catalog name when it was added (shown if the entry goes).
 *  karma: for a quality priced in a range (karma–karmaMax, as Allergy's severity sets it), the karma it was taken for. */
export interface Sr6Quality {
  uid: string
  id: string
  level: number
  free?: true
  sit?: Sr6Situational
  note?: string
  name?: string
  karma?: number
  /** Stolen Gear (No Future errata, NF p. 162): the converted karma bought off so far after creation, a part at a time */
  boughtOff?: number
  /** the sub-options picked (catalog structure.ts subChoices: Allergy's allergen and severity): pick ref -> option id(s) */
  options?: Record<string, string>
  /** the order the quality was taken in (cyberadept.ts stampOrder) */
  seq?: number
}
/** note: the skill or attribute a power naming its choice is for (`Improved Ability (Skill)`: its note `Firearms`) */
export interface Sr6Pick {
  uid: string
  kind: PickKind
  id: string
  level?: number
  bonuses?: Bonus[]
  sit?: Sr6Situational
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
  /** the starter pack that brought it (Sr6PackExpansion.uid): priced 0, taken away with the pack */
  pack?: string
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
  /** the starter pack that brought it: free, taken away with the pack */
  pack?: string
}
/** What buying a starter pack puts on a runner (owner 2026-10-31: the pack expanded into editable lines, charged at its price;
 *  every line carries `pack` = uid and is priced 0). lifestyles: each onto the SIN `sin`. */
export interface Sr6PackExpansion {
  uid: string
  id: string
  name: string
  cost: number
  lines: Sr6Purchase[]
  sins: Sr6Sin[]
  lifestyles: { sin: string; line: Sr6Lifestyle }[]
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
  /** a knowledge choice's index to the uid of the Knowledge line that pick created (removed with the module) */
  lines?: Record<number, string>
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
  /** the player's override of the Awakened flag (src/sr6/runner-builder/domain/creation/infected.ts awakenedFlag); none: derived */
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
  /** the Sixth World Companion's SURGE collective (a catalog qualitysets id; Commlink6's surge collective): its qualities
   *  are the runner's free ones (src/sr6/runner-builder/domain/creation/surge.ts); surgeChoice, its choice (a Commlink6 quality id) */
  surgeCollective?: string
  surgeChoice?: string
  /** a drake's dracoform adjustment points (Lofwyr's Legions p. 16: six, on the attributes its drake type names), by
   *  attribute; src/sr6/runner-builder/domain/creation/drake.ts */
  dracoform?: Partial<Record<Sr6Attr, number>>
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
  /** Karma put into building/upgrading a cyberdeck or cyberhack at Deck Builder's 5,000¥ each (rule-markers.ts) */
  karmaToDeck: number
}

/** A career spend (S3), replayed on the finalized build (src/sr6/runner-builder/domain/career/career.ts). target: an attribute, a skill id or
 *  (buyoff, drop) the line's uid; line: what joins the build (buyoff, drop: the removed one, kept for the history).
 *  convert: karma > 0 turns karma into nuyen, < 0 nuyen into karma. */
export type Sr6Advance =
  | { op: 'attribute'; target: Sr6Attr }
  | { op: 'skill'; target: string }
  | { op: 'spec'; target: string; name: string }
  | { op: 'expertise'; target: string; name: string }
  | { op: 'knowledge'; line: Sr6Knowledge }
  /** target: the uid of the lower level of the same family the line replaces (levels.ts), priced at the difference;
   *  magic: the kind an Infected type leaves the runner (infected.ts infectedKind), set when it changes it;
   *  single: the quality is not repeatable, so a held line is the same whatever its note (older entries: notes decide) */
  | { op: 'quality'; line: Sr6Quality; target?: string; magic?: MagicKind; single?: true }
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
  /** a starter pack expanded into its lines at the pack's price (the entry's nuyen); voiding the entry takes them all away */
  | ({ op: 'pack' } & Sr6PackExpansion)
  /** refund: nuyen credited back for selling the item (an adjustable sellback; the UI defaults it to 30% of value, SR
   *  Missions). Absent or 0 is a plain drop with no credit. */
  | { op: 'drop'; target: string; line?: Sr6Purchase; refund?: number }
  /** a stacking line (target: its uid) changed to qty of the item; the nuyen difference is paid (or credited back) */
  | { op: 'quantity'; target: string; qty: number }
  /** a bought item (target: its uid) replaced by a higher level of its family (levels.ts), its accessories and grade
   *  kept, at the new level's full price (the core rulebook prints no trade-in rule) */
  | { op: 'upgrade'; target: string; line: Sr6Purchase }
  /** an accessory (a vehicle mod, a weapon in a mount, an autosoft, or an enhancement on cyberware) fitted to the owned
   *  line whose uid is target, at its price (do it yourself: half); unfit: the accessory whose uid is target taken off,
   *  kept for the history, with an optional nuyen refund when it is sold back (SR Missions sellback) */
  | { op: 'fit'; target: string; line: Sr6Purchase }
  | { op: 'unfit'; target: string; line?: Sr6Purchase; refund?: number }
  /** two mod slots of `from` shifted to one of `to` on the owned vehicle or drone whose uid is target (Double Clutch p. 120;
   *  free); voiding it shifts them back */
  | ({ op: 'shift'; target: string } & SlotShift)
  /** a weapon (target: its uid) moved to another weapon mount of the same vehicle or drone (mount: that accessory's uid),
   *  no new charge; voiding it puts the weapon back in the mount it was in */
  | { op: 'move'; target: string; mount: string }
  /** the factory part (vehicle decomposition plan 3.3; by the catalog <part>'s id) of the owned vehicle or drone whose uid is
   *  target taken off, or (restore) put back while its hook has room; free, no refund by default; voiding it undoes it.
   *  detach: the weapon mounts (`part:<id>`) that went with the part (its own and its children's), recorded when it
   *  came off so a replay frees the weapons in them as creation's setPart does */
  | { op: 'part'; target: string; part: string; restore?: boolean; detach?: string[] }
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
  'pack',
  'drop',
  'quantity',
  'upgrade',
  'fit',
  'unfit',
  'shift',
  'move',
  'part',
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
export const SR6_NPC_PARTS = ['skills', 'powers', 'optionalPowers', 'spells', 'weaknesses', 'attacks', 'augmentations', 'gear', 'weapons'] as const
export interface Sr6Npc {
  kind: Sr6NpcKind
  rating?: number
  group?: string
  from?: { kind: Sr6Kind; id: string; name: string; source: string; page: number }
  stats: Record<string, string>
  lines: { part: string; text: string }[]
  /** a critter the GM designs (the Design tab, src/sr6/npcs/domain/critterdesign.ts): its powers, weaknesses and skills, the
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

/** identity.metatype mirrors build.metatype (the file keeps it once, on the root). final: the karma and nuyen left at
 *  Finalize. npc: set on an NPC (its build stays blank). design: set on a vehicle or drone design (likewise). sampleKey:
 *  the catalog entry a book NPC was loaded from, or the book sample an example runner was copied from (`<source>|<id>`). house: copies of the GM compendium entries it uses
 *  (src/sr6/runner-builder/domain/career/house.ts), so it keeps them when the compendium is unshared or deleted. */
export interface Sr6Character {
  formatVersion: 1
  id: string
  identity: Identity
  build: Sr6Build
  finalizedAt?: string
  final?: { karma: number; nuyen: number }
  campaign?: string
  ledger: Sr6LedgerEntry[]
  /** with the In Debt quality: the debt as a percentage of the nuyen total, taken off the balance (0/unset: none) */
  debtPercent?: number
  npc?: Sr6Npc
  /** set on a vehicle or drone design (the Designer's store; its build stays blank) */
  design?: Sr6Design
  /** set on a saved weapon or cyberware design (the item builders, same store as the Designer's; its build stays blank) */
  itemDesign?: Sr6ItemDesign
  sampleKey?: string
  house?: Sr6Entry[]
  printed?: Sr6Printed
  overrides: Override[]
  updatedAt: string
  lastExportedAt?: string
  /** the runner's own choices of the optional creation rules (src/sr6/table-setup/domain/creation.ts runnerRules); none: the table's */
  rules?: RunnerRule[]
  /** (never stored) its book sample's printed lines as the owner's override file corrects them (engine/samplefix.ts) */
  corrections?: SampleCorrection[]
  /** catalog ids turned into the ones a re-import gave the entries (src/sr6/runner-builder/domain/career/migrate.ts): `<kind>/<id>` each */
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
  karmaToDeck: 0,
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

/** A GM's SR6 compendium (src/sr6/formats/domain/compendium.ts): entries of the compendium kinds citing its own source, and NPCs.
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

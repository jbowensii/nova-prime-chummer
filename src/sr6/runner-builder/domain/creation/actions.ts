import { capacityRemaining, capacityUsed, isAmmoGear, isAmmoType } from '../../../catalog/domain/categories'
import { mountSlots } from '../../../catalog/domain/structure'
import { ratingOf } from './purchases'
import { activeRules } from './rule-markers'
// Build actions, the editor's mutators (a port of SR6 Forge's ChargenEngine setters and spend). Each one changes the
// build (or the runner) in place: the editor works on a copy. The character-level setters (method, letters, metatype,
// magic kind) take the runner so identity.metatype stays build.metatype; apply() takes the build and answers
// { ok: false, reason } without changing anything when the step isn't allowed. Rule numbers come from the catalog and
// the creation rules; a refusal here is only what can't be stored at all (Review's rules flag the rest). A prerequisite
// the runner lacks never refuses a step (owner, 2026-10-09): it is taken, and Review's error stands until a GM approves it.
import { knowledgeNuyenAvailable } from './rule-markers'
import { languageCap } from './skills'
import type { Sr6Kind } from '../../../formats/domain/types'
import { newId } from '../../../../core/shared/types'
import {
  CONTACT_TYPES,
  CORE_ATTRS,
  itemLicence,
  licenceRating,
  rateLicences,
  type Bonus,
  type ContactType,
  type CpPool,
  type Letter,
  type MagicKind,
  type PetClass,
  type PickKind,
  type PriorityColumn,
  type PurchaseKind,
  type SlotShift,
  type Sr6Attr,
  type Sr6Build,
  type Sr6Character,
  type Sr6Knowledge,
  type Sr6Method,
  type Sr6Purchase,
} from '../../../formats/domain/character'
import { flag, num, str, TRANSHUMAN_MAX, type CreationRules } from '../../../table-setup/domain/creation'
import { MAGIC_KINDS, pickMaxLevel, picksFor, qualityFitsMetatype, type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { gradeKnown, gradeProblem } from './grades'
import { makeProvider } from './providers'
import { chosenRating, ratingRange } from '../../../catalog/domain/values'
import { learned } from './martial'
import {
  augmentationRoom,
  diyAllowed,
  entryOf,
  licenceFee,
  licenceName,
  materialOf,
  noteSkill,
  qualityChoice,
  seatsOf,
  takesMaterial,
  toNuyenMax,
} from './budgets'
import { deriveMod } from '../assets/derive'
import { modsOf, mountsOf, partsOf, shiftProblem, type VehicleMods } from '../assets/vehiclemods'
import { critterOnly, infectedOff } from '../assets/critterware'
import { critterQualityNamed, isCritterQuality, trainedWhat } from '../assets/critters'
import { boughtKind, infectedFit, infectedKind, infectedOf, optionalPower, powerRefusal, runnerInfected } from './infected'

export type Op =
  | { op: 'attribute'; target: Sr6Attr; pool: 'points' | 'adjust' | 'karma'; delta: number }
  | { op: 'skill'; target: string; pool: 'points' | 'karma'; delta: number }
  | { op: 'spec'; target: string; spec: string | null }
  | { op: 'expertise'; target: string; expertise: string | null }
  /** a skill's specializations past the first (Exotic Weapons; Expanded Specializations) */
  | { op: 'specs'; target: string; specs: string[] }
  /** add a quality, or set the level, karma or note (the attribute or skill it is for) of one taken (`uid`: that line;
   *  else the quality's line). A quality that names its choice (`Exceptional (Attribute)`) may be taken again, for
   *  another one. One of a family of levels (levels.ts): the level's own entry takes the line, `id` naming any
   *  level or the rated parent. */
  | { op: 'quality'; id: string; uid?: string; level?: number; karma?: number; note?: string }
  | { op: 'quality'; remove: string }
  /** add a spell, power, form…; a leveled power (a metamagic taken again) taken again goes up a level */
  | { op: 'pick'; kind: PickKind; id: string }
  | { op: 'pick'; remove: string }
  | { op: 'powerLevel'; uid: string; level: number }
  /** a pick's note: the skill or attribute a power naming its choice is for ('' clears it) */
  | { op: 'pickNote'; uid: string; note: string }
  /** add a martial arts style (with its signature technique, a martialtechniques id: martial.ts signatureOf), or a
   *  technique under the style whose uid is `style`; or take one away (a style goes with its techniques) */
  | { op: 'martialart'; id: string; signature?: string }
  | { op: 'martialart'; remove: string }
  | { op: 'technique'; style: string; id: string }
  | { op: 'technique'; style: string; remove: string }
  | { op: 'powerPoints'; delta: number }
  | {
      op: 'purchase'
      kind: PurchaseKind
      id?: string
      rating?: number
      qty?: number
      grade?: string
      custom?: { name: string; cost: number; avail: number; essence: number }
    }
  | { op: 'purchase'; remove: string }
  /** a vehicle or drone bought from a design (design.ts boughtDesign); taken away as any line (purchase remove) */
  | { op: 'design'; line: Sr6Purchase }
  /** a stacking line's quantity */
  | { op: 'quantity'; uid: string; qty: number }
  /** mount: a weapon's mount (the host's accessory it sits in); diy: a vehicle mod installed by the player (half price) */
  | { op: 'accessory'; host: string; kind: PurchaseKind; id: string; rating?: number; mount?: string; diy?: boolean }
  | { op: 'accessory'; host: string; remove: string }
  /** set an ammunition line's single type in one step (id undefined/empty = Regular, no type fitted): replaces any type
   *  already on it, so switching between types can't leave two fitted (which would stack their price multipliers) */
  | { op: 'ammoType'; host: string; id?: string }
  /** a vehicle mod's do-it-yourself saving (Double Clutch p. 120) on or off; never an accessory's (owner Q6) */
  | { op: 'diy'; uid: string; diy: boolean }
  /** set (value) or clear (omitted) a vehicle/drone line's GM-adjusted price */
  | { op: 'gmprice'; uid: string; value?: number }
  /** a purchased line's choice note: the attribute/skill/quality/matrix an item naming a choice is for ('' clears it) */
  | { op: 'purchaseNote'; uid: string; note: string }
  /** an ammunition line's material (purchases.ts materialOf: a material's id; null: none, the plain price back) */
  | { op: 'material'; uid: string; material: string | null }
  /** a weapon on a vehicle or drone put in one of its weapon mounts (mount: that accessory's uid; null: none) */
  | { op: 'mount'; uid: string; mount: string | null }
  /** two mod slots of one category shifted to one of another on a vehicle or drone (Double Clutch p. 120), or the shift at
   *  `remove` (its place in the vehicle's shifts) undone */
  | ({ op: 'shift'; uid: string } & SlotShift)
  | { op: 'shift'; uid: string; remove: number }
  /** GM override: a slot added to the host instance (character.ts addedSlots) so an item can be fitted that has no
   *  matching catalog host slot, or to widen a budget; or the one at `remove` (its place) taken off */
  | { op: 'slot'; uid: string; id: string; value?: string }
  | { op: 'slot'; uid: string; remove: number }
  /** GM override: remove a built-in mod from a vehicle/drone instance (`id`: its builtin uid, `builtin:<n>`), or restore
   *  a removed one (character.ts removedBuiltins). Owner 2026-10-27: everything is removable, built-ins included. */
  | { op: 'builtin'; uid: string; remove: string }
  | { op: 'builtin'; uid: string; restore: string }
  /** a player takes a factory part (the catalog's <part>, by its id) off a vehicle/drone, freeing its hook cost, or puts it
   *  back (reversible, free: no refund by default, D4). Its children (parts it holds, weapons in a mount part) go and
   *  return with it. Decomposition plan ruling D1: at creation and, as a ledger `part` entry, in career. */
  | { op: 'part'; uid: string; remove: string }
  | { op: 'part'; uid: string; restore: string }
  /** a GM derives a mod from any catalog item (decomposition plan 4.8, D5): custom content with the source's price and
   *  rules, set to take `size` of the vehicle's `hook` (a freed factory part's room), fitted to `host` if it fits there */
  | { op: 'derive'; host: string; kind: Sr6Kind; id: string; hook: string; size: number; rating?: number }
  | { op: 'wear'; uid: string; worn: boolean }
  /** a line's (or accessory's) rating or grade changed in place; grade null: none. A line holding a level of a family
   *  (levels.ts) moves to the level's entry instead (its `rating` is the level) */
  | { op: 'rate'; uid: string; rating?: number; grade?: string | null }
  /** the bonuses on a purchase, accessory or pick */
  | { op: 'bonus'; uid: string; bonuses: Bonus[] }
  /** switch a situational effect of a purchase, pick or quality on (times 1, or a count for a `per ...` one) or off (0); index: its place in the line's effects */
  | { op: 'situational'; uid: string; index: number; times: number }
  /** add a contact, or change one (uid) */
  | { op: 'contact'; uid?: string; name?: string; archetype?: string; connection?: number; loyalty?: number; types?: ContactType[] }
  | { op: 'contact'; remove: string }
  | { op: 'knowledge'; uid?: string; name?: string; kind?: Sr6Knowledge['kind']; native?: boolean }
  | { op: 'knowledge'; remove: string }
  | { op: 'knowledgePayment'; uid: string; payment: 'karma' | 'nuyen' }
  | { op: 'knowledgeRank'; uid: string; pool: 'points' | 'karma'; delta: number }
  | { op: 'cp'; pool: CpPool; delta: number }
  /** take an adult module (a second time when the provider says again), drop one (at: its place in b.lifepath; default the
   *  last with that id), or pick where a taken one's choice goes (at: which of the two when it is taken twice) */
  | { op: 'lifemodule'; id: string; choice?: undefined }
  | { op: 'lifemodule'; remove: string; at?: number }
  | { op: 'lifemodule'; id: string; choice: number; pick: string; at?: number }
  /** lifepath's best attribute (null: none) and the one that takes what its maximum leaves over */
  | { op: 'bestAttr'; attr: Sr6Attr | null; extra?: Sr6Attr | null }
  /** a lifestyle on a SIN: add one (no uid; id needed), change one (uid), or remove one */
  | { op: 'lifestyle'; sin: string; uid?: string; id?: string; months?: number }
  | { op: 'lifestyle'; sin: string; remove: string }
  /** add a SIN, or change one (uid: its kind too); gender '' clears it. Naming a placeholder SIN or setting its kind or
   *  rating makes it a normal SIN. */
  | { op: 'sin'; uid?: string; name?: string; kind?: 'real' | 'fake'; rating?: number; gender?: string }
  | { op: 'sin'; remove: string }
  /** a licence on a SIN, rated as the SIN (owner 2026-10-16); at: the licence (its index) renamed instead */
  | { op: 'licence'; sin: string; name: string; at?: number }
  | { op: 'licence'; sin: string; remove: number }
  | { op: 'karmaToNuyen'; delta: number }
  | { op: 'karmaToDeck'; delta: number }
  | { op: 'initiation'; delta: number }
  | { op: 'submersion'; delta: number }
  | { op: 'transhuman'; delta: number }
  /** follow a mentor spirit (a mentorspirits id; null: none): its Mentor Spirit quality comes and goes with it (owner's
   *  decision 5, 2026-10-11); advantage: a mystic adept's pick of its magician or adept advantages (null: none yet) */
  | { op: 'mentor'; id?: string | null; advantage?: 'magician' | 'adept' | null }
  /** a vehicle's seats taken out for cargo (cargoWithoutSeats, Double Clutch p. 126) */
  | { op: 'seats'; uid: string; removed: number }
  /** a line (or accessory) whose Availability prints a licence fee: licensed on that SIN (on), or not */
  | { op: 'licensed'; uid: string; sin: string; on: boolean }
  /** the runner's Infected type (an Infected quality's id; '' none): infect */
  | { op: 'infected'; id: string }
  /** the player's override of the Awakened flag (null: derived again; Review warns while it differs) */
  | { op: 'awakened'; value: boolean | null }
  /** an owned critter's pet class, or tamed from the wild (on: Wild Soul and High Maintenance 1 come with it, Wild Life
   *  p. 184, and its commands and special training count as taught; off: the two go) */
  | { op: 'critter'; uid: string; pet?: PetClass; tamed?: boolean }
  /** a named command or special training (a catalog Critter Command Action or Critter Special Training) for the owned
   *  critter `host`: with its purchase, or taught later (a tamed critter's always); one's taught set; or one taken off */
  | { op: 'critterTrained'; host: string; id: string; taught?: boolean }
  | { op: 'critterTrained'; host: string; uid: string; taught: boolean }
  | { op: 'critterTrained'; host: string; remove: string }
  /** a companion quality on the owned critter `host` (a catalog quality of class CRITTERWARE/QUALITY): specified with its
   *  purchase (no how), from taming, or bonded (the runner's Karma); or one's level set, or one taken off */
  | { op: 'critterQuality'; host: string; id: string; how?: 'tamed' | 'bonded'; level?: number }
  | { op: 'critterQuality'; host: string; uid: string; level: number }
  | { op: 'critterQuality'; host: string; remove: string }
export type Result = { ok: true } | { ok: false; reason: string }

/** R: weapons, armor, augmentations and vehicles always get their own line (each can carry its own accessories). */
const OWN_LINE = new Set<PurchaseKind>(['weapons', 'armor', 'augmentations', 'vehicles', 'critters'])
const LETTER_METHODS = new Set<Sr6Method>(['priority', 'sumtoten'])

/** Switch method. Spends that still mean something stay; point buy's character points, lifepath's modules and the
 *  priority letters go when their method is left; then reconcile. */
export function setMethod(ch: Sr6Character, method: Sr6Method, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build
  if (b.method === 'pointbuy' && method !== 'pointbuy') for (const k of Object.keys(b.cp) as CpPool[]) b.cp[k] = 0
  if (b.method === 'lifepath' && method !== 'lifepath') b.lifepath = []
  if (LETTER_METHODS.has(b.method) && !LETTER_METHODS.has(method)) for (const k of Object.keys(b.priorities) as PriorityColumn[]) b.priorities[k] = null
  b.method = method
  reconcile(ch, data, cr)
}

export function setPriority(ch: Sr6Character, column: PriorityColumn, letter: Letter | null, data: Sr6Data, cr: CreationRules): void {
  ch.build.priorities[column] = letter
  reconcile(ch, data, cr)
}

/** Pick the metatype ('' for none): the old one's free traits go, the new one's resolved traits come as free qualities. */
export function setMetatype(ch: Sr6Character, id: string, data: Sr6Data): void {
  const b = ch.build,
    m = data.metatypes[id]
  b.metatype = id
  ch.identity.metatype = id
  b.qualities = b.qualities.filter(q => !q.free)
  for (const t of m?.traits ?? []) b.qualities.push({ uid: newId(), id: t, level: m?.traitLevels?.[t] ?? 1, free: true, name: data.qualities[t]?.name })
}

/** Pick the magic kind the method buys: picks it can't have go, as do bought power points (unless it buys them), an
 *  initiation or submersion it can't have, the aspected skill unless it's aspected, and the spends on Magic or Resonance
 *  when the kind has no such attribute (the Attributes tab no longer shows it, so they couldn't be taken back). An
 *  Infected runner becomes the kind its type leaves the bought one (infectedKind: technomancer leaves it without
 *  Resonance, as taking the type would). */
export function setMagic(ch: Sr6Character, kind: MagicKind, data: Sr6Data, _cr: CreationRules, aspectedSkill?: string): void {
  const t = runnerInfected(ch.build, data)?.t
  infectedTo(ch.build, kind, t ? infectedKind(kind, t.awakens) : kind, aspectedSkill)
}
/** The runner's kind becomes `next`, the method having bought `bought`: infectedFrom keeps the bought kind while an
 *  Infected type made it another (SWC p. 105), and goes when they agree. Shared with career.ts applyAdvance. */
export function infectedTo(b: Sr6Build, bought: MagicKind, next: MagicKind, aspectedSkill?: string): void {
  if (next !== bought) b.infectedFrom = bought
  else delete b.infectedFrom
  magicKind(b, next, aspectedSkill)
}
function magicKind(b: Sr6Build, kind: MagicKind, aspectedSkill?: string): void {
  const k = MAGIC_KINDS[kind],
    allowed = picksFor(kind)
  b.magic = kind
  if (kind === 'aspected' && aspectedSkill) b.aspectedSkill = aspectedSkill
  else if (kind !== 'aspected') delete b.aspectedSkill
  b.picks = b.picks.filter(x => allowed[x.kind])
  if (!k.paysPowers) b.powerPointsBought = 0
  if (!k.spells && !k.powers) b.initiation = 0
  if (!k.resonance) b.submersion = 0
  if (k.spells || k.powers || k.resonance) b.transhuman = 0 // (Transhumanism is for a mundane)
  if (!k.spells && !k.powers) b.attributes.mag = { points: 0, adjust: 0, karma: 0 }
  if (!k.resonance) b.attributes.res = { points: 0, adjust: 0, karma: 0 }
  if (kind !== 'mystic-adept') delete b.mentorAdvantage
}

/** A metatype or magic kind the method (and letters) no longer allow is cleared ('' / mundane). The kind checked is the
 *  one the method bought (boughtKind); an Infected runner cleared to mundane becomes the kind its type gives a mundane
 *  (setMagic). */
export function reconcile(ch: Sr6Character, data: Sr6Data, cr: CreationRules): void {
  const b = ch.build,
    p = makeProvider(b.method, data, cr)
  if (b.metatype && !p.legalMetatypes(b).some(m => m.id === b.metatype)) setMetatype(ch, '', data)
  if (!p.legalMagic(b).some(m => m.kind === boughtKind(b))) setMagic(ch, 'mundane', data, cr)
}

/** Take the runner's Infected type (the Sixth World Companion pp. 104–106; '' none), replacing the one it has. The type
 *  Awakens a runner who isn't (Mutaqua as an adept, Nosferatu and Wendigo as magicians), makes one Awakened as the other
 *  kind a mystic adept, and takes a technomancer's Resonance (no refund): the kind before is kept in infectedFrom, and
 *  taking the type away gives it back. Its other rules are read from it where they apply (infected.ts). */
function infect(b: Sr6Build, id: string, data: Sr6Data, cr: CreationRules): Result {
  const cur = runnerInfected(b, data),
    e = id ? data.entry('qualities', id) : undefined,
    t = infectedOf(e)
  if (id) {
    if (!t) return no('unknown-entry')
    if (cur?.line.id === id) return no('already-taken')
    if (infectedOff(e, cr)) return no('rule-off')
    if (!infectedFit(data, b.metatype, t)) return no('not-for-metatype')
  }
  const bought = boughtKind(b)
  if (cur) b.qualities = b.qualities.filter(q => q !== cur.line)
  if (t) b.qualities.push({ uid: newId(), id, level: 1, name: data.qualities[id]?.name ?? t.name })
  infectedTo(b, bought, t ? infectedKind(bought, t.awakens) : bought)
  return OK
}

const OK: Result = { ok: true }
const no = (reason: string): Result => ({ ok: false, reason })
/** a counter moved by delta, refused below zero */
function step(get: () => number, set: (v: number) => void, delta: number): Result {
  const v = get() + delta
  if (v < 0) return no('below-zero')
  set(v)
  return OK
}

/** Every purchase, and every accessory on one. */
/** Lines and everything fitted to them, at any depth (a weapon's ammunition's ammunition type, as imports nest them). */
const deep = (xs: Sr6Purchase[]): Sr6Purchase[] => xs.flatMap(x => [x, ...deep(x.accessories)])
const allLines = (b: Sr6Build) => deep(b.purchases)
/** An accessory taken off its host; a weapon in it (a weapon mount) stays, in no mount. Shared with career.ts. */
export function unfit(host: Sr6Purchase, uid: string): void {
  host.accessories = host.accessories.filter(a => a.uid !== uid)
  for (const a of host.accessories) if (a.mount === uid) delete a.mount
}
/** A removed line's licences go with it (the lines: it and its accessories). */
const unlicense = (b: Sr6Build, gone: Sr6Purchase[]) => {
  for (const s of b.sins) s.licences = s.licences.filter(l => !gone.some(x => x.uid === l.item))
}

/** Apply one editor step to the build. */
export function apply(b: Sr6Build, op: Op, data: Sr6Data, cr: CreationRules): Result {
  switch (op.op) {
    case 'attribute': {
      const a = b.attributes[op.target]
      return a
        ? step(
            () => a[op.pool],
            v => {
              a[op.pool] = v
            },
            op.delta,
          )
        : no('unknown-attribute')
    }
    case 'skill': {
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        s = { id: op.target, points: 0, karma: 0 }
      }
      const v = s[op.pool] + op.delta
      if (v < 0) return no('below-zero')
      // owner's decision 3 (2026-10-11): a pure adept takes no Sorcery, Conjuring or Enchanting (Astral is p. 93's)
      if (op.delta > 0 && adeptBars(b, data, op.target)) return no('not-for-adept')
      s[op.pool] = v
      if (!b.skills.includes(s)) b.skills.push(s)
      // no rank left: the skill goes, its spec and expertise with it
      if (!s.points && !s.karma) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'specs': {
      const v = [...new Set(op.specs.map(x => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20)
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        if (!v.length) return OK
        b.skills.push((s = { id: op.target, points: 0, karma: 0 }))
      }
      if (v.length) s.specs = v
      else delete s.specs
      if (!s.points && !s.karma && !s.spec && !s.expertise && !s.specs) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'spec':
    case 'expertise': {
      // on a skill without a rank, or an expertise without a specialization: taken (Review's skill.specUntrained, skill.expertiseSpec)
      const v = op.op === 'spec' ? op.spec : op.expertise
      let s = b.skills.find(x => x.id === op.target)
      if (!s) {
        if (!data.skills[op.target]) return no('unknown-entry')
        if (!v) return OK
        b.skills.push((s = { id: op.target, points: 0, karma: 0 }))
      }
      if (v) s[op.op] = v
      else delete s[op.op]
      // a line left with no rank, specialization nor expertise goes
      if (!s.points && !s.karma && !s.spec && !s.expertise && !s.specs) b.skills = b.skills.filter(x => x !== s)
      return OK
    }
    case 'infected':
      return infect(b, op.id, data, cr)
    case 'awakened':
      if (op.value === null) delete b.awakened
      else b.awakened = op.value
      return OK
    case 'quality': {
      if ('remove' in op) {
        const q = b.qualities.find(x => x.uid === op.remove)
        if (!q) return no('not-taken')
        if (q.free) return no('free-trait')
        if (runnerInfected(b, data)?.line === q) return infect(b, '', data, cr)
        b.qualities = b.qualities.filter(x => x !== q)
        // (owner's decision 5: the mentor spirit goes with its quality)
        const mentor = str(cr, 'mentorSpiritQuality')
        if (q.id === mentor && !b.qualities.some(x => x.id === mentor)) {
          delete b.mentorSpirit
          delete b.mentorAdvantage
        }
        return OK
      }
      // an Infected quality or optional power, new to the runner, only while the table allows Infected characters (SWC p. 104)
      const e0 = data.entry('qualities', op.id),
        had = b.qualities.some(x => x.id === op.id)
      if (infectedOff(e0, cr) && !had) return no('rule-off')
      // (an Infected type is the runner's one type: infect; an optional power only from its list, and at creation only
      // the free pick unless the table's infectedPowersAtCreation says otherwise: infected.ts powerRefusal)
      if (infectedOf(e0) && !had) return infect(b, op.id, data, cr)
      if (optionalPower(e0)) {
        const why = had ? undefined : powerRefusal(b, data, cr, op.id, true)
        if (why) return no(why)
        if ((op.level ?? 1) > 1 && !flag(cr, 'infectedPowersAtCreation')) return no('infected-after-creation')
      }
      // a family of levels (levels.ts): the level's own entry, its line at level 1; a level the family lacks is refused
      const fam = data.family('qualities', op.id)
      if (fam) {
        const cur = b.qualities.find(x => !x.free && data.family('qualities', x.id) === fam)
        if (op.level !== undefined && op.level < 1) return no('below-one')
        const e = data.atLevel('qualities', op.id, op.level ?? data.levelOf(data.entry('qualities', op.id)) ?? Math.min(...fam.levels.keys()))
        if (!e) return no('max-level')
        // (its note, the attribute or skill it is for, as on any quality)
        if (op.note !== undefined && cur) {
          const t = op.note.trim().slice(0, 200)
          if (t) cur.note = t
          else delete cur.note
          if (op.level === undefined && op.karma === undefined) return OK
        }
        if (cur && cur.id === e.id && op.karma === undefined) return no('already-taken')
        const v = data.qualities[e.id]
        if (op.karma !== undefined && (v.karmaMax == null || op.karma < Math.abs(v.karma ?? 0) || op.karma > Math.abs(v.karmaMax))) return no('karma-range')
        if (cur) {
          cur.id = e.id
          cur.level = 1
          cur.name = v.name
          if (op.karma !== undefined) cur.karma = op.karma
        } else b.qualities.push({ uid: newId(), id: e.id, level: 1, name: v.name, ...(op.karma !== undefined ? { karma: op.karma } : {}) })
        return OK
      }
      const v = data.qualities[op.id]
      if (!v) return no('unknown-entry')
      const taken = op.uid ? b.qualities.find(x => x.uid === op.uid && x.id === op.id) : b.qualities.find(x => x.id === op.id && !x.free)
      if (op.uid && !taken) return no('not-taken')
      // owner's decision 4: a poser quality only for the metatypes its description names
      if (!taken && !qualityFitsMetatype(data, b.metatype, op.id)) return no('not-for-metatype')
      // owner's decision 2: Aptitude and Incompetent never on the same skill (exact opposites)
      if (op.note !== undefined && opposite(b, data, cr, op.id, op.note, taken?.uid)) return no('aptitude-incompetent')
      if (op.note !== undefined && taken) {
        const t = op.note.trim().slice(0, 200)
        if (t) taken.note = t
        else delete taken.note
      }
      // (a quality naming its choice is taken again for another: CRB Hong Kong p. 71, "once per attribute")
      const again = !op.uid && !!qualityChoice(v.name) && op.level === undefined && op.karma === undefined && op.note === undefined
      if (taken && !again && op.level === undefined && op.karma === undefined) return op.note !== undefined ? OK : no('already-taken')
      const level = op.level ?? taken?.level ?? 1
      if (level !== 1 && !v.perLevel) return no('no-levels')
      if (level < 1) return no('below-one')
      if (v.perLevel && level > (v.maxLevel ?? Infinity)) return no('max-level')
      if (
        op.karma !== undefined &&
        (v.karmaMax == null ||
          op.karma < Math.abs(v.karma ?? 0) ||
          op.karma > Math.abs(v.karmaMax) ||
          (v.karmaSteps?.length && !v.karmaSteps.map(Math.abs).includes(op.karma)))
      )
        return no('karma-range')
      if (taken && !again) {
        taken.level = level
        if (op.karma !== undefined) taken.karma = op.karma
      } else b.qualities.push({ uid: newId(), id: op.id, level, name: v.name, ...(op.karma !== undefined ? { karma: op.karma } : {}) })
      return OK
    }
    case 'pick': {
      if ('remove' in op) {
        if (!b.picks.some(x => x.uid === op.remove)) return no('not-taken')
        b.picks = b.picks.filter(x => x.uid !== op.remove)
        return OK
      }
      const e = data.entry(op.kind, op.id)
      if (!e) return no('unknown-entry')
      // a family of levels (levels.ts): taken again, the line moves to the next level's entry
      const fam = data.family(op.kind, op.id)
      if (fam) {
        const cur = b.picks.find(x => x.kind === op.kind && data.family(op.kind, x.id) === fam),
          curLevel = cur ? (data.levelOf(data.entry(op.kind, cur.id)) ?? 1) : 0
        const asked = data.levelOf(e)
        if (cur && asked !== undefined && asked <= curLevel) return no('duplicate')
        const next = data.atLevel(op.kind, op.id, asked ?? (cur ? curLevel + 1 : Math.min(...fam.levels.keys())))
        if (!next) return no('max-level')
        if (cur) {
          cur.id = next.id
          cur.name = next.name
        } else b.picks.push({ uid: newId(), kind: op.kind, id: next.id, name: next.name })
        return OK
      }
      const max = pickMaxLevel(data, op.kind, op.id)
      // (a power naming its choice is bought again for another: Improved Ability "can be purchased for multiple skills",
      // CRB Hong Kong p. 157)
      const had = !qualityChoice(e.name) && b.picks.find(x => x.kind === op.kind && x.id === op.id)
      if (had) {
        // a leveled power is bought per level, a metamagic taken again is one more: taking it again raises the level
        if (max === null) return no('duplicate')
        if ((had.level ?? 1) >= max) return no('max-level')
        had.level = (had.level ?? 1) + 1
        return OK
      }
      b.picks.push({ uid: newId(), kind: op.kind, id: op.id, name: e.name, ...(max !== null ? { level: 1 } : {}) })
      return OK
    }
    case 'pickNote': {
      const x = b.picks.find(p => p.uid === op.uid)
      if (!x) return no('not-taken')
      const t = op.note.trim().slice(0, 200)
      if (t) x.note = t
      else delete x.note
      return OK
    }
    case 'powerLevel': {
      const x = b.picks.find(p => p.uid === op.uid)
      if (!x) return no('not-taken')
      if (data.family(x.kind, x.id)) {
        // (a family of levels: that level's entry)
        if (op.level < 1) return no('below-one')
        const e = data.atLevel(x.kind, x.id, op.level)
        if (!e) return no('max-level')
        x.id = e.id
        x.name = e.name
        delete x.level
        return OK
      }
      const max = pickMaxLevel(data, x.kind, x.id)
      if (max === null) return no('no-levels')
      if (op.level < 1) return no('below-one')
      if (op.level > max) return no('max-level')
      x.level = op.level
      return OK
    }
    case 'martialart': {
      if ('remove' in op)
        return removeBy(b.martialArts, op.remove, l => {
          b.martialArts = l
        })
      const e = data.entry('martialarts', op.id),
        sig = op.signature ? data.entry('martialtechniques', op.signature) : undefined
      if (!e || (op.signature && !sig)) return no('unknown-entry')
      if (b.martialArts.some(m => m.id === op.id)) return no('already-taken')
      if (sig && learned(b).some(t => t.id === sig.id)) return no('already-taken')
      b.martialArts.push({ uid: newId(), id: op.id, name: e.name, techniques: sig ? [{ uid: newId(), id: sig.id, name: sig.name }] : [] })
      return OK
    }
    case 'technique': {
      const m = b.martialArts.find(x => x.uid === op.style)
      if (!m) return no('unknown-line')
      if ('remove' in op)
        return removeBy(m.techniques, op.remove, l => {
          m.techniques = l
        })
      const e = data.entry('martialtechniques', op.id)
      if (!e) return no('unknown-entry')
      // FS p. 97: each technique is learned once, under whichever style
      if (learned(b).some(t => t.id === op.id)) return no('already-taken')
      m.techniques.push({ uid: newId(), id: op.id, name: e.name })
      return OK
    }
    case 'powerPoints':
      return step(
        () => b.powerPointsBought,
        v => {
          b.powerPointsBought = v
        },
        op.delta,
      )
    case 'purchase': {
      if ('remove' in op) {
        const x = b.purchases.find(x => x.uid === op.remove)
        if (!x) return no('unknown-line')
        b.purchases = b.purchases.filter(y => y !== x)
        unlicense(b, deep([x]))
        return OK
      }
      const line = newLine(op, data, cr)
      if ('reason' in line) return line
      if (critterOnly(entryOf(line, data))) return no('critters-only') // (Body Shop's critter chapter: not for a player's character)
      // owner's decision 9: each augmentation once a runner, a paired body part once a side
      if (op.kind === 'augmentations' && augmentationRoom(b, data, entryOf(line, data)) < 1) return no('once-per-runner')
      const same =
        !OWN_LINE.has(op.kind) &&
        !isAmmoGear(entryOf(line, data)) && // each ammo line carries its own fitted ammo type, so adding again makes a new line
        !line.grade &&
        b.purchases.find(x => x.id && x.id === line.id && x.kind === line.kind && x.rating === line.rating && !x.grade && !x.accessories.length)
      if (same) same.qty += line.qty
      else b.purchases.push(line)
      return OK
    }
    case 'design': {
      const x = op.line
      if (x.kind !== 'vehicles' || !x.design || !x.snapshot) return no('not-a-design')
      b.purchases.push({ ...structuredClone(x), uid: newId(), qty: 1 })
      return OK
    }
    case 'quantity': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (OWN_LINE.has(x.kind)) return no('own-line')
      if (op.qty < 1) return no('below-one')
      x.qty = op.qty
      return OK
    }
    case 'purchaseNote': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      const t = op.note.trim().slice(0, 200)
      if (t) x.note = t
      else delete x.note
      return OK
    }
    case 'accessory': {
      const host = b.purchases.find(x => x.uid === op.host)
      if (!host) return no('unknown-host')
      if ('remove' in op) {
        if (!host.accessories.some(a => a.uid === op.remove)) return no('not-fitted')
        unlicense(b, deep(host.accessories.filter(a => a.uid === op.remove)))
        unfit(host, op.remove)
        return OK
      }
      // an accessory whose category names other hosts goes on anyway (Review's catalog.accessoryHost)
      const line = newLine({ kind: op.kind, id: op.id, rating: op.rating }, data, cr)
      if ('reason' in line) return line
      // critter equipment goes on an owned critter only (Body Shop's critterware, Wild Life's critter gear)
      if (critterOnly(entryOf(line, data)) && host.kind !== 'critters') return no('critters-only')
      if (op.mount !== undefined) {
        if (!mountsOf(host, data).some(m => m.uid === op.mount)) return no('not-a-mount')
        line.mount = op.mount
      }
      if (op.diy) {
        if (!diyAllowed(entryOf(line, data))) return no('no-diy')
        line.diy = true
      }
      if (host.kind === 'vehicles' && line.kind === 'weapons' && !line.mount)
        line.mount = mountsOf(host, data).find(m => !m.taken && !host.accessories.some(a => a.mount === m.uid))?.uid
      const problem = accessoryProblem(host, line, data)
      if (problem) return no(problem)
      host.accessories.push(line) // (no grade of its own: on an implant it has the implant's, budgets.ts fitted)
      return OK
    }
    case 'ammoType': {
      const host = b.purchases.find(x => x.uid === op.host)
      if (!host) return no('unknown-host')
      // one type at a time: drop whatever type is on the line before fitting the new one (atomic, so no stacked multipliers)
      host.accessories = host.accessories.filter(a => !isAmmoType(entryOf(a, data)))
      if (op.id) {
        const line = newLine({ kind: 'ammotypes', id: op.id }, data, cr)
        if ('reason' in line) return line
        host.accessories.push(line)
      }
      return OK
    }
    case 'gmprice': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if (op.value === undefined) delete x.gmPrice
      else if (Number.isFinite(op.value) && op.value >= 0) x.gmPrice = op.value
      else return no('bad-price')
      return OK
    }
    case 'diy': {
      const x = b.purchases.flatMap(p => p.accessories).find(a => a.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.diy && !diyAllowed(entryOf(x, data))) return no('no-diy')
      if (op.diy) x.diy = true
      else delete x.diy
      return OK
    }
    case 'material': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.material === null) delete x.material
      else if (!takesMaterial(x, data) || !materialOf(data, op.material)) return no('no-material')
      else x.material = op.material
      return OK
    }
    case 'mount': {
      const host = b.purchases.find(p => p.accessories.some(a => a.uid === op.uid)),
        x = host?.accessories.find(a => a.uid === op.uid)
      if (!host || !x) return no('unknown-line')
      if (x.kind !== 'weapons') return no('not-a-weapon')
      if (op.mount === null) {
        delete x.mount
        return OK
      }
      // (a fitted mount or a built-in one, vehiclemods.ts mountsOf)
      if (!mountsOf(host, data).some(m => m.uid === op.mount)) return no('not-a-mount')
      if (host.accessories.some(a => a.uid !== x.uid && a.mount === op.mount)) return no('This weapon mount is full.')
      x.mount = op.mount
      return OK
    }
    case 'shift': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if ('remove' in op) {
        if (!x.slotShifts?.[op.remove]) return no('not-shifted')
        x.slotShifts.splice(op.remove, 1)
        if (!x.slotShifts.length) delete x.slotShifts
        return OK
      }
      const why = shiftProblem(x, op.from, op.to, data)
      if (why) return no(why)
      x.slotShifts = [...(x.slotShifts ?? []), { from: op.from, to: op.to }]
      return OK
    }
    case 'slot': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if ('remove' in op) {
        if (!x.addedSlots?.[op.remove]) return no('no-slot')
        x.addedSlots.splice(op.remove, 1)
        if (!x.addedSlots.length) delete x.addedSlots
        return OK
      }
      if (!op.id.trim()) return no('no-slot-id')
      x.addedSlots = [...(x.addedSlots ?? []), op.value ? { id: op.id, value: op.value } : { id: op.id }]
      return OK
    }
    case 'builtin': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if ('restore' in op) {
        if (!x.removedBuiltins?.includes(op.restore)) return no('not-removed')
        x.removedBuiltins = x.removedBuiltins.filter(u => u !== op.restore)
        if (!x.removedBuiltins.length) delete x.removedBuiltins
        return OK
      }
      // (the uid names one of the entry's built-ins; a weapon sitting in a removed built-in mount falls out of it)
      if (!modsOf(x, data).builtin.some(bi => bi.uid === op.remove)) return no('not-a-builtin')
      x.removedBuiltins = [...(x.removedBuiltins ?? []), op.remove]
      for (const a of x.accessories) if (a.mount === op.remove) delete a.mount
      return OK
    }
    case 'derive': {
      const host = b.purchases.find(p => p.uid === op.host && p.kind === 'vehicles')
      if (!host) return no('unknown-line')
      const from = data.entry(op.kind, op.id)
      if (!from) return no('unknown-entry')
      if (!(op.size > 0) || !op.hook.startsWith('vehicle-')) return no('bad-derivation')
      const line = deriveMod(from, op)
      const problem = accessoryProblem(host, line, data)
      if (problem) return no(problem)
      host.accessories.push(line)
      return OK
    }
    case 'part': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      return setPart(x, 'restore' in op ? op.restore : op.remove, 'restore' in op, data)
    }
    case 'critter': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'critters')
      if (!x) return no('unknown-line')
      if (op.pet) x.pet = op.pet
      if (op.tamed === false) {
        delete x.tamed
        x.critterQualities = x.critterQualities?.filter(q => q.how !== 'tamed')
      } else if (op.tamed && !x.tamed) {
        // Wild Life p. 184: Wild Soul, balanced by a negative quality, High Maintenance 1 by default (changed by taking it
        // off and adding another negative as tamed); one it already has isn't added again, so untaming keeps it. (Its
        // trained ones aren't marked taught: critters.ts isTaught reads every one of a tamed critter so, and untaming
        // restores the price.)
        x.tamed = true
        x.critterQualities ??= []
        for (const name of ['Wild Soul', 'High Maintenance']) {
          const e = critterQualityNamed(data, name)
          if (e && !x.critterQualities.some(q => q.id === e.id)) x.critterQualities.push({ uid: newId(), id: e.id, level: 1, name: e.name, how: 'tamed' })
        }
      }
      if (!x.critterQualities?.length) delete x.critterQualities
      return OK
    }
    case 'critterTrained': {
      // (past the critter's limit: Review warns, never refused)
      const x = b.purchases.find(p => p.uid === op.host && p.kind === 'critters')
      if (!x) return no('unknown-host')
      if ('remove' in op) {
        if (!x.trained?.some(t => t.uid === op.remove)) return no('not-taken')
        x.trained = x.trained.filter(t => t.uid !== op.remove)
        if (!x.trained.length) delete x.trained
        return OK
      }
      if ('uid' in op) {
        const t = x.trained?.find(y => y.uid === op.uid)
        if (!t) return no('not-taken')
        if (op.taught || x.tamed) t.taught = true
        else delete t.taught
        return OK
      }
      const e = data.entry('actions', op.id)
      if (!e) return no('unknown-entry')
      const what = trainedWhat(e)
      if (!what) return no('not-critter-training')
      // (one taken again is another: Teamwork for another skill, Use Critter Power for another power, WL pp. 182-183)
      x.trained = [...(x.trained ?? []), { uid: newId(), what, id: e.id, name: e.name, ...(op.taught || x.tamed ? { taught: true as const } : {}) }]
      return OK
    }
    case 'critterQuality': {
      const x = b.purchases.find(p => p.uid === op.host && p.kind === 'critters')
      if (!x) return no('unknown-host')
      if ('remove' in op) {
        if (!x.critterQualities?.some(q => q.uid === op.remove)) return no('not-taken')
        x.critterQualities = x.critterQualities.filter(q => q.uid !== op.remove)
        if (!x.critterQualities.length) delete x.critterQualities
        return OK
      }
      if ('uid' in op) {
        const q = x.critterQualities?.find(y => y.uid === op.uid)
        if (!q) return no('not-taken')
        if (!(op.level >= 1)) return no('below-one')
        q.level = op.level
        return OK
      }
      const e = data.entry('qualities', op.id)
      if (!e) return no('unknown-entry')
      if (!isCritterQuality(e)) return no('not-a-critter-quality')
      if (op.how === 'tamed' && !x.tamed) return no('not-tamed')
      if (x.critterQualities?.some(q => q.id === op.id)) return no('already-taken')
      x.critterQualities = [...(x.critterQualities ?? []), { uid: newId(), id: e.id, level: op.level ?? 1, name: e.name, ...(op.how ? { how: op.how } : {}) }]
      return OK
    }
    case 'wear': {
      const x = b.purchases.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.worn) x.worn = true
      else delete x.worn
      return OK
    }
    case 'rate': {
      const x = allLines(b).find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      const level = op.rating !== undefined && x.id && data.family(x.kind, x.id) ? data.atLevel(x.kind, x.id, op.rating) : undefined
      if (op.rating !== undefined && !level) {
        const e = x.id ? data.entry(x.kind, x.id) : undefined
        if (!e || !(chosenRating(e) ? Number.isInteger(op.rating) && op.rating >= 1 : ratingRange(e.attrs.rating).includes(op.rating)))
          return no('rating-range')
      }
      const gp = op.grade ? gradeProblem(cr, data, op.grade, x.id ? data.entry(x.kind, x.id) : undefined) : null
      if (gp) return no(gp)
      // an implant's add-on has its grade (CRB p. 282): never one of its own
      const host = allLines(b).find(h => h.kind === 'augmentations' && h.accessories.includes(x))
      if (host && op.grade !== undefined) return no('grade-follows-host')
      const prev = { id: x.id, name: x.name, rating: x.rating }
      const owner0 = allLines(b).find(h => h.accessories.includes(x)),
        he0 = owner0 && entryOf(owner0, data)
      const before = owner0
        ? capacityRemaining(
            he0,
            owner0.accessories.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) })),
            ratingOf(owner0, he0),
          )
        : null
      // (a level of a family: the level's own entry takes the line, which then needs no rating of its own)
      if (level) {
        x.id = level.id
        x.name = level.name
        delete x.rating
      } else if (op.rating !== undefined) x.rating = op.rating
      // a fitted accessory's new rating may not overfill its host (the add path's guard, accessoryProblem)
      const owner = allLines(b).find(h => h.accessories.includes(x))
      if (owner && op.rating !== undefined) {
        const he = entryOf(owner, data),
          left = (as: Sr6Purchase[]) =>
            capacityRemaining(
              he,
              as.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) })),
              ratingOf(owner, he),
            )
        const after = left(owner.accessories)
        if (after !== null && after < 0 && !(before !== null && before < 0)) {
          Object.assign(x, prev)
          if (prev.rating === undefined) delete x.rating
          return no('Not enough remaining capacity.')
        }
      }
      if (op.grade) x.grade = op.grade
      else if (op.grade === null) delete x.grade
      // its add-ons follow it (a grade a file gave one is dropped: they have the implant's)
      if (op.grade !== undefined && x.kind === 'augmentations') for (const a of x.accessories) delete a.grade
      return OK
    }
    case 'bonus': {
      const x: { bonuses?: Bonus[] } | undefined = allLines(b).find(p => p.uid === op.uid) ?? b.picks.find(p => p.uid === op.uid)
      if (!x) return no('unknown-line')
      if (op.bonuses.some(y => y.target === 'skill' && !y.skill)) return no('no-skill') // (a skill bonus names its skill)
      if (op.bonuses.length) x.bonuses = op.bonuses
      else delete x.bonuses
      return OK
    }
    case 'situational': {
      const x: { sit?: Record<string, number> } | undefined =
        allLines(b).find(p => p.uid === op.uid) ?? b.picks.find(p => p.uid === op.uid) ?? b.qualities.find(q => q.uid === op.uid)
      if (!x) return no('unknown-line')
      const n = Math.min(99, Math.max(0, Math.trunc(op.times) || 0))
      const sit: Record<string, number> = { ...x.sit, [op.index]: n }
      if (!n) delete sit[op.index]
      if (Object.keys(sit).length) x.sit = sit
      else delete x.sit
      return OK
    }
    case 'contact': {
      if ('remove' in op)
        return removeBy(b.contacts, op.remove, l => {
          b.contacts = l
        })
      const { op: _, uid, ...patch } = op
      if ((patch.connection ?? 1) < 1 || (patch.loyalty ?? 1) < 1) return no('below-one')
      if (patch.types) {
        // one or two types, each once (a contact gains its second from a module of another type)
        const types = [...new Set(patch.types)]
        if (types.length > 2 || types.some(t => !CONTACT_TYPES.includes(t))) return no('bad-types')
        if (types.length) patch.types = types
        else delete patch.types
        if (!types.length && uid) delete b.contacts.find(x => x.uid === uid)?.types
      }
      if (!uid) {
        b.contacts.push({ uid: newId(), name: '', archetype: '', connection: 1, loyalty: 1, ...patch })
        return OK
      }
      const c = b.contacts.find(x => x.uid === uid)
      if (!c) return no('unknown-line')
      Object.assign(c, patch)
      return OK
    }
    case 'knowledge': {
      if ('remove' in op)
        return removeBy(b.knowledge, op.remove, l => {
          b.knowledge = l
        })
      if (!op.uid) {
        if (op.native && b.knowledge.some(x => x.native)) return no('one-native')
        // a native language is free; anything else starts with one point
        b.knowledge.push({
          uid: newId(),
          name: op.name ?? '',
          kind: op.kind ?? 'knowledge',
          ...(op.native ? { native: true as const, points: 0 } : { points: 1 }),
          karma: 0,
        })
        return OK
      }
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (op.name !== undefined) k.name = op.name
      if (op.kind) k.kind = op.kind
      // owner's decision 6: one native language a runner
      if (op.native && b.knowledge.some(x => x !== k && x.native)) return no('one-native')
      if (op.native) {
        k.native = true
        k.points = 0
      } else if (op.native === false) delete k.native
      // a nuyen-paid flag only lives on a non-native Knowledge line; drop it when the row stops being one, so it can't
      // silently reactivate (and cost 0 karma again) if the line is later changed back to a Knowledge skill
      if (k.kind !== 'knowledge' || k.native) delete k.payment
      return OK
    }
    case 'knowledgePayment': {
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (op.payment === 'nuyen') {
        if (k.native || k.kind !== 'knowledge' || !knowledgeNuyenAvailable(b, data)) return no('knowledge-nuyen-unavailable')
        k.payment = 'nuyen'
      } else delete k.payment
      return OK
    }
    case 'knowledgeRank': {
      const k = b.knowledge.find(x => x.uid === op.uid)
      if (!k) return no('unknown-line')
      if (k.native) return no('native')
      // (owner 2026-10-11: no language above languageMax; the Native one counts as that level)
      const most = languageCap(b, data, num(cr, 'languageMax'))
      if (k.kind === 'language' && most !== undefined && op.delta > 0 && k.points + k.karma + op.delta > most) return no('language-max')
      return step(
        () => k[op.pool],
        v => {
          k[op.pool] = v
        },
        op.delta,
      )
    }
    case 'cp':
      if (b.method !== 'pointbuy') return no('not-point-buy')
      return step(
        () => b.cp[op.pool],
        v => {
          b.cp[op.pool] = v
        },
        op.delta,
      )
    case 'lifemodule': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      if ('remove' in op) {
        const i = op.at ?? b.lifepath.map(m => m.id).lastIndexOf(op.remove)
        if (b.lifepath[i]?.id !== op.remove) return no('not-taken')
        b.lifepath.splice(i, 1)
        return OK
      }
      if (op.choice !== undefined) {
        const pk = op.at !== undefined ? (b.lifepath[op.at]?.id === op.id ? b.lifepath[op.at] : undefined) : b.lifepath.find(m => m.id === op.id)
        const c = data.lifemodules[op.id]?.choices[op.choice]
        if (!pk) return no('not-taken')
        if (!c) return no('unknown-choice')
        if (!c.options.includes(op.pick)) return no('unknown-option')
        pk.choices[op.choice] = op.pick
        return OK
      }
      // (an adult module the runner's magic kind doesn't fit is taken: Review's lifepath.requires)
      const avail = (makeProvider(b.method, data, cr).available?.(b) ?? []).find(m => m.id === op.id)
      if (!avail) return no('not-available')
      if (avail.taken && !avail.again) return no('already-taken')
      const cap = num(cr, 'lifepath.moduleCount')
      if (cap !== undefined && b.lifepath.length >= cap) return no('module-count')
      b.lifepath.push({ id: op.id, choices: {} })
      return OK
    }
    case 'bestAttr': {
      if (b.method !== 'lifepath') return no('not-lifepath')
      const special = (a?: Sr6Attr | null) => !!a && !CORE_ATTRS.includes(a)
      if (special(op.attr) || special(op.extra)) return no('not-core') // never Edge, Magic or Resonance
      if (op.attr) b.bestAttr = op.attr
      else {
        delete b.bestAttr
        delete b.bestExtra
      }
      if (op.extra !== undefined) {
        if (op.extra && op.attr) b.bestExtra = op.extra
        else delete b.bestExtra
      }
      return OK
    }
    case 'lifestyle': {
      const s = b.sins.find(x => x.uid === op.sin)
      if (!s) return no('unknown-line')
      const ls = s.lifestyles ?? []
      if ('remove' in op)
        return removeBy(ls, op.remove, l => {
          if (l.length) s.lifestyles = l
          else delete s.lifestyles
        })
      if (op.id !== undefined && !data.entry('lifestyles', op.id)) return no('unknown-entry')
      if (op.months !== undefined && op.months < 1) return no('below-one')
      if (!op.uid) {
        if (op.id === undefined) return no('unknown-entry')
        s.lifestyles = [...ls, { uid: newId(), id: op.id, months: op.months ?? 1 }]
        return OK
      }
      const l = ls.find(x => x.uid === op.uid)
      if (!l) return no('unknown-line')
      if (op.id !== undefined) l.id = op.id
      if (op.months !== undefined) l.months = op.months
      return OK
    }
    case 'sin': {
      if ('remove' in op)
        return removeBy(b.sins, op.remove, l => {
          b.sins = l
        })
      if (op.rating !== undefined && op.rating < 1) return no('below-one')
      if (!op.uid) {
        const kind = op.kind ?? 'fake'
        b.sins.push({
          uid: newId(),
          name: op.name ?? '',
          kind,
          ...(kind === 'fake' ? { rating: op.rating ?? 1 } : {}),
          ...(op.gender?.trim() ? { gender: op.gender } : {}),
          licences: [],
        })
        return OK
      }
      const s = b.sins.find(x => x.uid === op.uid)
      if (!s) return no('unknown-line')
      // a kind change: a fake SIN gets a rating (1 unless given), a real one has none
      const kind = op.kind ?? s.kind,
        rating = kind === 'fake' ? (op.rating ?? (s.kind === 'fake' ? s.rating : undefined) ?? 1) : undefined
      s.kind = kind
      if (rating === undefined) delete s.rating
      else s.rating = rating
      // (its licences take its rating: re-priced with it; owner 2026-10-16)
      rateLicences(s)
      if (op.name !== undefined) s.name = op.name
      // named, or its kind or rating set: a placeholder is a normal SIN now
      if (op.name !== undefined || op.kind !== undefined || op.rating !== undefined) delete s.placeholder
      if (op.gender !== undefined) {
        if (op.gender.trim()) s.gender = op.gender
        else delete s.gender
      }
      return OK
    }
    case 'licence': {
      const s = b.sins.find(x => x.uid === op.sin)
      if (!s) return no('unknown-line')
      if ('remove' in op) {
        if (!s.licences[op.remove]) return no('unknown-line')
        s.licences.splice(op.remove, 1)
        return OK
      }
      // (a licence is rated as its SIN; renaming one is reversible, a blank name refused)
      const name = op.name.trim()
      if (!name) return no('needs-name')
      if (op.at === undefined) s.licences.push({ name, rating: licenceRating(s) })
      else if (s.licences[op.at]) s.licences[op.at].name = name
      else return no('unknown-line')
      return OK
    }
    case 'karmaToNuyen': {
      const v = b.karmaToNuyen + op.delta,
        max = toNuyenMax(b, cr, data)
      if (v < 0) return no('below-zero')
      if (max !== undefined && v > max) return no('conversion-cap')
      b.karmaToNuyen = v
      return OK
    }
    case 'karmaToDeck': {
      if (!activeRules(b, data).has('DECK_5000_PER_KARMA')) return no('rule-inactive')
      if (b.karmaToDeck + op.delta < 0) return no('below-zero')
      b.karmaToDeck += op.delta
      return OK
    }
    case 'mentor': {
      const mentor = str(cr, 'mentorSpiritQuality')
      if (op.id !== undefined) {
        if (op.id && !data.entry('mentorspirits', op.id)) return no('unknown-entry')
        const had = mentor ? b.qualities.filter(q => q.id === mentor) : []
        if (op.id) {
          b.mentorSpirit = op.id
          if (mentor && !had.length && data.qualities[mentor]) b.qualities.push({ uid: newId(), id: mentor, level: 1, name: data.qualities[mentor].name })
        } else {
          delete b.mentorSpirit
          delete b.mentorAdvantage
          b.qualities = b.qualities.filter(q => q.id !== mentor || q.free)
        }
      }
      if (op.advantage !== undefined) {
        if (op.advantage && b.magic !== 'mystic-adept') return no('not-mystic-adept')
        if (op.advantage) b.mentorAdvantage = op.advantage
        else delete b.mentorAdvantage
      }
      return OK
    }
    case 'seats': {
      const x = b.purchases.find(p => p.uid === op.uid && p.kind === 'vehicles')
      if (!x) return no('unknown-line')
      if (op.removed < 0) return no('below-zero')
      if (op.removed > seatsOf(entryOf(x, data))) return no('at-maximum')
      if (op.removed) x.seatsRemoved = op.removed
      else delete x.seatsRemoved
      return OK
    }
    case 'licensed': {
      // an item's licence is one of its SIN's licences (owner 2026-10-16), named after the licence type covering it and
      // rated as the SIN: on a fake SIN a fake licence, on a real SIN at its printed fee (budgets.ts sinCost). Never enforced
      const x = allLines(b).find(p => p.uid === op.uid),
        s = b.sins.find(s => s.uid === op.sin)
      if (!x || !s) return no('unknown-line')
      if (!op.on) {
        s.licences = s.licences.filter(l => l.item !== x.uid)
        return OK
      }
      if (licenceFee(x, data) === undefined) return no('no-licence')
      if (s.licences.some(l => l.item === x.uid)) return OK
      s.licences.push(itemLicence(x, s, licenceName(x, data)))
      return OK
    }
    case 'transhuman': {
      // the Sixth World Companion's Transhumanism (p. 146): only with the rule on, only for a mundane, up to the 20 grades the rule allows
      const k = MAGIC_KINDS[b.magic],
        v = b.transhuman + op.delta
      if (v < 0) return no('below-zero')
      if (op.delta > 0 && !flag(cr, 'transhumanism')) return no('rule-off')
      if (k.spells || k.powers || k.resonance) return no('not-mundane')
      if (v > TRANSHUMAN_MAX) return no('at-maximum')
      b.transhuman = v
      return OK
    }
    case 'initiation':
    case 'submersion': {
      const k = MAGIC_KINDS[b.magic],
        v = b[op.op] + op.delta
      if (v < 0) return no('below-zero')
      if (op.op === 'initiation' ? !k.spells && !k.powers : !k.resonance) return no(op.op === 'initiation' ? 'not-awakened' : 'not-emerged')
      b[op.op] = v
      return OK
    }
  }
}

/** Whether a pure adept may not take skill `id`: a Magic skill but Astral (owner's decision 3, 2026-10-11). */
export const adeptBars = (b: Sr6Build, data: Sr6Data, id: string) =>
  b.magic === 'adept' && data.skills[id]?.attr === 'mag' && normName(data.skills[id].name) !== 'astral'

/** Whether quality `id` with note `note` would name the skill an opposite quality names (Aptitude against Incompetent,
 *  aptitudeQuality and incompetentQuality; owner's decision 2, 2026-10-11). self: the line being changed. */
export function opposite(b: Sr6Build, data: Sr6Data, cr: CreationRules, id: string, note: string, self?: string): boolean {
  const apt = str(cr, 'aptitudeQuality'),
    inc = str(cr, 'incompetentQuality'),
    skill = noteSkill(data, note)
  const other = id === apt ? inc : id === inc ? apt : undefined
  return !!skill && !!other && b.qualities.some(q => q.uid !== self && q.id === other && noteSkill(data, q.note) === skill)
}

function removeBy<T extends { uid: string }>(list: T[], uid: string, set: (l: T[]) => void): Result {
  if (!list.some(x => x.uid === uid)) return no('unknown-line')
  set(list.filter(x => x.uid !== uid))
  return OK
}

/** A new purchase line from the catalog (or the player's custom numbers), checked: entry known, rating in its range,
 *  a grade whose Essence factor is set on an augmentation (one its type doesn't take: Review's gear.grade), a quantity
 *  of at least 1. */
function newLine(
  op: {
    kind: PurchaseKind
    id?: string
    rating?: number
    qty?: number
    grade?: string
    custom?: { name: string; cost: number; avail: number; essence: number }
  },
  data: Sr6Data,
  cr: CreationRules,
): Sr6Purchase | { ok: false; reason: string } {
  const qty = op.qty ?? 1
  if (qty < 1) return { ok: false, reason: 'below-one' }
  if (op.grade && !gradeKnown(cr, data, op.grade)) return { ok: false, reason: 'unknown-grade' }
  const base = { uid: newId(), kind: op.kind, qty, accessories: [], ...(op.grade ? { grade: op.grade } : {}) }
  if (!op.id) {
    const c = op.custom ?? { name: '', cost: 0, avail: 0, essence: 0 }
    if (c.cost < 0 || c.avail < 0 || c.essence < 0) return { ok: false, reason: 'below-zero' } // Review's hard value.negative would block it for good
    return { ...base, name: c.name, cost: c.cost, avail: c.avail, essence: c.essence }
  }
  const e = data.entry(op.kind, op.id)
  if (!e) return { ok: false, reason: 'unknown-entry' }
  // a family of levels (levels.ts): the level asked for (the line then carries no rating of its own)
  const fam = data.family(op.kind, op.id)
  const level = fam ? data.atLevel(op.kind, op.id, op.rating ?? data.levelOf(e) ?? Math.min(...fam.levels.keys())) : undefined
  if (fam && !level) return { ok: false, reason: 'rating-range' }
  const range = ratingRange(e.attrs.rating)
  if (!fam && op.rating !== undefined && (range.length ? !range.includes(op.rating) : chosenRating(e) && !(Number.isInteger(op.rating) && op.rating >= 1)))
    return { ok: false, reason: 'rating-range' }
  const gp = op.grade && gradeProblem(cr, data, op.grade, level ?? e)
  if (gp) return { ok: false, reason: gp }
  if (level) return { ...base, id: level.id, name: level.name }
  return { ...base, id: op.id, name: e.name, ...(op.rating !== undefined ? { rating: op.rating } : {}) }
}

/** Shared add-time guard for all accessory pickers. */
export function accessoryProblem(host: Sr6Purchase, line: Sr6Purchase, data: Sr6Data): string | undefined {
  const he = entryOf(host, data),
    e = entryOf(line, data)
  const items = host.accessories.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) }))
  const remaining = capacityRemaining(he, items, ratingOf(host, he))
  if (remaining !== null && capacityUsed(e, ratingOf(line, e)) * line.qty > Math.max(0, remaining)) return 'Not enough remaining capacity.'
  // a host that prints a Capacity (cyberlimb, cybereyes, glasses, armor) governs by that Capacity — the book value we
  // import — so an accessory installs when its [capacity] fits, even if it declares a `fits` slot the host doesn't carry.
  // Only a slot-only host (no Capacity: weapon mounts, vehicle hardpoints) is limited by its mount slots themselves. A
  // vehicle is governed by modsOf below (its declared-or-Body mod-slot budget), not the generic mount-slot placement.
  if (remaining === null && host.kind !== 'vehicles') {
    const slots = mountSlots(he, [...items, { ...line, entry: e }], ratingOf(host, he), host.addedSlots)
    if (slots.unplaced.length > mountSlots(he, items, ratingOf(host, he), host.addedSlots).unplaced.length) return 'No compatible mount slot remaining.'
  }
  if (host.kind !== 'vehicles') return
  if (line.kind === 'weapons') {
    const mount = mountsOf(host, data).find(m => m.uid === line.mount)
    if (!line.mount || !mount) return 'A free weapon mount is required.'
    if (mount.taken || host.accessories.some(a => a.mount === line.mount)) return 'This weapon mount is full.'
  }
  const before = modsOf(host, data),
    after = modsOf({ ...host, accessories: [...host.accessories, line] }, data)
  return budgetProblem(before, after)
}

/** Why `after` (a vehicle's mods once a change is made) is over a budget `before` was not: the one test the picker's
 *  add, the guard and a restored factory part share (decomposition plan 3.4). `stock`: the vehicle as the factory built it
 *  (nothing removed, nothing fitted): what the book's own fit already goes over (a Hornet's injector on a drone that has no
 *  hardpoint to give) is not a reason to refuse putting that part back. */
function budgetProblem(before: VehicleMods, after: VehicleMods, stock?: VehicleMods): string | undefined {
  if (after.derivedOver.length > before.derivedOver.length) return 'Not enough room freed in that part of the vehicle.'
  const universal = after.builtin.reduce((n, b) => n + (b.category === 'universal' ? (b.slots ?? 0) : 0), 0)
  const slotOver = (m: VehicleMods) => Object.values(m.slots ?? {}).reduce((n, s) => n + Math.max(0, s.used - s.max), 0)
  if (slotOver(after) > Math.max(universal, slotOver(before), stock ? slotOver(stock) : 0)) return 'Not enough remaining mod slots.'
  for (const key of ['hardpoints', 'mounts', 'autosofts'] as const) {
    const m = after[key]
    if (m && m.used > Math.max(m.max, before[key]?.used ?? 0, stock?.[key]?.used ?? 0)) return 'Not enough remaining vehicle slots or mounts.'
  }
}

/** Takes a factory part off a vehicle, or (restore) puts it back while its hook has room; shared by the creation `part`
 *  op and the career `part` entry. Removing refunds nothing (D4: vehiclemods.ts partRefund); a weapon sitting in a mount
 *  part that goes falls out of it. Restoring under a removed parent is refused: restore the parent. */
export function setPart(x: Sr6Purchase, id: string, restore: boolean, data: Sr6Data): Result {
  const parts = partsOf(x, data),
    p = parts.find(y => y.id === id)
  if (!p) return no('not-a-part')
  const gone = x.removedParts ?? []
  if (restore) {
    if (!gone.includes(id)) return no(p.removed ? 'parent-removed' : 'not-removed')
    const next = gone.filter(u => u !== id),
      back = { ...x, removedParts: next.length ? next : undefined }
    if (budgetProblem(modsOf(x, data), modsOf(back, data), modsOf({ ...x, removedParts: undefined, accessories: [] }, data))) return no('no-room')
    if (next.length) x.removedParts = next
    else delete x.removedParts
    return OK
  }
  if (p.removed) return no('already-removed')
  x.removedParts = [...gone, id]
  const after = partsOf(x, data).filter(y => y.removed)
  for (const a of x.accessories) if (after.some(y => y.uid === a.mount)) delete a.mount
  return OK
}

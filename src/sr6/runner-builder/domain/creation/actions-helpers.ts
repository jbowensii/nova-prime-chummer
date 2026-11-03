// Build actions, shared types (Op, Result) and helpers every op handler uses (no cycles: nothing here imports the handlers).
import { capacityRemaining, capacityUsed } from '../../../catalog/domain/categories'
import { fit } from '../../../catalog/domain/structure'
import { ratingOf } from './purchases'
import type { Sr6Kind } from '../../../formats/domain/types'
import { newId } from '../../../../core/shared/types'
import {
  type Bonus,
  type ContactType,
  type CpPool,
  type PetClass,
  type PickKind,
  type PurchaseKind,
  type SlotShift,
  type Sr6Attr,
  type Sr6Build,
  type Sr6Knowledge,
  type Sr6Purchase,
  type Sr6ItemFlag,
} from '../../../formats/domain/character'
import { structureOf } from '../../../catalog/domain/structure'
import { str, type CreationRules } from '../../../table-setup/domain/creation'
import { type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { gradeKnown, gradeProblem } from './grades'
import { chosenRating, ratingRange } from '../../../catalog/domain/values'
import { entryOf, noteSkill } from './budgets'
import { fittedParts, modsOf, mountsOf, partsOf, type VehicleMods } from '../assets/vehiclemods'

export type OpOf<K extends Op['op']> = Extract<Op, { op: K }>
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
  /** the SURGE collective (a qualitysets id; '' none) and its choice: its qualities come free (surge.ts setCollective) */
  | { op: 'collective'; id: string; choice?: string }
  /** the shifter's animal form: a Shifter quality of one form (drake.ts shifterForms); the runner's Shifter line moves to it */
  | { op: 'shifterForm'; id: string }
  /** a drake's dracoform adjustment points on an attribute its drake type names (drake.ts dracoformPool); 0 clears */
  | { op: 'dracoform'; attr: Sr6Attr; points: number }
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
      note?: string
      custom?: { name: string; cost: number; avail: number; essence: number }
    }
  | { op: 'purchase'; remove: string }
  /** a starter pack bought: expanded into its lines at its price (packs.ts); taken away whole with `purchase remove` of its header */
  | { op: 'pack'; id: string }
  /** a vehicle or drone bought from a design (design.ts boughtDesign); taken away as any line (purchase remove) */
  | { op: 'design'; line: Sr6Purchase }
  /** a custom line the item builders made (a custom cyberlimb, assets/builders.ts customLimb) or, with `host`, a player's own
   *  add-on fitted to that line (customAddon; Review asks a GM to approve it, owner ruling 6): its `custom.` id and snapshot */
  | { op: 'custom'; line: Sr6Purchase; host?: string }
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
  /** set (value) or clear (omitted) a vehicle/drone line's GM-set Design Points (else estimated from its price) */
  | { op: 'vehicledp'; uid: string; value?: number }
  /** a purchased line's choice note: the attribute/skill/quality/matrix an item naming a choice is for ('' clears it) */
  | { op: 'purchaseNote'; uid: string; note: string }
  /** a quality's or purchase's sub-option or variant pick (structure.ts subChoices): option ids, `,`-joined; '' clears */
  | { op: 'lineOptions'; uid: string; ref: string; value: string }
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
  /** an armor line's Commlink6 user flag (custom-fitted, cheap knockoff) on or off */
  | { op: 'itemFlag'; uid: string; flag: Sr6ItemFlag; on: boolean }
  /** a line's (or accessory's) rating or grade changed in place; grade null: none. A line holding a level of a family
   *  (levels.ts) moves to the level's entry instead (its `rating` is the level) */
  | { op: 'rate'; uid: string; rating?: number; grade?: string | null }
  /** the bonuses on a purchase, accessory or pick */
  | { op: 'bonus'; uid: string; bonuses: Bonus[] }
  /** switch a situational effect of a purchase, pick or quality on (times 1, or a count for a `per ...` one) or off (0); key: the effect's sitKey */
  | { op: 'situational'; uid: string; key: string; times: number }
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
export const OWN_LINE = new Set<PurchaseKind>(['weapons', 'armor', 'augmentations', 'vehicles', 'critters'])

export const OK: Result = { ok: true }
export const no = (reason: string): Result => ({ ok: false, reason })
/** a counter moved by delta, refused below zero */
export function step(get: () => number, set: (v: number) => void, delta: number): Result {
  const v = get() + delta
  if (v < 0) return no('below-zero')
  set(v)
  return OK
}

/** Every purchase, and every accessory on one. */
/** Lines and everything fitted to them, at any depth (a weapon's ammunition's ammunition type, as imports nest them). */
export const deep = (xs: Sr6Purchase[]): Sr6Purchase[] => xs.flatMap(x => [x, ...deep(x.accessories)])
export const allLines = (b: Sr6Build) => deep(b.purchases)
/** An accessory taken off its host; a weapon in it (a weapon mount) stays, in no mount. Shared with career.ts. */
export function unfit(host: Sr6Purchase, uid: string): void {
  host.accessories = host.accessories.filter(a => a.uid !== uid)
  for (const a of host.accessories) if (a.mount === uid) delete a.mount
}
/** A removed line's licences go with it (the lines: it and its accessories). */
export const unlicense = (b: Sr6Build, gone: Sr6Purchase[]) => {
  for (const s of b.sins) s.licences = s.licences.filter(l => !gone.some(x => x.uid === l.item))
}

/** Whether a pure adept may not take skill `id`: a Magic skill but Astral (owner's decision 3, 2026-10-11). */
export const adeptBars = (b: Sr6Build, data: Sr6Data, id: string) =>
  b.magic === 'adept' && data.skills[id]?.attr === 'mag' && normName(data.skills[id].name) !== 'astral'

/** Whether quality `id` with note `note` would name the skill an opposite quality names (Aptitude against Incompetent,
 *  aptitudeQuality and incompetentQuality; owner's decision 2, 2026-10-11). self: the line being changed. */
/** Whether the runner already holds quality `id` (or a level of its family) for the same choice (`note`, none: an unnamed
 *  copy), another line than `self`: a repeatable quality is taken again only for a different choice. */
export function sameChoice(b: Sr6Build, data: Sr6Data, id: string, note: string | undefined, self?: string): boolean {
  const fam = data.family('qualities', id),
    key = (note ?? '').trim().toLowerCase()
  return b.qualities.some(
    x => !x.free && x.uid !== self && (x.id === id || (!!fam && data.family('qualities', x.id) === fam)) && (x.note ?? '').trim().toLowerCase() === key,
  )
}

export function opposite(b: Sr6Build, data: Sr6Data, cr: CreationRules, id: string, note: string, self?: string): boolean {
  const apt = str(cr, 'aptitudeQuality'),
    inc = str(cr, 'incompetentQuality'),
    skill = noteSkill(data, note)
  const other = id === apt ? inc : id === inc ? apt : undefined
  return !!skill && !!other && b.qualities.some(q => q.uid !== self && q.id === other && noteSkill(data, q.note) === skill)
}

export function removeBy<T extends { uid: string }>(list: T[], uid: string, set: (l: T[]) => void): Result {
  if (!list.some(x => x.uid === uid)) return no('unknown-line')
  set(list.filter(x => x.uid !== uid))
  return OK
}

/** A new purchase line from the catalog (or the player's custom numbers), checked: entry known, rating in its range,
 *  a grade whose Essence factor is set on an augmentation (one its type doesn't take: Review's gear.grade), a quantity
 *  of at least 1. */
export function newLine(
  op: {
    kind: PurchaseKind
    id?: string
    rating?: number
    qty?: number
    grade?: string
    note?: string
    custom?: { name: string; cost: number; avail: number; essence: number }
  },
  data: Sr6Data,
  cr: CreationRules,
): Sr6Purchase | { ok: false; reason: string } {
  const qty = op.qty ?? 1
  if (qty < 1) return { ok: false, reason: 'below-one' }
  if (op.grade && !gradeKnown(cr, data, op.grade)) return { ok: false, reason: 'unknown-grade' }
  const base = {
    uid: newId(),
    kind: op.kind,
    qty,
    accessories: [],
    ...(op.grade ? { grade: op.grade } : {}),
    ...(op.note?.trim() ? { note: op.note.trim().slice(0, 200) } : {}),
  }
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
  // Commlink6's UNMODIFYABLE flag (ItemTemplate.validate): the item takes no accessories
  if (he && structureOf(he).flags.includes('UNMODIFYABLE')) return 'This item can’t be modified.'
  const items = host.accessories.map(a => ({ ...a, entry: entryOf(a, data), rating: ratingOf(a, entryOf(a, data)) }))
  const remaining = capacityRemaining(he, items, ratingOf(host, he))
  if (remaining !== null && capacityUsed(e, ratingOf(line, e)) * line.qty > Math.max(0, remaining)) return 'Not enough remaining capacity.'
  // a host that prints a Capacity (cyberlimb, cybereyes, glasses, armor) governs by that Capacity — the book value we
  // import — so an accessory installs when its [capacity] fits, even if it declares a `fits` slot the host doesn't carry.
  // Only a slot-only host (no Capacity: weapon mounts, vehicle hardpoints) is limited by its mount slots themselves. A
  // vehicle is governed by modsOf below (its declared-or-Body mod-slot budget), not the generic mount-slot placement.
  if (remaining === null && host.kind !== 'vehicles') {
    // (the one fit engine, as Review's catalog.accessoryHost and the picker)
    const f = e ? fit(he, e, [...fittedParts(host, data), ...items], ratingOf(host, he), host.addedSlots) : undefined
    if (f?.ok === false) return f.reason === 'size' ? 'Too big for this mount.' : 'No compatible mount slot remaining.'
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
export function budgetProblem(before: VehicleMods, after: VehicleMods, stock?: VehicleMods): string | undefined {
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
    // (a weapon's standard upgrade takes no vehicle hook: it always goes back)
    if (x.kind === 'vehicles' && budgetProblem(modsOf(x, data), modsOf(back, data), modsOf({ ...x, removedParts: undefined, accessories: [] }, data)))
      return no('no-room')
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

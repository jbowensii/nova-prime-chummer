// Shadowrun 6 runner XML: the primitive readers (attributes, bonuses, purchases, picks) the build, ledger, NPC and design readers share (see charxml.ts).
import { each, kid, kids } from '../../../core/shared/xml'
import {
  BONUS_SWITCHES,
  type Sr6Situational,
  type Sr6ItemFlag,
  BONUS_TARGETS,
  CONTACT_TYPES,
  PICK_KINDS,
  PET_CLASSES,
  PURCHASE_KINDS,
  SHIFT_KINDS,
  SR6_ATTRS,
  type Bonus,
  type BonusSwitch,
  type ContactType,
  type SlotShift,
  type Sr6Attr,
  type Sr6BoundSpirit,
  type Sr6Contact,
  type Sr6CritterQuality,
  type Sr6CritterTrained,
  type Sr6Knowledge,
  type Sr6MartialArt,
  type Sr6Pick,
  type Sr6Purchase,
  type Sr6Quality,
} from './character'
import { toEntry } from './entryxml'

/** Leave out what isn't set, so a runner reads back exactly as written. */
export const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
export const listOrNone = <T>(xs: T[]) => (xs.length ? xs : undefined)
export const str = (e: Element, a: string) => e.getAttribute(a) ?? undefined
// a drake's dracoform points: `bod:2 str:4`
export const readDracoform = (t?: string): Partial<Record<Sr6Attr, number>> | undefined => {
  const pairs = (t ?? '')
    .split(/\s+/)
    .map(x => x.split(':'))
    .filter(([k, v]) => (SR6_ATTRS as string[]).includes(k) && Number(v) > 0)
  return pairs.length ? Object.fromEntries(pairs.map(([k, v]) => [k, Number(v)])) : undefined
}
// a line's sub-option picks: `<pick>=<id>[,<id>]` joined by `;`
export const optionsText = (o?: Record<string, string>) =>
  o && Object.keys(o).length
    ? Object.entries(o)
        .map(([k, v]) => `${k}=${v}`)
        .join(';')
    : undefined
export const readOptions = (e: Element): Record<string, string> | undefined => {
  const pairs = (e.getAttribute('options') ?? '')
    .split(';')
    .map(t => t.split('='))
    .filter(([k, v]) => k && v)
  return pairs.length ? Object.fromEntries(pairs.map(([k, v]) => [k.trim(), v.trim()])) : undefined
}
export const yes = (e: Element, a: string) => (e.getAttribute(a) === 'true' ? (true as const) : undefined)
/** A number attribute: absent → `absent`; not a number → throws naming it. */
export function num(e: Element, a: string): number | undefined
export function num(e: Element, a: string, absent: number): number
export function num(e: Element, a: string, absent?: number) {
  const v = e.getAttribute(a)
  if (v == null) return absent
  const x = Number(v)
  if (v.trim() === '' || !Number.isFinite(x)) throw new Error(`${a}="${v}" isn’t a number`)
  return x
}
/** A value from a fixed list: anything else throws, or in repair becomes `fallback` (undefined: left out) with a note. */
export function oneOf<T extends string>(v: string | null, allowed: readonly T[], what: string, fallback?: T, fix?: string[]): T | undefined {
  if ((allowed as readonly string[]).includes(v ?? '')) return v as T
  if (!fix) throw new Error(`${what} “${v ?? ''}” (not one of ${allowed.join(', ')})`)
  fix.push(`The ${what} “${v ?? ''}” isn’t known: ${fallback ? `set to ${fallback}` : 'left out'}.`)
  return fallback
}
export const label = (e: Element, i: number) => `${e.localName} ${i + 1}`

export function readBonus(e: Element): Bonus {
  const target = oneOf(e.getAttribute('target'), BONUS_TARGETS, 'bonus target')!,
    skill = str(e, 'skill')
  if (target === 'skill' && !skill) throw new Error('a skill bonus names no skill')
  const by = str(e, 'byRating')?.split(',').map(Number)
  return def({
    target,
    skill: target === 'skill' ? skill : undefined,
    value: num(e, 'value', 0),
    perRating: yes(e, 'perRating'),
    minus: num(e, 'minus'),
    byRating: by?.length && by.every(Number.isFinite) ? by : undefined,
    when: str(e, 'when'),
    spec: str(e, 'spec'),
    switch: (BONUS_SWITCHES as string[]).includes(str(e, 'switch') ?? '') ? (str(e, 'switch') as BonusSwitch) : undefined,
    affects: str(e, 'affects') === 'caster' || str(e, 'affects') === 'target' ? (str(e, 'affects') as Bonus['affects']) : undefined,
  })
}
export const readBonuses = (e: Element) => {
  const xs = kids(e, 'bonus').map(readBonus)
  return xs.length ? xs : undefined
}

/** licensed: told an older line's licences (licensedOn: the SINs' uids; before it, licence="bought": the first SIN's, ''
 *  when the runner has none), which readBuild moves onto those SINs. */
export function readPurchase(e: Element, fix?: string[], licensed?: (x: Sr6Purchase, sins: string[]) => void): Sr6Purchase {
  const kind = oneOf(e.getAttribute('kind'), PURCHASE_KINDS, 'purchase kind')!
  const snap = kid(e, 'snapshot')?.firstElementChild,
    on = str(e, 'licensedOn')?.split(/\s+/).filter(Boolean) ?? (e.getAttribute('licence') === 'bought' ? [''] : [])
  const x: Sr6Purchase = def({
    uid: e.getAttribute('uid') ?? '',
    kind,
    sin: str(e, 'sin'),
    id: str(e, 'id'),
    name: str(e, 'name'),
    cost: num(e, 'cost'),
    gmPrice: num(e, 'gmPrice'),
    avail: num(e, 'avail'),
    slots: num(e, 'slots'),
    dp: num(e, 'dp'),
    essence: num(e, 'essence'),
    rating: num(e, 'rating'),
    qty: num(e, 'qty', 1),
    grade: str(e, 'grade'),
    worn: yes(e, 'worn'),
    seq: num(e, 'seq'),
    flags: (f => (f.length ? f : undefined))(
      (str(e, 'flags')?.split(/\s+/) ?? []).filter((t): t is Sr6ItemFlag => t === 'CUSTOM_FITTED' || t === 'CHEAP_KNOCK_OFF'),
    ),
    bonuses: readBonuses(e),
    sit: readSit(e),
    note: str(e, 'note'),
    seatsRemoved: num(e, 'seatsRemoved'),
    mount: str(e, 'mount'),
    diy: yes(e, 'diy'),
    material: str(e, 'material'),
    options: readOptions(e),
    design: str(e, 'design'),
    approved: yes(e, 'approved'),
    pack: str(e, 'pack'),
    slotShifts: readShifts(e, fix),
    addedSlots: readAddedSlots(e),
    removedBuiltins: (u => (u.length ? u : undefined))(
      str(e, 'removedBuiltins')
        ?.split(/\s+/)
        .filter(w => /^(slot-)?builtin:\d+$/.test(w)) ?? [],
    ),
    removedParts: (u => (u.length ? u : undefined))(str(e, 'removedParts')?.split(/\s+/).filter(Boolean) ?? []),
    derived: str(e, 'derivedFrom')
      ? {
          from: str(e, 'derivedFrom')!,
          kind: str(e, 'derivedKind') ?? 'gear',
          hook: str(e, 'derivedHook') ?? '',
          size: num(e, 'derivedSize') ?? 1,
          review: str(e, 'derivedReview') === 'none' ? 'none' : 'needs-owner',
        }
      : undefined,
    pet: str(e, 'pet') === undefined ? undefined : oneOf(e.getAttribute('pet'), PET_CLASSES, 'pet class', undefined, fix),
    tamed: yes(e, 'tamed'),
    trained: listOrNone([...each(kids(e, 'trained'), readTrained, label, fix), ...olderTrained(e, fix)]),
    critterQualities: listOrNone(each(kids(e, 'quality'), readCritterQuality, label, fix)),
    accessories: each(kids(e, 'purchase'), x => readPurchase(x, fix, licensed), label, fix),
    snapshot: snap ? toEntry(snap, kind) : undefined,
  })
  // a weapon naming a mount its host doesn't have (a file edited by hand) sits in none: noted (a built-in one,
  // `builtin:<n>`, is the catalog's: vehiclemods.ts warns when it isn't there)
  for (const a of x.accessories)
    if (a.mount && !/^(part|builtin|slot-builtin):/.test(a.mount) && !x.accessories.some(m => m.uid === a.mount)) {
      fix?.push(`${a.name || 'A weapon'}: its weapon mount isn’t on ${x.name || 'its vehicle'}, so it’s in none (put it in one on the Vehicles or Drones tab).`)
      delete a.mount
    }
  if (on.length) licensed?.(x, on)
  return x
}

/** An owned critter's companion quality (`how`: tamed or bonded; none, specified with the purchase). */
export const readCritterQuality = (e: Element): Sr6CritterQuality => {
  const how = str(e, 'how')
  if (how !== undefined && how !== 'tamed' && how !== 'bonded') throw new Error(`critter quality how “${how}” (not tamed or bonded)`)
  return def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', level: num(e, 'level', 1), name: str(e, 'name'), how })
}

/** An owned critter's named command or special training (`taught`: after it was bought; absent: with the purchase). */
export const readTrained = (e: Element): Sr6CritterTrained => {
  const what = str(e, 'what')
  if (what !== 'command' && what !== 'training') throw new Error(`trained what “${what ?? ''}” (not command or training)`)
  return def({ uid: e.getAttribute('uid') ?? '', what, id: str(e, 'id'), name: str(e, 'name'), taught: yes(e, 'taught') })
}
/** The most of each an older file's count is read as: past any critter's Logic or Intuition × 2 (a count of 1e9 froze
 *  the load). */
export const MAX_OLDER_TRAINED = 99
/** An older file's counts (`commands="2" training="1"`, before they were named): as many unnamed ones, with the purchase
 *  (a tamed critter's taught), noted so the player can pick which they are. A count that isn't a whole number from 0 is
 *  refused (in repair: none, noted); one past MAX_OLDER_TRAINED is refused (in repair: that many, noted). */
export function olderTrained(e: Element, fix?: string[]): Sr6CritterTrained[] {
  const out: Sr6CritterTrained[] = [],
    who = e.getAttribute('name') || 'A critter'
  for (const what of ['command', 'training'] as const) {
    const a = what === 'command' ? 'commands' : 'training'
    let n = num(e, a) ?? 0
    if (!Number.isInteger(n) || n < 0) {
      if (!fix) throw new Error(`${a}="${n}" isn’t a whole number from 0`)
      fix.push(`${who}: its ${a} count “${n}” isn’t a whole number from 0, so it’s left out.`)
      n = 0
    } else if (n > MAX_OLDER_TRAINED) {
      if (!fix) throw new Error(`${a}="${n}" is more than ${MAX_OLDER_TRAINED}`)
      fix.push(`${who}: its ${a} count ${n} is more than any critter learns, so it’s read as ${MAX_OLDER_TRAINED}.`)
      n = MAX_OLDER_TRAINED
    }
    for (let i = 0; i < n; i++) out.push(def({ uid: `${e.getAttribute('uid') ?? ''}-${what}-${i + 1}`, what, taught: yes(e, 'tamed') }))
  }
  if (out.length)
    fix?.push(
      `${e.getAttribute('name') || 'A critter'}: its ${out.length} trained commands and special training had no names, so they’re kept unnamed (pick which they are on the Critters tab).`,
    )
  return out
}

/** A vehicle's slotShifts (`chassis>powertrain …`, Double Clutch p. 120); one that names no category pair is left out, noted. */
export function readShifts(e: Element, fix?: string[]): SlotShift[] | undefined {
  const out: SlotShift[] = []
  for (const w of str(e, 'slotShifts')?.split(/\s+/).filter(Boolean) ?? []) {
    const [from, to] = w.split('>')
    if ((SHIFT_KINDS as string[]).includes(from) && (SHIFT_KINDS as string[]).includes(to) && from !== to) out.push({ from, to } as SlotShift)
    else if (fix) fix.push(`${e.getAttribute('name') || 'A vehicle'}: the mod slot shift “${w}” isn’t between two categories, so it’s left out.`)
    else throw new Error(`mod slot shift “${w}” (not category>category)`)
  }
  return out.length ? out : undefined
}

/** A host's GM-added slots (`id` or `id:value`, space-separated); an empty id is left out. */
export function readAddedSlots(e: Element): { id: string; value?: string }[] | undefined {
  const out: { id: string; value?: string }[] = []
  for (const w of str(e, 'addedSlots')?.split(/\s+/).filter(Boolean) ?? []) {
    const i = w.indexOf(':'),
      id = i < 0 ? w : w.slice(0, i),
      value = i < 0 ? undefined : w.slice(i + 1)
    if (id) out.push(value ? { id, value } : { id })
  }
  return out.length ? out : undefined
}

export const readKnowledge = (e: Element): Sr6Knowledge =>
  def({
    uid: e.getAttribute('uid') ?? '',
    name: e.textContent ?? '',
    kind: oneOf(e.getAttribute('kind'), ['knowledge', 'language'] as const, 'knowledge kind')!,
    native: yes(e, 'native'),
    payment: e.hasAttribute('payment') ? oneOf(e.getAttribute('payment'), ['nuyen'] as const, 'knowledge payment') : undefined,
    points: num(e, 'points', 0),
    karma: num(e, 'karma', 0),
  })
export const readQuality = (e: Element): Sr6Quality =>
  def({
    uid: e.getAttribute('uid') ?? '',
    id: e.getAttribute('id') ?? '',
    level: num(e, 'level', 1),
    karma: num(e, 'karma'),
    free: yes(e, 'free'),
    note: str(e, 'note'),
    name: str(e, 'name'),
    boughtOff: num(e, 'boughtOff'),
    seq: num(e, 'seq'),
    options: readOptions(e),
    sit: readSit(e),
  })
export const readPick = (e: Element): Sr6Pick =>
  def({
    uid: e.getAttribute('uid') ?? '',
    kind: oneOf(e.getAttribute('kind'), PICK_KINDS, 'pick kind')!,
    id: e.getAttribute('id') ?? '',
    level: num(e, 'level'),
    bonuses: readBonuses(e),
    sit: readSit(e),
    name: str(e, 'name'),
    note: str(e, 'note'),
  })
export const readTechnique = (e: Element) => def({ uid: e.getAttribute('uid') ?? '', id: e.getAttribute('id') ?? '', name: str(e, 'name') })
export const readMartial = (e: Element, fix?: string[]): Sr6MartialArt =>
  def({
    uid: e.getAttribute('uid') ?? '',
    id: e.getAttribute('id') ?? '',
    name: str(e, 'name'),
    techniques: each(kids(e, 'technique'), readTechnique, label, fix),
  })
export const readContact = (e: Element): Sr6Contact => {
  const types = (e.getAttribute('types') ?? '').split(/\s+/).filter(t => (CONTACT_TYPES as string[]).includes(t)) as ContactType[]
  return def({
    uid: e.getAttribute('uid') ?? '',
    name: e.getAttribute('name') ?? '',
    archetype: e.getAttribute('archetype') ?? '',
    connection: num(e, 'connection', 0),
    loyalty: num(e, 'loyalty', 0),
    types: types.length ? types : undefined,
  })
}
export const readSpirit = (e: Element): Sr6BoundSpirit =>
  def({
    uid: e.getAttribute('uid') ?? '',
    name: e.getAttribute('name') ?? '',
    force: num(e, 'force', 1),
    services: num(e, 'services', 0),
    note: e.getAttribute('note') ?? undefined,
  })

export function readSit(e: Element): Sr6Situational | undefined {
  const out: Sr6Situational = {}
  for (const w of str(e, 'sit')?.split(/\s+/) ?? []) {
    const m = /^(\S+):(\d+)$/.exec(w)
    if (m && +m[2] > 0) out[decodeURIComponent(m[1])] = +m[2]
  }
  return Object.keys(out).length ? out : undefined
}

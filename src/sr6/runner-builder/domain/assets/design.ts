// A vehicle or drone design (Double Clutch "Build Your Dream", pp. 150-155; owner 2026-10-16, BUILDER Q1-Q4, Q6, Q8, and
// the DESIGNER decisions, cited so): the catalog's vehicledesign parts (a chassis, a powertrain and a console from their
// tables, the size class table, the options, design modifications and quality factors, each with its printed terms:
// docs/sr6-data-format/kinds.md), worked out into the vehicle's stats, its Design Point Value, price and Availability. Where
// the book's tables and formulas and its worked examples disagree, the tables and formulas (owner Q3). A maximum passed
// is a warning, never refused.
//
// The numbers each option and modification changes are the book's rules (pp. 151-153), by the part's name: the catalog
// keeps each part's cost and maximum, not its effect. A part the app has no rule for counts its Design Points only.
import { newId } from '../../../../core/shared/types'
import type { Sr6Character, Sr6Design, Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Part } from '../../../formats/domain/types'
import { entryLabel } from '../../../catalog/domain/categories'
import type { CreationRules } from '../../../table-setup/domain/creation'
import type { Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { cargoFactor, entryOf, priced, ratingOf } from '../creation/purchases'
import { availability, bookValue, dataFind, legality } from '../../../catalog/domain/values'
import { milspec, type MilspecSheet } from './milspec'
import { bonusValue, effectValue } from '../../../catalog/domain/effects'

export type DesignPart = 'chassis' | 'powertrain' | 'console' | 'size' | 'option' | 'modification' | 'quality'
/** A vehicledesign entry's part of a design: its table (by its category, the table's first header: `chassis type`), else
 *  a quality factor (a multiplier), an option bought in levels (per level, or a rating, or a cost × its rating), else a
 *  design modification (a flat cost). */
export function designPart(e: Sr6Entry): DesignPart {
  const cat = (e.attrs.category ?? '').toLowerCase()
  if (/\bchassis\b/.test(cat)) return 'chassis'
  if (/\bpowertrain\b/.test(cat)) return 'powertrain'
  if (/\bconsole\b/.test(cat)) return 'console'
  if (/^size class$/.test(cat)) return 'size'
  if (multiplierOf(e) !== null) return 'quality'
  if (e.attrs.perLevel === 'true' || e.attrs.rating || /\bx\s*[a-z]/i.test(e.attrs.dp ?? '')) return 'option'
  return 'modification'
}

/** A quality factor's cost multiplier (`x2`, `x0.5`; an older import's `bp="x0.5"`), else null. */
export function multiplierOf(e: Sr6Entry): number | null {
  const m = /^\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i.exec(e.attrs.multiplier ?? e.attrs.bp ?? '')
  return m ? Number(m[1]) : null
}

/** A part's Design Points at `level` (DC p. 151: `4` per level, `+10`, `-20`; a chassis, powertrain or console its BUILD
 *  POINTS, `1,000`; `2 x Armor Rating`: per level); null: not a number the app can read. */
export function partDp(e: Sr6Entry, level = 1): number | null {
  const raw = e.attrs.dp ?? e.attrs.bp ?? '0'
  if (multiplierOf(e) !== null) return 0
  // a flat part and a per-rating part (Mil-Spec Frame, DA p. 151: `10+5 x Rating`)
  const fp = /^\s*(\d+)\s*\+\s*(\d+)\s*x\s*[a-z][\w ]*$/i.exec(raw)
  if (fp) return Number(fp[1]) + Number(fp[2]) * level
  const m = /^\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*(x\s*[a-z][\w ]*)?\s*$/i.exec(raw.replace(/[–−]/g, '-'))
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  return e.attrs.perLevel === 'true' || m[2] ? v * level : v
}

/** A design's option line as its part and level: a level entry of an option the catalog lists one per level
 *  (`Improved Body 2`, the one-item-per-level rule) is its family's option at that level (× the line's), so its stat
 *  rule (by the option's name) and its Design Points per level apply. */
function optionPick(data: Sr6Data, id: string, level: number): { e: Sr6Entry; level: number } | undefined {
  const e = data.entry('vehicledesign', id)
  if (!e) return undefined
  const n = Number(e.attrs.level),
    parent = e.attrs.family ? data.family?.('vehicledesign', id)?.parent : undefined
  return parent && n >= 1 ? { e: parent, level: level * n } : { e, level }
}

/** The first number printed (`250`, `1,000`, `-2`), else 0. */
const num = (s?: string) => Number(/-?\d[\d,]*(?:\.\d+)?/.exec((s ?? '').replace(/[–−]/g, '-'))?.[0].replace(/,/g, '') ?? 0)

type Stat = 'body' | 'armor' | 'handling' | 'seats' | 'size' | 'accel' | 'interval' | 'topSpeed' | 'cargo'
/** What each level of a functional option adds (DC p. 151); Improved Size also adds half the starting Seats (below). */
const PER_LEVEL: Record<string, Partial<Record<Stat, number>>> = {
  'improved body': { body: 1 },
  'improved armor': { armor: 1 },
  'improved handling': { handling: -1 },
  'improved seating': { seats: 1 },
  'improved size': { size: 1, body: 2 },
  'improved acceleration': { accel: 5 },
  'improved speed interval': { interval: 5 },
  'improved top speed': { topSpeed: 25 },
  'improved cargo space': { cargo: 2 },
  'easily modified': {},
  // Deadly Arts' mil-spec options: their rules are milspec.ts's
  'mil spec frame': {},
  'heavy mil spec plate': {},
  'airframe ceramic plate': {},
  'mil spec hardpoints': {},
  'pop out weapon mount': {},
}
/** The stat a book word in a maximum names (`2 x Body`, `50% x Seat`, `min(3, 2 x CF)`, `Size Class 20`). */
const WORD: Record<string, Stat> = {
  body: 'body',
  armor: 'armor',
  seat: 'seats',
  seats: 'seats',
  seating: 'seats',
  cf: 'cargo',
  cargo: 'cargo',
  'size class': 'size',
  size: 'size',
}
/** Improved Handling for on-road or off-road only (DC p. 151, DESIGNER Q2): Design Points a level, the most levels. */
const ROAD_DP = 3,
  ROAD_MAX = 3
const key = (e: Sr6Entry) =>
  normName(e.name)
    .replace(/[^a-z]+/g, ' ')
    .trim()

export interface DesignStats {
  body: number
  armor: number
  /** on-road handling, and off-road when it differs (shown `5/3`) */
  handling: number
  offRoad: number
  seats: number
  size: number
  accel: number
  interval: number
  topSpeed: number
  pilot: number
  sensor: number
  /** Cargo Factors; null when the size class prints its cargo in kilograms (cargoText then) */
  cargo: number | null
  cargoText: string
}
export interface DesignSheet {
  stats: DesignStats
  /** the Design Points summed (parts, options, 2 per built-in mod slot) */
  dp: number
  /** every quality factor's multiplier multiplied together (1 with none) */
  multiplier: number
  /** the Design Point Value: dp × multiplier */
  dpv: number
  /** the built-in mods' nuyen, added after the × 1,000 (owner Q2) */
  modsNuyen: number
  /** (dpv × 1,000 + modsNuyen), halved when built yourself */
  price: number
  /** DC p. 155: `3(L)` */
  avail: string
  drone: boolean
  /** each built-in mod's slots and Design Points */
  mods: { uid: string; slots: number; dp: number; nuyen: number }[]
  /** printed specials no rule reads (the console's 10/12, the Bike's 0: owner Q4), and other notes */
  notes: string[]
  warnings: { message: string; source: string; page: number }[]
  /** Deadly Arts' mil-spec options worked out: damage reduction, Body resisting damage, armor dice, hardpoints, comms */
  milspec: MilspecSheet
}
const NO_MILSPEC: MilspecSheet = { damageReduction: 0, resistBody: 0, armorPool: 0, hardpoints: [], comms: [] }

const handlingText = (s: Pick<DesignStats, 'handling' | 'offRoad'>) => (s.handling === s.offRoad ? `${s.handling}` : `${s.handling}/${s.offRoad}`)
/** A size class table cargo cell in Cargo Factors (`4 CF`, `1/4 CF`, `10,000+ CF`), else null (`20 kg`). */
function cargoCf(s?: string): number | null {
  const m = /^\s*(\d[\d,]*)(?:\/(\d+))?\+?\s*CF\s*$/i.exec(s ?? '')
  return m ? Number(m[1].replace(/,/g, '')) / (m[2] ? Number(m[2]) : 1) : s?.trim() === '0' ? 0 : null
}
const LEGAL_ORDER = ['', 'L', 'I', 'F']

/** The always-on stat effects of the mods built in (`item:seats` +R on Increased Seating, `item:armor`, `item:body`, ...),
 *  read from the catalog entry's own <effect>s at its rating and quantity: the Designer charged a mod's price but never
 *  applied what it does. A percent, a switched or conditional one, or one that only affects others is left to the GM
 *  (a note). Handling and the speeds are read as on/off-road where printed `a/b` (handling only). */
const MOD_STAT: Record<string, 'body' | 'armor' | 'handling' | 'seats' | 'accel' | 'interval' | 'topSpeed' | 'pilot' | 'sensor'> = {
  'item:body': 'body',
  'item:armor': 'armor',
  'item:handling': 'handling',
  'item:seats': 'seats',
  'item:acceleration': 'accel',
  'item:speed-interval': 'interval',
  'item:top-speed': 'topSpeed',
  'item:pilot': 'pilot',
  'item:sensor': 'sensor',
}
function applyModEffects(stats: Record<string, number>, d: Sr6Design, data: Sr6Data, notes: string[]) {
  for (const x of d.mods) {
    const e = entryOf(x, data)
    for (const f of e?.parts ?? []) {
      const a = f.attrs,
        st = MOD_STAT[a.target ?? '']
      if (f.tag !== 'effect' || !st || a.switch || a.when || a.affects === 'others' || a.confidence === 'low' || (a.op !== 'add' && a.op !== 'set')) continue
      const parts = (a.value ?? '').split('/')
      const vs = parts.map(effectValue)
      if (!vs.length || vs.length > 2 || vs.some(v => !v) || (vs.length === 2 && st !== 'handling')) {
        notes.push(`${entryLabel(e!)}: its ${a.target} “${a.value}” isn’t a number the app can read; left to the GM.`)
        continue
      }
      const [on, off = on] = vs.map(v => bonusValue(v!, ratingOf(x, e)) * (x.qty || 1))
      if (a.op === 'set') stats[st] = on
      else {
        stats[st] += on
        if (st === 'handling') stats.offRoad += off
      }
    }
  }
}

/** A design that starts from a known catalog vehicle (`d.base`): its stats, price and Availability are the vehicle's,
 *  and the built-in mods are added on top (nuyen, slots and Availability). The from-scratch point-buy (chassis/powertrain/
 *  console, options, modifications, quality factors) does not apply here — this is "buy a vehicle and customize it". */
function baseDesignOf(d: Sr6Design, data: Sr6Data, cr: CreationRules): DesignSheet {
  const warnings: DesignSheet['warnings'] = [],
    notes: string[] = []
  const veh = data.entry('vehicles', d.base!)
  if (!veh) {
    warnings.push({ message: `The vehicle this design starts from (“${d.base}”) is no longer in the catalog.`, source: 'DC', page: 150 })
    return {
      stats: {
        body: 0,
        armor: 0,
        handling: 0,
        offRoad: 0,
        seats: 0,
        size: 0,
        accel: 0,
        interval: 0,
        topSpeed: 0,
        pilot: 0,
        sensor: 0,
        cargo: null,
        cargoText: '—',
      },
      dp: 0,
      multiplier: 1,
      dpv: 0,
      modsNuyen: 0,
      price: 0,
      avail: '—',
      drone: d.kind === 'drone',
      mods: [],
      notes,
      warnings,
      milspec: NO_MILSPEC,
    }
  }
  const a = veh.attrs
  const [onH, offH] = (a.handling ?? '0').replace(/[–−]/g, '-').split('/')
  const stats: DesignStats = {
    body: num(a.body),
    armor: num(a.armor),
    handling: num(onH),
    offRoad: offH ? num(offH) : num(onH),
    seats: num(a.seats),
    size: num(a.sizeClass ?? a.size),
    accel: num(a.accel),
    interval: num(a.interval ?? a.speedInterval),
    topSpeed: num(a.topSpeed),
    pilot: num(a.pilot),
    sensor: num(a.sensor),
    cargo: null,
    cargoText: a.cargo ?? '—',
  }
  // a powertrain swapped in (owner 2026-10-30): the vehicle's speeds scale by the new powertrain's starting values over
  // its own type's (its tuning kept in proportion, rounded down as the book's final calculations are; a difference would
  // take a slow truck below 0), the handling SPECIALs change by their difference; the new one's Design Points count as
  // a from-scratch design's do. Its own type not a table row: the new starting values, flagged.
  const swap = d.powertrain || d.customPowertrain ? powertrainOf(d, data) : undefined
  let swapDp: Sr6Entry | undefined
  if (swap) {
    const own = basePowertrain(d, data)
    const scale = (st: 'accel' | 'interval' | 'topSpeed') => {
      const was = num(own.row!.attrs[st])
      stats[st] = was ? Math.floor((stats[st] * num(swap.attrs[st])) / was) : num(swap.attrs[st])
    }
    if (own.row) (['accel', 'interval', 'topSpeed'] as const).forEach(scale)
    else {
      stats.accel = num(swap.attrs.accel)
      stats.interval = num(swap.attrs.interval)
      stats.topSpeed = num(swap.attrs.topSpeed)
      warnings.push({
        message: `${entryLabel(veh)}’s own powertrain${own.type ? ` (${own.type})` : ''} is no Double Clutch powertrain row, so ${entryLabel(swap)}’s starting values are used as they are.`,
        source: 'DC',
        page: 150,
      })
    }
    const [n, o] = [specialHandling(swap), specialHandling(own.row)]
    stats.handling += n.handling - o.handling
    stats.offRoad += n.offRoad - o.offRoad
    notes.push(`Powertrain swapped: ${own.row ? entryLabel(own.row) : (own.type ?? 'its own')} → ${entryLabel(swap)}.`)
    swapDp = swap
  }
  // options, design modifications and quality factors applied to the vehicle's already-final stats as direct deltas
  // (DESIGNER: a based vehicle is final, so the from-scratch speed-modifier recompute is NOT re-run; the GM approves the result)
  const picked = d.options.flatMap(o => {
    const p = optionPick(data, o.id, o.level)
    if (!p) warnings.push({ message: `The design part “${o.id}” is no longer in the catalog; left out.`, source: 'DC', page: 151 })
    return p && p.level ? [{ e: p.e, level: p.level, k: key(p.e), road: o.road }] : []
  })
  const has = (k: string) => picked.some(p => p.k === k)
  const drone0 = d.kind === 'drone' || /drone/i.test(a.category ?? veh.name)
  let dp = 0,
    multiplier = 1
  const addDp = (e: Sr6Entry, level = 1) => {
    const v = partDp(e, level)
    if (v === null)
      warnings.push({
        message: `${entryLabel(e)}: its Design Points “${e.attrs.dp ?? e.attrs.bp}” aren’t a number the app can read; counted 0.`,
        source: e.source,
        page: e.page || 151,
      })
    dp += v ?? 0
  }
  if (swapDp) addDp(swapDp)
  for (const { e, level, k, road } of picked) {
    const p = designPart(e)
    if (p === 'quality') {
      multiplier *= multiplierOf(e)!
      continue
    }
    addDp(e, level)
    if (p === 'modification') continue
    if (k === 'improved handling' && road) {
      if (road === 'on') stats.handling -= level
      else stats.offRoad -= level
      continue
    }
    const per = PER_LEVEL[k]
    if (!per) {
      notes.push(`${entryLabel(e)} ${level}: its Design Points count; the app has no rule for what it changes here.`)
      continue
    }
    for (const [st, v] of Object.entries(per) as [Stat, number][]) {
      if (st === 'cargo') continue
      if (st === 'handling') stats.offRoad += v * level
      ;(stats as Record<Exclude<Stat, 'cargo'>, number>)[st] += v * level
    }
    if (k === 'improved size') stats.seats += Math.max(Math.floor(stats.seats * 0.5 * level), drone0 ? -Infinity : 0)
  }
  if (has('heavy duty')) stats.body = Math.floor(stats.body * 1.5)
  if (has('lightweight')) stats.body = Math.floor(stats.body * 0.5)
  if (has('mass transit')) stats.seats *= 3
  if (has('cargo hauler')) stats.seats = Math.max(2, Math.floor(stats.seats / 2))
  if (has('off road chassis')) {
    stats.handling += 1
    stats.offRoad -= 1
    stats.topSpeed -= 10
  }
  for (const [ek, ac, tp] of [
    ['high performance', 3, 50],
    ['racing', 6, 100],
    ['economy engines', -3, -50],
  ] as [string, number, number][])
    if (has(ek)) {
      stats.accel += ac
      stats.topSpeed += tp
    }
  if (has('multi engine')) {
    stats.accel *= 2
    stats.topSpeed *= 2
  }
  if (has('underpowered')) stats.topSpeed = Math.floor(stats.topSpeed / 2)
  applyModEffects(stats, d, data, notes)
  const ms = milspec(d, picked, stats, num(a.body), data, (message, page, source = 'DC') => warnings.push({ message, source, page }), notes)
  dp += ms.dp
  // the mods built in: their real slots and nuyen (no Design-Point conversion — this is not a point-buy)
  const find = dataFind(data)
  const mods = d.mods.map(x => {
    const e = entryOf(x, data),
      v = e ? bookValue(e, 'slots', ratingOf(x, e), find) : { ok: true, n: x.slots ?? 0 } // (no entry: a custom mod's own slots)
    if (!v.ok)
      warnings.push({
        message: `${e ? entryLabel(e) : 'A mod'}: its mod slots “${e?.attrs.slots ?? ''}” aren’t a number the app can read; counted 0.`,
        source: 'DC',
        page: 151,
      })
    return { uid: x.uid, slots: v.ok ? (v.n ?? 0) : 0, dp: 0, nuyen: priced({ ...x, diy: undefined }, data, cr).cost }
  })
  const modsNuyen = mods.reduce((t, m) => t + m.nuyen, 0)
  const full = Math.floor((num(a.cost) + modsNuyen) * multiplier)
  const price = d.diy ? Math.floor(full / 2) : full
  // Availability: the vehicle's, raised by any mod's
  let base = availability(a.avail, undefined).n ?? 0,
    legal = legality(a.avail) ?? ''
  for (const x of d.mods) {
    const e = entryOf(x, data),
      av = e ? availability(e.attrs.avail, ratingOf(x, e)) : { ok: true, n: x.avail ?? 0 }
    if (av.ok && (av.n ?? 0) > base) base = av.n!
    const l = legality(e?.attrs.avail) ?? ''
    if (LEGAL_ORDER.indexOf(l) > LEGAL_ORDER.indexOf(legal)) legal = l
  }
  notes.push(`Based on ${entryLabel(veh)} (${veh.source} p. ${veh.page}); its stats, price and Availability, plus the options, modifications and mods below.`)
  return {
    stats,
    dp,
    multiplier,
    dpv: 0,
    modsNuyen,
    price,
    avail: `${base}${legal ? `(${legal})` : ''}`,
    drone: d.kind === 'drone' || /drone/i.test(a.category ?? veh.name),
    mods,
    notes,
    warnings,
    milspec: ms.sheet,
  }
}

/** A starting vehicle's powertrain (owner 2026-10-30): its factory part in the powertrain hook (the importer's
 *  `<book>.powertrain-<type>`) and the Double Clutch powertrain row of that type (`propeller-water` is “Propeller
 *  (Water)”); `row` undefined when the type names no row (flagged, never guessed). */
export function basePowertrain(d: Sr6Design, data: Sr6Data): { parts: Sr6Part[]; type?: string; row?: Sr6Entry } {
  const veh = d.base ? data.entry('vehicles', d.base) : undefined
  const parts = (veh?.parts ?? []).filter(p => p.tag === 'part' && p.attrs.hook === 'vehicle-powertrain')
  const ref = parts.map(p => p.attrs.ref ?? '').find(r => /\.powertrain-[a-z0-9-]+$/.test(r))
  // (the part's own name less “Powertrain” is the table's row: `Propeller (Water) Powertrain`)
  const type = ref ? (data.entry('gear', ref)?.name ?? '').replace(/\s*powertrain\s*$/i, '').trim() : undefined
  const hit = type ? data.named?.(type, 'vehicledesign') : undefined
  const row = hit && designPart(hit) === 'powertrain' ? hit : undefined
  return { parts, ...(type ? { type } : {}), ...(row ? { row } : {}) }
}

/** A powertrain table's SPECIAL handling changes (`–2 handling`, `–2 to off road handling`). */
function specialHandling(e?: Sr6Entry): { handling: number; offRoad: number } {
  const sp = (e?.attrs.special ?? '').replace(/[–−]/g, '-').trim()
  let m: RegExpExecArray | null
  if ((m = /^([+-]\d+)\s+to\s+off[\s-]?road\s+handling$/i.exec(sp))) return { handling: 0, offRoad: Number(m[1]) }
  if ((m = /^([+-]\d+)\s+handling$/i.exec(sp))) return { handling: Number(m[1]), offRoad: Number(m[1]) }
  return { handling: 0, offRoad: 0 }
}

/** A design's chassis row: the custom one (a GM/house chassis typed into the Designer, shaped like a catalog row) else the catalog's. */
export function chassisOf(d: Sr6Design, data: Sr6Data): Sr6Entry | undefined {
  return customOr(d.customChassis, d.chassis, 'chassis', 'Chassis type', data)
}

/** A design's powertrain row: the custom one, else the catalog's (as chassisOf). */
export function powertrainOf(d: Sr6Design, data: Sr6Data): Sr6Entry | undefined {
  return customOr(d.customPowertrain, d.powertrain, 'powertrain', 'Powertrain', data)
}

function customOr(c: { name: string } | undefined, id: string | undefined, what: string, category: string, data: Sr6Data): Sr6Entry | undefined {
  if (!c) return id ? data.entry('vehicledesign', id) : undefined
  const { name, ...a } = c
  return {
    id: `custom-${what}`,
    kind: 'vehicledesign',
    name,
    source: 'Custom',
    page: 0,
    parts: [],
    text: '',
    attrs: { category, ...Object.fromEntries(Object.entries(a).map(([k, v]) => [k, String(v)])) },
  }
}

/** The design worked out: its stats (DC p. 154's final calculations, rounded down), Design Points, price (owner Q1, Q2,
 *  Q6) and Availability (p. 155), notes and warnings. */
export function designOf(d: Sr6Design, data: Sr6Data, cr: CreationRules): DesignSheet {
  if (d.base) return baseDesignOf(d, data, cr)
  const warnings: DesignSheet['warnings'] = [],
    notes: string[] = []
  const warn = (message: string, page: number, source = 'DC') => warnings.push({ message, source, page })
  const part = (id?: string) => (id ? data.entry('vehicledesign', id) : undefined)
  const chassis = chassisOf(d, data),
    powertrain = powertrainOf(d, data),
    console = part(d.console)
  const picked = d.options.flatMap(o => {
    const p = optionPick(data, o.id, o.level)
    if (!p) warn(`The design part “${o.id}” is no longer in the catalog; left out.`, 151)
    return p && p.level ? [{ e: p.e, level: p.level, k: key(p.e), road: o.road }] : []
  })
  const has = (k: string) => picked.some(p => p.k === k)
  let dp = 0
  const addDp = (e: Sr6Entry | undefined, level = 1) => {
    if (!e) return
    const v = partDp(e, level)
    if (v === null)
      warn(`${entryLabel(e)}: its Design Points “${e.attrs.dp ?? e.attrs.bp}” aren’t a number the app can read; counted 0.`, e.page || 151, e.source)
    dp += v ?? 0
  }
  for (const [e, what] of [
    [chassis, 'chassis'],
    [powertrain, 'powertrain'],
    [console, 'console'],
  ] as const)
    if (e) addDp(e)
    else warn(`No ${what} picked yet.`, 150)

  // the starting values (p. 150): the chassis's Body, Armor, Handling, Seats and Size Class, the powertrain's
  // Acceleration, Speed Interval and Top Speed, the console's Pilot and Sensor
  const base = {
    body: num(chassis?.attrs.body),
    armor: num(chassis?.attrs.armor),
    handling: num(chassis?.attrs.handling),
    seats: num(chassis?.attrs.seats),
    size: num(chassis?.attrs.sizeClass),
    accel: num(powertrain?.attrs.accel),
    interval: num(powertrain?.attrs.interval),
    topSpeed: num(powertrain?.attrs.topSpeed),
  }
  // the size class table's row (`Size Class 6`): its cargo
  const sizeCargo = (size: number) => data.named?.(`Size Class ${size}`, 'vehicledesign')
  // a custom chassis's Cargo Factors (owner 2026-10-30): typed in, else by its seats as Commlink6 and the bought vehicles
  // work it (cargoFactor; bike and truck by its name), else on request the size class table's (Double Clutch)
  const cc = d.customChassis
  const customCf =
    !cc || cc.cargoFrom === 'size'
      ? null
      : (cc.cargo ??
        (chassis && cargoFactor({ seatsRemoved: 0 } as Sr6Purchase, { ...chassis, attrs: { ...chassis.attrs, category: chassis.name } })?.cargo) ??
        0)
  const rowCfOf = (size: number) => (cc?.cargo !== undefined ? cc.cargo : (customCf ?? cargoCf(sizeCargo(size)?.attrs.cargo)))
  const baseCargo = rowCfOf(base.size)
  const s = { ...base, offRoad: base.handling, cargo: 0 }
  const drone = d.kind === 'drone' || /drone/i.test(chassis?.name ?? '')
  // each table's SPECIAL column: a handling change, an off-road one, extra cargo and the walker's "No Top Speed loss" are
  // rules; anything else (the console's 10/12, the Bike's 0) is shown as printed (owner Q4)
  let walker = false
  for (const e of [chassis, powertrain, console]) {
    const sp = (e?.attrs.special ?? '').replace(/[–−]/g, '-').trim()
    if (!e || !sp || sp === '-') continue
    let m: RegExpExecArray | null
    if ((m = /^([+-]\d+)\s+to\s+off[\s-]?road\s+handling$/i.exec(sp))) s.offRoad += Number(m[1])
    else if ((m = /^([+-]\d+)\s+handling$/i.exec(sp))) {
      s.handling += Number(m[1])
      s.offRoad += Number(m[1])
    } else if ((m = /extra cargo\s*\(\+?(\d+)\s*CF\)/i.exec(sp))) s.cargo += Number(m[1])
    else if (/no top speed loss/i.test(sp)) walker = true
    else notes.push(`${entryLabel(e)}: special ${sp} (as printed; no rule here reads it).`)
  }
  // the starting Cargo Factors an option's maximum reads: the size class's and a table's extra (the Truck's +4, DESIGNER Q7)
  const startCargo = baseCargo === null ? null : baseCargo + s.cargo
  // the functional options, per level (p. 151)
  let universal = 0
  for (const { e, level, k, road } of picked) {
    if (designPart(e) !== 'option') continue
    // Improved Handling on-road or off-road only: 3 Design Points a level, that value only (p. 151, DESIGNER Q2)
    if (k === 'improved handling' && road) {
      dp += ROAD_DP * level
      if (road === 'on') s.handling -= level
      else s.offRoad -= level
      continue
    }
    addDp(e, level)
    const per = PER_LEVEL[k]
    if (!per) {
      notes.push(`${entryLabel(e)} ${level}: its Design Points count; the app has no rule for what it changes.`)
      continue
    }
    for (const [st, v] of Object.entries(per) as [Stat, number][]) {
      if (st === 'handling') s.offRoad += v * level
      s[st] += v * level
    }
    // and Seat by 50 percent a level; a vehicle keeps a seat (DESIGNER Q5; a drone has none to keep)
    if (k === 'improved size') s.seats += Math.max(Math.floor(base.seats * 0.5 * level), drone ? -Infinity : Math.min(0, 1 - base.seats))
    if (k === 'easily modified') universal += 2 * level
  }
  // the design modifications (pp. 152-153) and quality factors (pp. 153-154)
  let multiplier = 1
  for (const { e, level } of picked) {
    const p = designPart(e)
    if (p === 'quality') multiplier *= multiplierOf(e)!
    else if (p === 'modification') addDp(e, level)
  }
  const hauler = has('cargo hauler')
  if (has('heavy duty')) s.body = Math.floor(s.body * 1.5)
  if (has('lightweight')) s.body = Math.floor(s.body * 0.5)
  if (has('mass transit')) s.seats *= 3
  if (hauler) s.seats = Math.max(2, Math.floor(s.seats / 2))
  if (has('off road chassis')) {
    s.handling += 1
    s.offRoad -= 1
  }
  // the final calculations (p. 154), rounded down: the speed modifier (Body / 2) + Armor, half the Armor with Integrated
  // Armor or as a Cargo Hauler; Acceleration loses half of it, Top Speed ten times it ("from the Powertrain's base Top
  // Speed", owner Q3), a walker none
  const sm = Math.floor(s.body / 2 + (hauler || has('integrated armor') ? s.armor / 2 : s.armor))
  s.accel = Math.floor(base.accel - sm / 2) + (s.accel - base.accel)
  s.topSpeed = (walker ? base.topSpeed : base.topSpeed - 10 * sm) + (s.topSpeed - base.topSpeed)
  // engines (p. 152; a Cargo Hauler only half the High Performance bonus) and the off-road chassis's Top Speed
  const engine: [string, number, number][] = [
    ['high performance', hauler ? 1 : 3, hauler ? 25 : 50],
    ['racing', 6, 100],
    ['economy engines', -3, -50],
  ]
  for (const [k, a, t] of engine)
    if (has(k)) {
      s.accel += a
      s.topSpeed += t
    }
  if (has('off road chassis')) s.topSpeed -= 10
  // drones by size: small × 0.75, mini × 0.5, micro × 0.25 Acceleration
  const size = /\b(micro|mini|small)\b/i.exec(chassis?.name ?? '')?.[1].toLowerCase()
  if (drone && size) s.accel = Math.floor(s.accel * { small: 0.75, mini: 0.5, micro: 0.25 }[size as 'small'])
  // Multi-Engine doubles the final Acceleration and Top Speed (a Cargo Hauler half the bonus); Underpowered halves the
  // final speed (read as Top Speed)
  if (has('multi engine')) {
    const f = hauler ? 1.5 : 2
    s.accel = Math.floor(s.accel * f)
    s.topSpeed = Math.floor(s.topSpeed * f)
  }
  if (has('underpowered')) s.topSpeed = Math.floor(s.topSpeed / 2)
  applyModEffects(s, d, data, notes)
  const ms = milspec(d, picked, s, base.body, data, warn, notes)
  dp += ms.dp

  // cargo: the size class's, plus the options' and the truck's Cargo Factors, doubled for a Cargo Hauler
  const cargoRow = sizeCargo(s.size)
  const rowCf = rowCfOf(s.size)
  const cargo = rowCf === null ? null : (rowCf + s.cargo) * (hauler ? 2 : 1)
  const extra = s.cargo * (hauler ? 2 : 1)
  const cargoText =
    cargo !== null ? `${round2(cargo)} CF` : `${cargoRow?.attrs.cargo ?? '—'}${extra ? ` + ${extra} CF` : ''}${hauler && extra === 0 ? ' (doubled)' : ''}`

  // the mods built in as design options: 2 Design Points per mod slot, their nuyen added after the × 1,000 (owner Q2)
  const find = dataFind(data)
  const mods = d.mods.map(x => {
    const e = entryOf(x, data),
      v = e ? bookValue(e, 'slots', ratingOf(x, e), find) : { ok: true, n: x.slots ?? 0 } // (no entry: a custom mod's own slots)
    if (!v.ok) warn(`${e ? entryLabel(e) : 'A mod'}: its mod slots “${e?.attrs.slots ?? ''}” aren’t a number the app can read; counted 0.`, 151)
    const slots = v.ok ? (v.n ?? 0) : 0
    return { uid: x.uid, slots, dp: 2 * slots, nuyen: priced({ ...x, diy: undefined }, data, cr).cost }
  })
  dp += mods.reduce((t, m) => t + m.dp, 0)
  const modsNuyen = mods.reduce((t, m) => t + m.nuyen, 0)
  const dpv = dp * multiplier
  const full = Math.floor(dpv * 1000) + modsNuyen
  // built yourself: half the price (p. 155; the tests are the GM's)
  const price = d.diy ? Math.floor(full / 2) : full

  // Availability (p. 155): 2, +1 Luxury, +1 an aircraft, +1(L) Security, +2(I) Military; a mod's when higher
  let a = 2,
    legal = ''
  const raise = (l: string) => (LEGAL_ORDER.indexOf(l) > LEGAL_ORDER.indexOf(legal) ? l : legal)
  if (has('luxury')) a += 1
  if (/fixed wing|rotorcraft|vtol|vstol|\blta\b/i.test(chassis?.name ?? '') || /\(air\)|\brotor\b|vectored thrust|\bglide\b/i.test(powertrain?.name ?? ''))
    a += 1
  if (has('security')) {
    a += 1
    legal = raise('L')
  }
  if (has('military')) {
    a += 2
    legal = raise('I')
  }
  for (const x of d.mods) {
    const e = entryOf(x, data),
      v = e ? availability(e.attrs.avail, ratingOf(x, e)) : { ok: true, n: x.avail ?? 0 }
    if (v.ok && (v.n ?? 0) > a) a = v.n!
    legal = raise(legality(e?.attrs.avail) ?? '')
  }

  // maximums (pp. 151-154), each a warning
  const final = { ...s, cargo: cargo ?? s.cargo }
  for (const { e, level, k, road } of picked) {
    const p = designPart(e)
    const problems =
      k === 'improved handling' && road
        ? Math.abs(level) > ROAD_MAX
          ? [`at most ${ROAD_MAX} levels ${road}-road only.`]
          : []
        : maxProblems(e, level, base, final, startCargo)
    if (p === 'option') for (const m of problems) warn(`${entryLabel(e)} ${level}: ${m}`, e.page || 151, e.source)
    if (p === 'quality' && key(e) === 'superstructure' && s.size < 15)
      warn(`${entryLabel(e)}: the vehicle must be at least Size Class 15 (it is ${s.size}).`, e.page || 154, e.source)
  }
  for (const [st, label] of [
    ['body', 'Body'],
    ['armor', 'Armor'],
    ['seats', 'Seats'],
    ['accel', 'Acceleration'],
    ['interval', 'Speed Interval'],
    ['topSpeed', 'Top Speed'],
  ] as const)
    if (s[st] < 0) warn(`${label} works out below 0 (${s[st]}).`, 154)
  if (universal) notes.push(`Easily Modified: ${universal} universal mod slots.`)

  return {
    stats: {
      body: s.body,
      armor: s.armor,
      handling: s.handling,
      offRoad: s.offRoad,
      seats: s.seats,
      size: s.size,
      accel: s.accel,
      interval: s.interval,
      topSpeed: s.topSpeed,
      pilot: num(console?.attrs.pilot),
      sensor: num(console?.attrs.sensor),
      cargo,
      cargoText,
    },
    dp,
    multiplier,
    dpv,
    modsNuyen,
    price,
    avail: `${a}${legal ? `(${legal})` : ''}`,
    drone,
    mods,
    notes,
    warnings,
    milspec: ms.sheet,
  }
}
const round2 = (x: number) => Math.round(x * 100) / 100

/** An option's printed maximum (DC p. 151) read against the design, in the book's words; what it passes, as sentences:
 *  - `4`: at most 4 levels (and 4 in reverse, unless maxReverse says otherwise);
 *  - `Size Class 20`: the resulting Size Class at most 20;
 *  - `2 x Body`: the option's own stat at most twice the final Body ("new Armor value cannot be higher than twice the
 *    vehicle's Body"); its own stat named (`2 x CF`): at most twice its starting value;
 *  - `50% x Seat`: the increase at most half the starting Seats;
 *  - `Body` alone (`min(4, Body)`): at most the starting Body in levels;
 *  - `min(a, b)`: both. */
export function maxProblems(
  e: Sr6Entry,
  level: number,
  start: Partial<Record<Stat, number>>,
  final: Partial<Record<Stat, number>>,
  startCargo: number | null = null,
): string[] {
  const own = (Object.keys(PER_LEVEL[key(e)] ?? {})[0] as Stat | undefined) ?? undefined
  const raw = (e.attrs.max ?? '').trim()
  const out: string[] = []
  // (a size class printing its cargo in kilograms: Cargo Factors not checked)
  const startOf = (st: Stat) => (st === 'cargo' ? (startCargo ?? NaN) : (start[st] ?? 0))
  const terms = /^min\((.*)\)$/i.exec(raw)?.[1].split(',') ?? (raw ? [raw] : [])
  let levels: number | null = null
  for (const t0 of terms) {
    const t = t0.trim()
    let m: RegExpExecArray | null
    if ((m = /^(\d+)$/.exec(t))) levels = Math.min(levels ?? Infinity, Number(m[1]))
    else if ((m = /^size class (\d+)$/i.exec(t))) {
      if ((final.size ?? 0) > Number(m[1])) out.push(`the Size Class may not go past ${m[1]} (it is ${final.size}).`)
    } else if ((m = /^(\d+(?:\.\d+)?)\s*%\s*x\s*([a-z ]+)$/i.exec(t)) && WORD[m[2].toLowerCase()]) {
      const cap = Math.floor((Number(m[1]) / 100) * startOf(WORD[m[2].toLowerCase()]))
      if (level > cap) out.push(`at most ${m[1]}% of the starting ${m[2]} (${cap} levels).`)
    } else if ((m = /^(?:(\d+(?:\.\d+)?)\s*x\s*)?([a-z ]+)$/i.exec(t)) && WORD[m[2].toLowerCase()]) {
      const st = WORD[m[2].toLowerCase()]
      if (!m[1]) {
        levels = Math.min(levels ?? Infinity, startOf(st))
        continue
      }
      // twice another stat (its final value), or twice its own starting value
      const cap = Number(m[1]) * (st === own ? startOf(st) : (final[st] ?? 0))
      const now = own ? (final[own] ?? 0) : level
      if (now > cap) out.push(`at most ${m[1]} × ${st === own ? 'the starting' : 'the'} ${m[2]} (${cap}; it is ${now}).`)
    } else if (t) out.push(`its maximum “${raw}” isn’t one the app can read; not checked.`)
  }
  if (levels !== null && level > levels) out.push(`at most ${levels} level${levels === 1 ? '' : 's'}.`)
  // in reverse: as far as maxReverse says, else as far as the maximum (p. 151: "unless stated otherwise")
  const back = e.attrs.maxReverse !== undefined ? Number(e.attrs.maxReverse) : levels
  if (level < 0 && back !== null && Number.isFinite(back) && -level > back) out.push(`at most ${back} level${back === 1 ? '' : 's'} in reverse.`)
  return out
}

/** The vehicle or drone line a runner buys from `doc` (a design): the design worked out as its snapshot (its stats, price
 *  as cost, Availability, dp, and approved when a GM made or approved it), the mods built in as its <builtin>s (already
 *  paid for: fittings of the vehicle, a mount holding a weapon, vehiclemods.ts), Easily Modified's universal slots too.
 *  Later edits to the design never change it. */
export function boughtDesign(doc: Sr6Character, data: Sr6Data, cr: CreationRules, uid = newId()): Sr6Purchase {
  const d = doc.design!,
    sheet = designOf(d, data, cr),
    st = sheet.stats
  const name = doc.identity.streetName || doc.identity.name || 'Custom design'
  // a based design keeps the starting vehicle's own category/name; a from-scratch one reads its chassis
  const baseVeh = d.base ? data.entry('vehicles', d.base) : undefined
  const chassis = chassisOf(d, data)
  const size = /\b(micro|mini|small|medium|large)\b/i.exec(`${baseVeh?.attrs.category ?? ''} ${chassis?.name ?? ''}`)?.[1]
  const parts: Sr6Part[] = d.mods.map(x => {
    const e = entryOf(x, data)
    return {
      tag: 'builtin',
      attrs: { name: e ? entryLabel(e) : (x.name ?? 'Custom mod'), ...(e ? { ref: e.id } : {}), ...(x.rating ? { rating: String(x.rating) } : {}) },
      text: '',
    }
  })
  // a based design keeps the starting vehicle's factory parts, less those taken off it (the Designer); a part's children go with it
  if (baseVeh) {
    const gone = new Set(d.removedParts ?? []),
      all = baseVeh.parts.filter(p => p.tag === 'part'),
      off = (p: Sr6Part, depth = 0): boolean =>
        gone.has(p.attrs.id) || (depth < 20 && !!p.attrs.parent && (a => !!a && off(a, depth + 1))(all.find(q => q.attrs.id === p.attrs.parent)))
    parts.push(...all.filter(p => !off(p)))
    // a powertrain swapped in: built in, as the book's powertrain part of its type where there is one
    const swap = d.powertrain || d.customPowertrain ? powertrainOf(d, data) : undefined
    if (swap) {
      const book = (basePowertrain(d, data).parts[0]?.attrs.ref ?? '').split('.')[0]
      const ref = `${book}.powertrain-${swap.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`
      const pe = book ? data.entry('gear', ref) : undefined
      parts.push({ tag: 'builtin', attrs: { name: pe ? entryLabel(pe) : `${swap.name} Powertrain`, ...(pe ? { ref: pe.id } : {}) }, text: '' })
    }
  }
  // Mil-spec Comms' in-console commlink and the hardpoints' weapons, built in
  for (const c of sheet.milspec.comms)
    parts.push({ tag: 'builtin', attrs: { name: c.entry ? entryLabel(c.entry) : c.name, ...(c.entry ? { ref: c.entry.id } : {}) }, text: '' })
  for (const h of d.hardpoints ?? []) {
    const w = h.weapon ? data.entry('weapons', h.weapon) : undefined
    if (w) parts.push({ tag: 'builtin', attrs: { name: entryLabel(w), ref: w.id }, text: '' })
  }
  const universal = d.options.reduce((t, o) => t + (o.level > 0 && /easily modified/i.test(data.entry('vehicledesign', o.id)?.name ?? '') ? 2 * o.level : 0), 0)
  if (universal) parts.push({ tag: 'builtin', attrs: { name: 'Easily Modified', slots: String(universal), category: 'universal' }, text: '' })
  const id = `design.${doc.id}`
  return {
    uid,
    kind: 'vehicles',
    id,
    name,
    qty: 1,
    accessories: [],
    design: doc.id,
    snapshot: {
      id,
      kind: 'vehicles',
      name,
      source: 'DC',
      page: 150,
      text: '',
      parts,
      attrs: {
        category: sheet.drone
          ? `${size ? `${size[0].toUpperCase()}${size.slice(1).toLowerCase()} ` : ''}drone`
          : (baseVeh?.attrs.category ?? chassis?.name ?? 'Designed vehicle'),
        handling: handlingText(st),
        accel: String(st.accel),
        interval: String(st.interval),
        topSpeed: String(st.topSpeed),
        body: String(st.body),
        armor: String(st.armor),
        pilot: String(st.pilot),
        sensor: String(st.sensor),
        seats: String(st.seats),
        avail: sheet.avail,
        cost: String(sheet.price),
        dp: String(sheet.dpv),
        ...(d.approved ? { approved: 'true' } : {}),
      },
    },
  }
}

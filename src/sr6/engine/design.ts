// A vehicle or drone design (Double Clutch "Build Your Dream", pp. 150-155; owner 2026-10-16, BUILDER Q1-Q4, Q6, Q8): the
// catalog's vehicledesign parts (a chassis, a powertrain and a console from their tables, the size class table, the
// options, design modifications and quality factors, each with its printed terms: docs/sr6-data-format.md), worked out
// into the vehicle's stats, its Design Point Value, price and Availability. Where the book's tables and formulas and its
// worked examples disagree, the tables and formulas (owner Q3). A maximum passed is a warning, never refused.
//
// The numbers each option and modification changes are the book's rules (pp. 151-153), by the part's name: the catalog
// keeps each part's cost and maximum, not its effect. A part the app has no rule for counts its Design Points only.
import { newId } from '../../model/types'
import type { Sr6Character, Sr6Design, Sr6Purchase } from '../model/character'
import type { Sr6Entry, Sr6Part } from '../model/types'
import { entryLabel } from './categories'
import type { CreationRules } from './creation'
import type { Sr6Data } from './data'
import { normName } from './names'
import { entryOf, priced, ratingOf } from './purchases'
import { availability, bookValue, dataFind, legality } from './values'

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
  const m = /^\s*([+-]?\d[\d,]*(?:\.\d+)?)\s*(x\s*[a-z][\w ]*)?\s*$/i.exec(raw.replace(/[–−]/g, '-'))
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  return e.attrs.perLevel === 'true' || m[2] ? v * level : v
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
}

const handlingText = (s: Pick<DesignStats, 'handling' | 'offRoad'>) => (s.handling === s.offRoad ? `${s.handling}` : `${s.handling}/${s.offRoad}`)
/** A size class table cargo cell in Cargo Factors (`4 CF`, `1/4 CF`, `10,000+ CF`), else null (`20 kg`). */
function cargoCf(s?: string): number | null {
  const m = /^\s*(\d[\d,]*)(?:\/(\d+))?\+?\s*CF\s*$/i.exec(s ?? '')
  return m ? Number(m[1].replace(/,/g, '')) / (m[2] ? Number(m[2]) : 1) : s?.trim() === '0' ? 0 : null
}
const LEGAL_ORDER = ['', 'L', 'I', 'F']

/** The design worked out: its stats (DC p. 154's final calculations, rounded down), Design Points, price (owner Q1, Q2,
 *  Q6) and Availability (p. 155), notes and warnings. */
export function designOf(d: Sr6Design, data: Sr6Data, cr: CreationRules): DesignSheet {
  const warnings: DesignSheet['warnings'] = [],
    notes: string[] = []
  const warn = (message: string, page: number, source = 'DC') => warnings.push({ message, source, page })
  const part = (id?: string) => (id ? data.entry('vehicledesign', id) : undefined)
  const chassis = part(d.chassis),
    powertrain = part(d.powertrain),
    console = part(d.console)
  const picked = d.options.flatMap(o => {
    const e = part(o.id)
    if (!e) warn(`The design part “${o.id}” is no longer in the catalog; left out.`, 151)
    return e && o.level ? [{ e, level: o.level, k: key(e) }] : []
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
  const baseCargo = cargoCf(sizeCargo(base.size)?.attrs.cargo)
  const s = { ...base, offRoad: base.handling, cargo: 0 }
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
  // the functional options, per level (p. 151)
  let universal = 0
  for (const { e, level, k } of picked) {
    if (designPart(e) !== 'option') continue
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
    if (k === 'improved size') s.seats += Math.floor(base.seats * 0.5 * level) // and Seat by 50 percent a level
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
  const drone = d.kind === 'drone' || /drone/i.test(chassis?.name ?? '')
  if (drone && size) s.accel = Math.floor(s.accel * { small: 0.75, mini: 0.5, micro: 0.25 }[size as 'small'])
  // Multi-Engine doubles the final Acceleration and Top Speed (a Cargo Hauler half the bonus); Underpowered halves the
  // final speed (read as Top Speed)
  if (has('multi engine')) {
    const f = hauler ? 1.5 : 2
    s.accel = Math.floor(s.accel * f)
    s.topSpeed = Math.floor(s.topSpeed * f)
  }
  if (has('underpowered')) s.topSpeed = Math.floor(s.topSpeed / 2)

  // cargo: the size class's, plus the options' and the truck's Cargo Factors, doubled for a Cargo Hauler
  const cargoRow = sizeCargo(s.size)
  const rowCf = cargoCf(cargoRow?.attrs.cargo)
  const cargo = rowCf === null ? null : (rowCf + s.cargo) * (hauler ? 2 : 1)
  const extra = s.cargo * (hauler ? 2 : 1)
  const cargoText =
    cargo !== null ? `${round2(cargo)} CF` : `${cargoRow?.attrs.cargo ?? '—'}${extra ? ` + ${extra} CF` : ''}${hauler && extra === 0 ? ' (doubled)' : ''}`

  // the mods built in as design options: 2 Design Points per mod slot, their nuyen added after the × 1,000 (owner Q2)
  const find = dataFind(data)
  const mods = d.mods.map(x => {
    const e = entryOf(x, data),
      v = bookValue(e, 'slots', ratingOf(x, e), find)
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
      v = availability(e?.attrs.avail, ratingOf(x, e))
    if (v.ok && (v.n ?? 0) > a) a = v.n!
    legal = raise(legality(e?.attrs.avail) ?? '')
  }

  // maximums (pp. 151-154), each a warning
  const final = { ...s, cargo: cargo ?? s.cargo }
  for (const { e, level } of picked) {
    const p = designPart(e)
    if (p === 'option') for (const m of maxProblems(e, level, base, final, baseCargo)) warn(`${entryLabel(e)} ${level}: ${m}`, e.page || 151, e.source)
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
 *  paid for), Easily Modified's universal slots too. Later edits to the design never change it. */
export function boughtDesign(doc: Sr6Character, data: Sr6Data, cr: CreationRules, uid = newId()): Sr6Purchase {
  const d = doc.design!,
    sheet = designOf(d, data, cr),
    st = sheet.stats
  const name = doc.identity.streetName || doc.identity.name || 'Custom design'
  const chassis = d.chassis ? data.entry('vehicledesign', d.chassis) : undefined
  const size = /\b(micro|mini|small|medium|large)\b/i.exec(chassis?.name ?? '')?.[1]
  const parts: Sr6Part[] = d.mods.map(x => {
    const e = entryOf(x, data)
    return {
      tag: 'builtin',
      attrs: { name: e ? entryLabel(e) : (x.name ?? 'Custom mod'), ...(e ? { ref: e.id } : {}), ...(x.rating ? { rating: String(x.rating) } : {}) },
      text: '',
    }
  })
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
        category: sheet.drone ? `${size ? `${size[0].toUpperCase()}${size.slice(1).toLowerCase()} ` : ''}drone` : (chassis?.name ?? 'Designed vehicle'),
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

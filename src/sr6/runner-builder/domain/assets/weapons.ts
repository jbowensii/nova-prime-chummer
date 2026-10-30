// A weapon line's own stats as fitted (owner ruling, weapon-cyber-builders): what its accessories and factory parts do to
// its Attack Ratings per range band, Damage Value, firing modes, ammo, the Attack Rating penalty of each firing mode
// (recoil), concealability and the attack's dice pool. The catalog prints a weapon's stats WITH its standard equipment
// (CRB p. 261: "in weapons with a laser sight included as standard equipment, this bonus is already calculated into the
// Attack Rating"), so a factory part the player has not removed adds only its switched (wireless, conditional) effects,
// and a removed one takes its always-on effects back off. Each value comes twice: `now` (the always-on effects, plus the
// switched ones the player turned on: the accessory's `sit`, keyed by sitKey) and `on` (every switched one too: the
// bracketed total, owner decision 2026-10-10).
import type { Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Part } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { effectValue, ownParts, sitOf } from '../../../catalog/domain/effects'
import { attackRatings } from '../../../catalog/domain/values'
import { counts } from '../../../../core/shared/effects'
import { entryOf, ratingOf } from '../creation/purchases'
import { partsOf } from './vehiclemods'

export type FireMode = 'SA' | 'BF' | 'FA'
/** CRB p. 110: Semi-Automatic -2, Burst Fire (narrow) -4, Full-Auto -6 to the Attack Rating. */
export const MODE_AR: Record<FireMode, number> = { SA: -2, BF: -4, FA: -6 }
const MODES: FireMode[] = ['SA', 'BF', 'FA']

export interface WeaponStats {
  ar: (number | null)[]
  /** as printed, `4P`; with its number changed */
  dv: string
  /** `SA/BF` */
  modes: string
  /** `15(c)`: the leading round count changed */
  ammo: string
  /** the Attack Rating adjustment of each firing mode the weapon has (CRB p. 110, less what reduces it) */
  recoil: Partial<Record<FireMode, number>>
  /** what the weapon's fittings move its Concealability threshold by */
  concealability: number
  /** dice the fittings add to its attack tests (a smartgun system's wireless +1, CRB p. 261) */
  pool: number
}
export interface WeaponOf {
  base: WeaponStats
  now: WeaponStats
  on: WeaponStats
  /** the fittings that change a number, `Laser sight` */
  from: string[]
}

type Src = { e: Sr6Entry; rating: number; sit?: Sr6Purchase['sit']; sign: 1 | -1; switchedOnly?: true }
type Fx = { target: string; op: string; value: string; switch?: string; when?: string }

const BAND = /^\s*(-?\d+|x)\s*(,\s*(-?\d+|x)\s*){4}$/i
const num = (v: string, rating: number) => {
  const r = effectValue(v)
  return r
    ? r.byRating?.length
      ? r.byRating[Math.min(Math.max(1, rating), r.byRating.length) - 1]
      : r.perRating
        ? rating * r.value - (r.minus ?? 0)
        : r.value
    : 0
}
const lead = (s: string) => /^\s*(\d+)/.exec(s)?.[1]
const swap = (s: string, n: number) => s.replace(/^\s*\d+/, String(Math.max(0, n)))

/** The stats a weapon's catalog entry prints (no fittings). */
function baseOf(e: Sr6Entry | undefined): WeaponStats {
  const a = e?.attrs ?? {},
    modes = a.modes ?? ''
  const recoil: WeaponStats['recoil'] = {}
  for (const m of MODES) if (new RegExp(`\\b${m}\\b`).test(modes)) recoil[m] = MODE_AR[m]
  return { ar: attackRatings(a.ar).bands, dv: a.dv ?? '', modes, ammo: a.ammo ?? '', recoil, concealability: 0, pool: 0 }
}

/** The weapon effects of an entry: its item:* effects and those on its attack tests (`test:combat`, the weapon's skill). */
function weaponFx(data: Sr6Data, e: Sr6Entry, skill?: string): Fx[] {
  return ownParts(data, e)
    .filter((p: Sr6Part) => p.tag === 'effect' && p.attrs.confidence !== 'low' && p.attrs.affects !== 'others')
    .map(p => p.attrs as unknown as Fx)
    .filter(
      a =>
        (a.op === 'add' || a.op === 'set') &&
        (a.target.startsWith('item:') || (a.op === 'add' && (a.target === 'test:combat' || (!!skill && a.target === `skill:${skill}`)))),
    )
}

/** The firing modes a condition names when it names nothing else (`semi-auto, burst fire`, `Full-Auto`, `Burst Fire
 *  (reduces its AR penalty)`); undefined when it names none, or something more (`Full-Auto, properly deployed`). */
export function modesIn(when?: string): FireMode[] | undefined {
  const w = (when ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ')
  const ms = MODES.filter(m => ({ SA: /semi[- ]?auto(matic)?/, BF: /burst(?: fire)?/, FA: /full[- ]?auto(matic)?/ })[m].test(w))
  const rest = w.replace(/semi[- ]?auto(matic)?|burst(?: fire)?|full[- ]?auto(matic)?|\b(fire|firing|mode|modes|and|or)\b|[\s,/&]+/g, '')
  return ms.length && !rest ? ms : undefined
}

function apply(s: WeaponStats, fx: Fx, rating: number, sign: number) {
  const v = fx.value ?? '',
    set = fx.op === 'set' && sign > 0
  const n = sign * num(v, rating)
  switch (fx.target) {
    case 'item:ar': {
      // (an Attack Rating bonus for some firing modes only, `semi-auto, burst fire`: their adjustment, CRB p. 110)
      const ms = modesIn(fx.when)
      if (ms) {
        for (const m of ms) if (s.recoil[m] !== undefined) s.recoil[m] = Math.min(0, s.recoil[m]! + n)
        return
      }
      if (BAND.test(v)) {
        const bs = v.split(',').map(x => x.trim())
        s.ar = s.ar.map((a, k) => (a === null ? null : /x/i.test(bs[k]) ? (sign > 0 ? null : a) : a + sign * num(bs[k], rating)))
      } else s.ar = s.ar.map(a => (a === null ? null : set ? n : a + n))
      // (FS p. 59: "Attack Ratings cannot go below zero")
      s.ar = s.ar.map(a => (a === null ? null : Math.max(0, a)))
      return
    }
    case 'item:dv': {
      const d = lead(s.dv)
      if (d !== undefined) s.dv = swap(s.dv, set ? n : Number(d) + n)
      return
    }
    case 'item:ammo': {
      const d = lead(s.ammo),
        times = /^x(\d+)$/i.exec(v.trim())
      if (times && d !== undefined) s.ammo = swap(s.ammo, sign > 0 ? Number(d) * Number(times[1]) : Math.round(Number(d) / Number(times[1])))
      else if (d !== undefined) s.ammo = swap(s.ammo, set ? n : Number(d) + n)
      else if (set) s.ammo = String(n)
      return
    }
    case 'item:modes': {
      const have = s.modes.split(/[/,\s]+/).filter(m => m && m !== '—')
      const add = v.split(/[/,\s]+/).filter(Boolean)
      const next = set ? add : sign > 0 ? [...new Set([...have, ...add])] : have.filter(m => !add.includes(m))
      s.modes = next.join('/') || '—'
      for (const m of MODES) {
        if (next.includes(m)) s.recoil[m] ??= MODE_AR[m]
        else delete s.recoil[m]
      }
      return
    }
    case 'item:concealability':
      s.concealability += n
      return
    case 'item:recoil-sa':
    case 'item:recoil-bf':
    case 'item:recoil-fa': {
      const m = fx.target.slice(-2).toUpperCase() as FireMode
      if (s.recoil[m] !== undefined) s.recoil[m] = Math.min(0, set ? n : s.recoil[m]! + n)
      return
    }
    default:
      if (fx.target === 'test:combat' || fx.target.startsWith('skill:')) s.pool += n
  }
}

/** A weapon line's stats with its accessories (each at its rating) and factory parts; `skill`: the weapon's skill id
 *  (derive.ts weaponSkill), whose effects on that skill count toward the attack's pool. */
export function weaponOf(x: Sr6Purchase, data: Sr6Data, skill?: string): WeaponOf {
  const base = baseOf(entryOf(x, data))
  const copy = (): WeaponStats => ({ ...structuredClone(base) })
  const now = copy(),
    on = copy(),
    from = new Set<string>()
  const srcs: Src[] = []
  for (const a of x.accessories) {
    const e = entryOf(a, data)
    if (e) srcs.push({ e, rating: ratingOf(a, e), sit: a.sit, sign: 1 })
  }
  for (const p of partsOf(x, data))
    if (p.entry)
      srcs.push(
        p.removed ? { e: p.entry, rating: Number(p.rating) || 1, sign: -1 } : { e: p.entry, rating: Number(p.rating) || 1, sign: 1, switchedOnly: true },
      )
  for (const s of srcs) {
    const fx = weaponFx(data, s.e, skill)
    // (sets first, then what adds to them)
    const ordered = [...fx.filter(f => f.op === 'set'), ...fx.filter(f => f.op !== 'set')]
    for (const f of ordered) {
      const modeOnly = f.target === 'item:ar' && !!modesIn(f.when) && (!f.switch || f.switch === 'conditional')
      const state = modeOnly ? {} : { switch: f.switch as never, when: f.when }
      const always = counts(state)
      if (s.sign < 0 && !always) continue // (a removed part's switched effects were never in the printed stats)
      if (s.switchedOnly && always) continue // (a standard part's always-on effects already are)
      const turned = always || sitOf(s.sit, f, fx.indexOf(f)) > 0
      if (turned) apply(now, f, s.rating, s.sign)
      if (counts(state, true)) apply(on, f, s.rating, s.sign)
      from.add(s.e.name)
    }
  }
  return { base, now, on, from: [...from] }
}

/** `9/9/7/—/—`. */
export const bandsText = (bs: (number | null)[]) => bs.map(v => (v === null ? '—' : String(v))).join('/')
/** `AR 9/9/7 → 10/10/8 (11/11/9), DV 3P, SA/BF, ammo 15(c) → 25(c)`: what the fittings change, base → modified (bracketed:
 *  with every switched one on). Only the stats they move. */
export function weaponChanges(w: WeaponOf): string[] {
  const out: string[] = []
  const show = (label: string, f: (s: WeaponStats) => string) => {
    const b = f(w.base),
      n = f(w.now),
      o = f(w.on)
    if (b !== n || n !== o) out.push(`${label} ${b} → ${n}${o !== n ? ` (${o})` : ''}`)
  }
  show('AR', s => bandsText(s.ar))
  show('DV', s => s.dv)
  show('modes', s => s.modes)
  show('ammo', s => s.ammo)
  show(
    'recoil',
    s =>
      MODES.filter(m => s.recoil[m] !== undefined)
        .map(m => `${m} ${s.recoil[m]}`)
        .join(', ') || '—',
  )
  show('concealability', s => (s.concealability > 0 ? `+${s.concealability}` : String(s.concealability)))
  show('pool', s => (s.pool > 0 ? `+${s.pool}` : String(s.pool)))
  return out
}

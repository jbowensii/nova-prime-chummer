// Deadly Arts' mil-spec design options (pp. 151-153, an expansion of Double Clutch's Build Your Dream; owner ruling (c),
// 2026-10-30): specialty armor, the mil-spec frame, mil-spec comms and mil-spec hardpoints with their weapon mounts,
// worked out on a design's stats by the part's name. Each rule broken is a warning (the Designer's way), never refused.
import type { Sr6Design, Sr6Hardpoint } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'

type Warn = (message: string, page: number, source?: string) => void
const key = (name: string) =>
  normName(name)
    .replace(/[^a-z]+/g, ' ')
    .trim()

/** The design parts the hardpoint list owns (p. 152-153): the Designer hides them from its option list. */
export const HARDPOINT_PARTS = /^(mil spec hardpoints?|dedicated primary weapons?|(turreted|inline|open|pop out) weapon mount|twin linked|quad linked)$/

/** What a mil-spec hardpoint's weapon needs (p. 152-153): the required Grade (its Size, turreted ±0, inline or open −2,
 *  pop-out +1, twin-linked +1, quad-linked +2), the least vehicle Body (5 + 5 × Grade; a dedicated primary weapon one
 *  Grade smaller), its Design Points (5 × Grade, pop-out +5 × Grade, twin +3, quad +5), and why it fails. */
export function hardpointCheck(h: Sr6Hardpoint, body: number) {
  const reasons: string[] = [],
    notes: string[] = []
  const need = h.size === undefined ? undefined : h.size + (h.mount ? -2 : 0) + (h.popOut ? 1 : 0) + (h.link === 'twin' ? 1 : h.link === 'quad' ? 2 : 0)
  if (h.weapon && need === undefined) reasons.push('the weapon’s Size is not entered.')
  if (need !== undefined && need > h.grade) reasons.push(`the weapon needs a Grade ${need} hardpoint (this one is Grade ${h.grade}).`)
  if (h.popOut && h.mount === 'inline') reasons.push('a pop-out goes on an open or turreted mount only.')
  const minBody = 5 + 5 * Math.max(0, h.dedicated ? h.grade - 1 : h.grade)
  if (body < minBody) reasons.push(`a Grade ${h.grade}${h.dedicated ? ' dedicated' : ''} hardpoint needs Body ${minBody} (the vehicle has ${body}).`)
  if (h.mount === 'open') notes.push('Open mount: the weapon gets no protection from the vehicle’s Armor or Body; a Targeted Fire shot at it uses its Size.')
  if (h.mount === 'inline') notes.push('Inline mount: a Piloting test replaces the Engineering (Gunnery) test to acquire a target.')
  if (h.popOut) notes.push('Pop-out: deploying the weapon is a Major Action.')
  if (h.dedicated) notes.push('Dedicated primary weapon: permanent; changing it takes a full factory redesign.')
  const dp = 5 * h.grade + (h.popOut ? 5 * h.grade : 0) + (h.link === 'twin' ? 3 : h.link === 'quad' ? 5 : 0)
  return { need, minBody, dp, ok: reasons.length === 0, reasons, notes }
}

/** The in-console commlink each tier of Mil-spec Comms carries (p. 151), by catalog name. */
export const COMMS: Record<string, { names: string[]; note: string }> = {
  'mil spec comms i': { names: ['Microdeck Ranger', 'M-TOC Fob (part)'], note: 'Microdeck Ranger with an M-TOC fob running the Rampart Protocols' },
  'mil spec comms ii': { names: ['Microdeck Citadel Outrider'], note: 'Microdeck Citadel Outrider' },
  'mil spec comms iii': { names: ['Microdeck Citadel Commander'], note: 'Microdeck Citadel Commander' },
}

export interface MilspecSheet {
  /** incoming attacks' DV reduced by (mil-spec plate's Rating) */
  damageReduction: number
  /** Body added when resisting damage (Mil-Spec Frame) */
  resistBody: number
  /** dice pool bonus (Airframe Ceramic Plate: half the Armor) */
  armorPool: number
  hardpoints: ReturnType<typeof hardpointCheck>[]
  /** the in-console commlinks of Mil-spec Comms: catalog entries found, else their names */
  comms: { name: string; entry?: Sr6Entry }[]
}

/** The mil-spec rules over a design's picked parts: changes `stats` (Speed Interval), returns the Design Points to add
 *  (the hardpoints', and Airframe Ceramic Plate's 2 × the final Armor in place of its level's) and the stat block's extras. */
export function milspec(
  d: Sr6Design,
  picked: { e: Sr6Entry; level: number }[],
  stats: { body: number; armor: number; interval: number },
  baseBody: number,
  data: Sr6Data,
  warn: Warn,
  notes: string[],
): { dp: number; sheet: MilspecSheet } {
  const lv = (k: string) => picked.filter(p => key(p.e.name) === k).reduce((t, p) => t + p.level, 0)
  const modNamed = (rx: RegExp) => d.mods.some(m => rx.test((m.id ? data.entry(m.kind, m.id)?.name : undefined) ?? m.name ?? ''))
  let dp = 0
  // specialty armor: one layer of one type (p. 151)
  const plate = Math.max(lv('heavy mil spec plate'), lv('mil spec plate')),
    airframe = lv('airframe ceramic plate')
  const kinds = [airframe > 0, plate > 0, modNamed(/ceramic plate/i) && !airframe, modNamed(/^mil-spec plate/i) && !plate].filter(Boolean).length
  if (kinds > 1 || picked.filter(p => /^(heavy mil spec plate|mil spec plate)$/.test(key(p.e.name))).length > 1)
    warn('Only one layer of one specialty armor (airframe ceramic, ceramic or mil-spec plate) may be used; they do not stack.', 151, 'DA')
  const heavy = lv('heavy mil spec plate')
  if (heavy && (heavy < 4 || heavy > 6)) warn(`Heavy Mil-Spec Plate is Rating 4 to 6 (it is ${heavy}).`, 151, 'DA')
  // the frame: +Rating Body resisting damage, at most half the base Body; every 2 points carry a level of plate
  const frame = lv('mil spec frame')
  if (frame > 12) warn(`Mil-Spec Frame is Rating 1 to 12 (it is ${frame}).`, 151, 'DA')
  const cap = Math.floor(baseBody / 2)
  if (frame > cap) warn(`Mil-Spec Frame ${frame}: at most +50% of the base Body (${cap}).`, 151, 'DA')
  if (frame && (lv('increased structural integrity') || modNamed(/increased structural integrity/i)))
    warn('Mil-Spec Frame and Increased Structural Integrity may not be combined.', 151, 'DA')
  const penalized = Math.max(0, plate - Math.floor(frame / 2))
  if (penalized) {
    stats.interval -= 5 * penalized
    notes.push(
      `Mil-spec plate ${plate}: Speed Interval −${5 * penalized}${frame >= 2 ? ` (${plate - penalized} level${plate - penalized === 1 ? '' : 's'} carried by the frame)` : ''}.`,
    )
  }
  // airframe ceramic plate: costs 2 × the Armor (not its level); half the Armor as dice; no field repair
  const ap = picked.find(p => key(p.e.name) === 'airframe ceramic plate')
  if (ap) {
    dp += 2 * stats.armor - 2 * ap.level
    notes.push('Airframe Ceramic Plate: damaged panels need a nanomaintenance repair system or a factory replacement; no field repair.')
  }
  // comms: the in-console commlink
  const comms: MilspecSheet['comms'] = []
  for (const p of picked) {
    const c = COMMS[key(p.e.name)]
    if (!c) continue
    for (const name of c.names) comms.push({ name, entry: data.named?.(name, 'electronics') })
    notes.push(`${p.e.name}: in-console ${c.note}.`)
  }
  const hardpoints = (d.hardpoints ?? []).map(h => hardpointCheck(h, stats.body))
  dp += hardpoints.reduce((t, h) => t + h.dp, 0)
  return { dp, sheet: { damageReduction: plate, resistBody: Math.min(frame, cap), armorPool: ap ? Math.floor(stats.armor / 2) : 0, hardpoints, comms } }
}

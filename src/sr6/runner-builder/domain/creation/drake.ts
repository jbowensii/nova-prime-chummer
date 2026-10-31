// Drake and shifter player characters, as Commlink6 1.14.0 builds them (SR6DrakeController, SR6ShifterGenerator). The drake
// and shifter qualities, their powers and add-ons are the catalog's (the same entries an imported drake or shifter NPC reads,
// npc.ts findPower); what a player character adds is:
// - Drake (Lofwyr's Legions): the Drake (aware, 50 Karma) or Latent Drake (25) quality; only an aware drake learns
//   dracogenesis powers (CL6 impossible.drake_only: body type DRAKE), the nth for 5 + n Karma (process(): 6, 7, 8 …).
// - Shifter (Bestial Nature): the Shifter quality; add-ons only with it (canBeSelected: FALSE without it), kept apart from
//   the qualities (CL6's shifterAddOns: never one of the six, never in the negative-quality cap), all of them costing
//   max(0, their Karma added up, the negative ones taking off); and a shifter can't use Resonance (todo.shifter_must_have_magic).
import type { Sr6Attr, Sr6Build, Sr6Quality } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import { MAGIC_KINDS, type Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'

const qualityName = (data: Sr6Data, q: Sr6Quality) => normName(data.qualities[q.id]?.name ?? q.name ?? '')

/** The runner's drake body: an aware drake (the Drake quality), a latent one, or none. */
export function drakeKind(b: Sr6Build, data: Sr6Data): 'aware' | 'latent' | undefined {
  const names = b.qualities.map(q => qualityName(data, q))
  return names.includes('drake') ? 'aware' : names.includes('latent drake') ? 'latent' : undefined
}
/** A dracogenesis power: a critter power Commlink6 types DRACOGENESIS_POWER (`class`), or, until the importer writes that,
 *  one of Lofwyr's Legions' critter powers (its recipe reads the drake powers there: importer/sr6/recipes/ll.md). */
export const isDracogenesis = (e: Sr6Entry | undefined): boolean =>
  !!e && e.kind === 'critterpowers' && (/^DRACOGENESIS/.test(e.attrs.class ?? '') || e.source === 'LL')
/** The dracogenesis powers learned, a power with levels its level. */
export const dracogenesisRank = (b: Sr6Build) => b.picks.filter(x => x.kind === 'critterpowers').reduce((t, x) => t + (x.level ?? 1), 0)
/** Karma for them: 5 + n for the nth (Commlink6's process(), from 6). */
export function dracogenesisKarma(b: Sr6Build): number {
  let t = 0
  for (let n = 1; n <= dracogenesisRank(b); n++) t += 5 + n
  return t
}

/** A shifter add-on: a quality Commlink6 types SHIFTER, or one Bestial Nature names `<name> (Shifter add-on)`. */
export const isShifterAddOn = (data: Sr6Data, id: string): boolean => {
  const e = data.entry('qualities', id)
  return !!e && (/^SHIFTER\b/.test(e.attrs.class ?? '') || /\(shifter add-on\)\s*$/i.test(e.name))
}
/** Whether the runner is a shifter: it has a Shifter quality (not an add-on). */
export const isShifter = (b: Sr6Build, data: Sr6Data) => b.qualities.some(q => /^shifter\b/.test(qualityName(data, q)) && !isShifterAddOn(data, q.id))
/** Karma for the add-ons: their Karma added up (a negative one's taking off), never below 0 (CL6 getCurrentKarmaCost). */
export function shifterAddOnKarma(b: Sr6Build, data: Sr6Data): number {
  const t = b.qualities
    .filter(q => !q.free && isShifterAddOn(data, q.id))
    .reduce((s, q) => {
      const v = data.qualities[q.id]
      return s + (v?.positive === false ? -1 : 1) * Math.abs(v?.karma ?? 0) * (v?.perLevel ? q.level : 1)
    }, 0)
  return Math.max(0, t)
}
/** A shifter using Resonance (a technomancer), which Commlink6 stops. */
export const shifterResonance = (b: Sr6Build, data: Sr6Data) => isShifter(b, data) && MAGIC_KINDS[b.magic].resonance

/** The runner's drake type: its granted quality of the Drake type list (Lofwyr's Legions p. 16, the Drake quality's pick). */
export const drakeType = (b: Sr6Build, data: Sr6Data): Sr6Entry | undefined =>
  b.qualities.map(q => data.entry('qualities', q.id)).find(e => e?.attrs.category === 'Drake type')
/** A drake type's dracoform adjustment points: the attributes they may raise (its `dracoform` effects) and the pool. */
export function dracoformPool(e: Sr6Entry | undefined): { attrs: Sr6Attr[]; points: number } {
  const fx = (e?.parts ?? []).filter(p => p.tag === 'effect' && p.attrs.op === 'dracoform' && p.attrs.target?.startsWith('attr:'))
  return { attrs: fx.map(p => p.attrs.target.slice(5) as Sr6Attr), points: Math.max(0, ...fx.map(p => Number(p.attrs.value) || 0)) }
}
/** What a drake type gives (its `grant` effects: critter powers and its downsides, the dracoform-only ones with `when`),
 *  each resolved to the catalog entry it names (the type's own book first, else by name), the name when none. */
export function drakeGrants(data: Sr6Data, e: Sr6Entry | undefined): { kind: 'critterpowers' | 'qualities'; name: string; entry?: Sr6Entry; when?: string }[] {
  return (e?.parts ?? [])
    .filter(p => p.tag === 'effect' && p.attrs.op === 'grant')
    .map(p => {
      const [k, ref = ''] = (p.attrs.target ?? '').split(':')
      const kind = k === 'quality' ? ('qualities' as const) : ('critterpowers' as const)
      const entry = data.entry(kind, `${e!.source.toLowerCase()}.${ref}`) ?? data.named?.(ref.replace(/-/g, ' '), kind)
      return { kind, name: entry?.name ?? ref.replace(/-/g, ' '), ...(entry ? { entry } : {}), ...(p.attrs.when ? { when: p.attrs.when } : {}) }
    })
}
/** What is wrong with the dracoform points spent: no drake type, more than the pool, or on an attribute the type doesn't
 *  name. */
export function dracoformProblems(b: Sr6Build, data: Sr6Data): string[] {
  const spent = Object.entries(b.dracoform ?? {}).filter(([, v]) => (v ?? 0) > 0)
  if (!spent.length) return []
  const t = drakeType(b, data)
  if (!t) return ['Dracoform adjustment points need a drake type (the Drake quality’s pick).']
  const { attrs, points } = dracoformPool(t)
  const out: string[] = []
  const total = spent.reduce((s, [, v]) => s + (v ?? 0), 0)
  if (total > points) out.push(`${total} dracoform adjustment points spent; ${t.name} has ${points}.`)
  for (const [a] of spent) if (!attrs.includes(a as Sr6Attr)) out.push(`${t.name}’s dracoform points can’t go to ${a.toUpperCase()}.`)
  return out
}

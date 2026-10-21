// What both printed sheets (Sheet.tsx, BookSheet.tsx) take from the runner: amp effect lines, the lists, and the Risk table.
import { ruleText } from '../engine/amps'
import { knowledgeList } from '../engine/derive'
import { bracketed, effectHow } from '../shared/effects'
import type { Derived } from '../engine/derive'
import type { AmpEntry, Build, Catalog } from '../model/types'

export const RISK = [
  ['1 die', '2 dice', '4 dice', '6+ dice'],
  ['3 dice', '5 dice', '7 dice', '10+ dice'],
  ['5 dice', '8 dice', '11 dice', '13+ dice'],
  ['8 dice', '12 dice', '15 dice', 'N/A'],
]

type Effect = AmpEntry['effects'][number]
function effectText(c: Catalog, e: Effect, n = 1) {
  const how = [effectHow(e), e.unpriced ? 'unpriced by the rating' : ''].filter(Boolean).join(', ')
  return `${ruleText(c, e) ?? amountText(c, e.ref, e.param, e.value, n)}${how ? ` (${how})` : ''}`
}
function amountText(c: Catalog, ref: string, param?: string, value?: number, n = 1) {
  const def = c.ampEffects.get(ref)
  const skill =
    param &&
    (c.skills.get(param)?.name ??
      (() => {
        const s = c.skills.get(param.split('.')[0])
        const sp = s?.specs.find(x => x.id === param)
        return sp && `${s!.name} (${sp.name})`
      })())
  const who = skill || (param && (c.attributes.get(param as never)?.name ?? param.replace(/^custom:/, '')))
  if (ref === 'rr-spec' || ref === 'rr-skill' || ref === 'rr-attr') return `RR ${n} on ${who ?? '(to choose)'} Tests`
  if (ref === 'negative') return `Drawback (−${value ?? 1})`
  return `${def?.name ?? ref}${param && ref !== 'narrative' ? `: ${param}` : ''}`
}

/** A thresholds row's cells, each as the books print a switchable bonus: `6 (7)` (derive's `switched`). */
export const cells = (off: number[], on?: number[]) => off.map((x, i) => <td key={i}>{bracketed(x, on?.[i])}</td>)
/** A pool's Risk Reduction, `1 (2)` when switching effects on raises it; none: blank. */
export const rrText = (off: number, on?: number) => (on !== undefined && on !== off ? bracketed(off, on) : off || '')
/** The wound boxes switching effects on adds, as a line ("+1 light box switched on"), else nothing. */
export function switchedBoxes(d: Derived) {
  const l = (d.switched?.monitor.light ?? d.monitor.light) - d.monitor.light,
    s = (d.switched?.monitor.serious ?? d.monitor.serious) - d.monitor.serious
  return [l > 0 && `+${l} light`, s > 0 && `+${s} serious`].filter(Boolean).join(', ') + (l > 0 || s > 0 ? ' box switched on' : '')
}

/** An amp's effect lines, the same ones counted once with "×n" (RR lines say their total instead). */
export const ampLines = (c: Catalog, a: AmpEntry): { e: Effect; text: string }[] =>
  [
    ...a.effects
      .filter(e => e.ref !== 'narrative' || e.param)
      .reduce((m, e) => {
        const k = `${e.ref}|${e.param}|${e.value}|${effectHow(e)}`
        m.set(k, [e, (m.get(k)?.[1] ?? 0) + 1])
        return m
      }, new Map<string, [Effect, number]>())
      .values(),
  ].map(([e, n]) => ({ e, text: `${effectText(c, e, n)}${!e.ref.startsWith('rr-') && n > 1 ? ` ×${n}` : ''}` }))

/** Languages and knowledge in the player's order, hidden rows left off; spells and complex forms; gear (and spare armor). */
export function lists(d: Derived, b: Build) {
  const shown = (kind: 'knowledge' | 'language') => knowledgeList(d.knowledge, kind, b.knowledgeOrder).filter(k => !k.hidden)
  return {
    langs: shown('language'),
    know: shown('knowledge'),
    spells: b.items.filter(i => i.kind === 'spell' || i.kind === 'complex-form'),
    gear: b.items.filter(i => i.kind === 'gear' || (i.kind === 'armor' && i.uid !== b.mainArmor && i.uid !== b.altArmor)),
  }
}

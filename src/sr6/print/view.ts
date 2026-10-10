// What every SR6 printed sheet (Sheet.tsx: Printer-friendly and Full color; BookSheet.tsx; NeonSheet.tsx; HexSheet.tsx;
// DossierSheet.tsx) reads off the runner: its name, purchase lines by kind, names and ratings, weapons split ranged/melee,
// every skill, languages and knowledge, gear, each SIN's lifestyles and the karma and nuyen left (career: the ledger's balances).
import { entryOf } from '../engine/budgets'
import { balances } from '../engine/career'
import type { PickKind, PurchaseKind, Sr6Character, Sr6Lifestyle, Sr6Purchase, Sr6Sin } from '../model/character'
import type { Sr6Entry } from '../model/types'
import type { Sr6Data } from '../engine/data'
import type { Sr6Derived, Sr6Pool } from '../engine/derive'
import type { Sr6Ctx } from '../ui/editor'
import { entryLabel } from '../engine/categories'
import { effectState, effectText } from '../engine/effects'

export const PICKS: [PickKind, string][] = [['spells', 'Spells'], ['rituals', 'Rituals'], ['adeptpowers', 'Adept powers'], ['metamagics', 'Metamagics'],
  ['complexforms', 'Complex forms'], ['echoes', 'Echoes']]
/** What a spell's or metamagic's catalog flags say, in words: `Opposed`, `Essence`, `Adepts only`, `Taken again`. */
export function pickFlags(e: Sr6Entry): string[] {
  const a = e.attrs
  return e.kind === 'spells' ? [a.opposed === 'true' && 'Opposed', a.essence === 'true' && 'Essence threshold'].filter((x): x is string => !!x)
    : e.kind === 'metamagics' ? [a.user && `${a.user === 'adept' ? 'Adepts' : 'Magicians'} only`, a.perLevel === 'true' && `Taken again${a.maxLevel ? ` (up to ${a.maxLevel})` : ''}`]
      .filter((x): x is string => !!x) : []
}

export const band = (v: number | null) => (v === null ? '—' : String(v))
/** `6 (9)`: a derived value and, when the switchable and conditional effects change it, the bracketed total (derive.ts
 *  on; owner decision 2026-10-10, as a book's stat block prints it). */
export const br = <T extends string | number | null | undefined>(a: T, b?: T): T | string =>
  a === null || a === undefined || b === undefined || b === null || String(a) === String(b) ? a : `${a} (${b})`
/** A pool's bracketed counterpart (the same skill with the switchable effects on). */
export const poolOn = (d: Sr6Derived, skill: string) => d.on.pools.find(x => x.skill === skill)
/** An attribute as a book prints it: with its always-on effects, the switchable ones on in brackets (`5 (7)`). */
export const attrShown = (d: Sr6Derived, a: keyof Sr6Derived['attrs']) => br(d.attrs[a].augmented, d.on.attrs[a].augmented)
export const AR_BANDS = ['Close', 'Near', 'Medium', 'Far', 'Extreme']
/** every catalog skill by name: the runner's pools, the rest at rank 0 (no pool where it can't be rolled untrained) */
export const allSkills = (d: Sr6Derived, data: Sr6Data): (Omit<Sr6Pool, 'dp'> & { dp?: number })[] => [...d.pools,
  ...Object.values(data.skills).filter(s => !d.pools.some(p => p.skill === s.id)).map(s => ({ skill: s.id, label: s.name, rank: 0, attr: s.attr }))]
  .sort((x, y) => x.label.localeCompare(y.label))

export function runnerView({ ch, data, d, career }: Pick<Sr6Ctx, 'ch' | 'data' | 'd' | 'career'>) {
  const b = ch.build
  const lines = (kind: PurchaseKind) => b.purchases.filter(x => x.kind === kind)
  const nameOf = (x: Sr6Purchase) => { const e = entryOf(x, data); return e ? entryLabel(e) : x.name ?? 'Custom item' }
  const attrsOf = (x: Sr6Purchase) => entryOf(x, data)?.attrs ?? {}
  // a weapon with modes or ammo shoots; the rest (blades, clubs, unarmed extras) are melee
  const ranged = (x: Sr6Purchase) => { const a = attrsOf(x); return !!(a.modes || a.ammo) }
  const { karma, nuyen } = career ? balances(ch) : { karma: d.karmaLeft, nuyen: d.nuyenLeft }
  const life = (l: Sr6Lifestyle) => `${data.entry('lifestyles', l.id)?.name ?? l.id} × ${l.months} month${l.months === 1 ? '' : 's'}`
  const first = b.sins.flatMap(s => s.lifestyles ?? [])[0]
  return {
    name: ch.identity.streetName || ch.identity.name || (ch.npc ? 'Unnamed NPC' : 'Unnamed runner'),
    lines, nameOf, attrsOf,
    /** a host's own values from its accessories (`STR 5, Armor +2`), for its line on the sheet */
    host: (x: Sr6Purchase) => d.hosts.find(h => h.uid === x.uid)?.text,
    rated: (x: Sr6Purchase) => [x.rating && `rating ${x.rating}`, x.grade].filter(Boolean).join(', '),
    bands: (x: Sr6Purchase) => d.attackRatings.weapons.find(a => a.uid === x.uid)?.bands ?? [null, null, null, null, null],
    rangedWeapons: lines('weapons').filter(ranged), meleeWeapons: lines('weapons').filter(x => !ranged(x)),
    know: b.knowledge.filter(x => x.kind === 'knowledge'), langs: b.knowledge.filter(x => x.kind === 'language'),
    gear: [...lines('electronics'), ...lines('programs'), ...lines('gear'), ...lines('ammotypes')],
    /** a SIN's lifestyles, `Cozy × 2 months, Squat × 1 month` ('' when none) */
    lifeOf: (s: Sr6Sin) => (s.lifestyles ?? []).map(life).join(', '),
    /** the primary lifestyle: the first SIN's first one (of the SINs that have any) */
    lifestyle: first && life(first),
    karma, nuyen,
    /** what the runner's things do that the numbers above don't hold: switchable, conditional and low-confidence effects,
     *  the rule kinds (Edge on tests, Edge costs, no Edge, wild dice, extra actions, Hardened Armor, Overwatch …) and links,
     *  `Name: text` each (owner decision 2026-10-10: the sheet shows them) */
    effectNotes: effectNotes(ch.build, data),
  }
}

const COUNTED = /^(attr:|derived:(defense|initiative-dice|physical-monitor|stun-monitor|overflow)$|skill:|test:)/
/** The effect lines the sheet lists (runnerView.effectNotes): every effect of the runner's qualities, picks and lines but
 *  an always-on `add` the derived numbers already count. */
export function effectNotes(b: Sr6Character['build'], data: Sr6Data): { from: string; text: string }[] {
  const out: { from: string; text: string }[] = []
  const take = (e: Sr6Entry | undefined) => {
    for (const p of e?.parts ?? []) {
      if (p.tag !== 'effect' && p.tag !== 'link') continue
      if (p.tag === 'effect' && p.attrs.op === 'add' && effectState(p) === 'applied' && COUNTED.test(p.attrs.target ?? '')) continue
      out.push({ from: entryLabel(e!), text: effectText(p) })
    }
  }
  for (const q of b.qualities) take(data.entry('qualities', q.id))
  for (const x of b.picks) take(data.entry(x.kind, x.id))
  for (const x of b.purchases) { take(entryOf(x, data)); for (const a of x.accessories) take(entryOf(a, data)) }
  return out
}

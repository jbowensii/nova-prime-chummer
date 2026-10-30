// The bonuses a runner's picks, purchases and qualities give (their entered ones, else their catalog entry's effects), and
// what they add to an attribute, a skill's pool or a host item.
import type { Bonus, Sr6Attr, Sr6Build, Sr6Pick, Sr6Purchase, Sr6Quality, Sr6Situational } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { own } from '../../../../core/shared/effects'
import { entryLabel } from '../../../catalog/domain/categories'
import { bonusValue, effectBonuses, perCount, sitKey, sitOf, sr6Counts as counts, whenHolds, type WhenFacts } from '../../../catalog/domain/effects'
import { MAGIC_KINDS } from '../../../catalog/domain/data'
import { baseMetatype, metatypeName } from './infected'
import { entryOf, ratingOf } from './purchases'
import { partsOf } from '../assets/vehiclemods'
import { noteAttr, noteSkill } from './choices'

// (owner decision 2026-10-10: the total shown first holds the always-on bonuses, `on` (the bracketed total) the switchable
// and conditional ones too; a skill bonus limited to a specialization counts in that specialization's pool (specBonus),
// and in the skill's bracketed total for a specialization the runner hasn't)
const bonusOf = (bonuses: Bonus[] | undefined, k: Bonus['target'], rating: number, skill?: string, on = false, spec?: string) =>
  (bonuses ?? [])
    .filter(x => x.target === k && !x.set && counts(x, on) && (k !== 'skill' || x.skill === skill) && (!x.spec || (on && !sameSpec(x.spec, spec))))
    .reduce((s, x) => s + bonusValue(x, rating), 0)
// (`Etiquette or Negotiation`: either)
const sameSpec = (a?: string, b?: string) => !!a && !!b && a.split(/,\s*|\s+(?:or|and)\s+/).some(x => normName(x) === normName(b))
/** What a runner's machine conditions are decided from (whenHolds). An attribute is its natural points (1 + points +
 *  adjustment + Karma) plus the always-on bonuses. */
// ponytail: no Provider here, so a lifepath start bonus and Magic/Resonance's method rating are not counted; pass attrRating in if a threshold on them shows up
function facts(b: Sr6Build, data: Sr6Data): WhenFacts {
  const plain = (k: Sr6Attr) => {
    let t = 0
    eachLine(b, data, (bs, rating, times) => (t += bonusOf(bs, k, rating) * times), false)
    return t
  }
  const a = (k: Sr6Attr) => b.attributes[k] ?? { points: 0, adjust: 0, karma: 0 }
  return {
    attr: k => 1 + a(k).points + a(k).adjust + a(k).karma + plain(k),
    metatype: [metatypeName(data, b.metatype), baseMetatype(data, b.metatype)],
    metatypes: Object.values(data.metatypes).map(m => m.name),
    kind: MAGIC_KINDS[b.magic] ?? MAGIC_KINDS.mundane,
  }
}
/** A line's bonuses with their machine conditions decided (owner, 2026-10-29: calculated, not notes): one that holds is
 *  always on (its `when` and a `conditional` switch dropped), one that doesn't is left out; prose stays bracketed unless the
 *  player switched it on (`sit`, keyed by the effect: sitKey): then it counts, a `per ...` one `count` times. */
function decided(bs: Bonus[], f: () => WhenFacts, sit?: Sr6Situational): Bonus[] {
  if (!bs.some(x => x.when)) return bs
  return bs.flatMap((x, i) => {
    const h = whenHolds(x.when, f())
    if (h === undefined) {
      const n = sitOf(sit, x, i)
      if (!x.when || n <= 0) return [x]
      const { when: _w, ...y } = x
      return [{ ...y, switch: y.switch === 'conditional' ? undefined : y.switch, ...(perCount(x.when) && n > 1 ? { count: n } : {}) }]
    }
    if (!h) return []
    const { when: _w, ...y } = x
    return [y.switch === 'conditional' ? { ...y, switch: undefined } : y]
  })
}
/** The effects a purchase, pick or quality gives, in the order its `sit` keys count them (the ones eachLine reads). */
export function effectsOf(data: Sr6Data, x: Sr6Purchase | Sr6Pick | Sr6Quality): Bonus[] {
  if ('accessories' in x) return lineBonuses(data, x.bonuses, entryOf(x, data))
  if ('kind' in x) return lineBonuses(data, x.bonuses, data.entry(x.kind, x.id), choiceOf(data, x.note))
  return entryBonuses(data, data.entry('qualities', x.id), choiceOf(data, x.note))
}
/** The effects of a line (its bonuses as lineBonuses has them) that only the player can decide, a situation in words (`in
 *  animal form`, `per additional barrel`): where in the line's effects each is (the key of its `sit`) and whether it
 *  scales (so it takes a count, not a switch). */
export function situations(b: Sr6Build, data: Sr6Data, bs: Bonus[]): { i: number; key: string; bonus: Bonus; scales: boolean }[] {
  const f = facts(b, data)
  return bs.flatMap((x, i) => (x.when && whenHolds(x.when, f) === undefined ? [{ i, key: sitKey(x), bonus: x, scales: perCount(x.when) }] : []))
}
/** Each line's bonuses at its rating and count: picks and qualities by level, purchases by rating times quantity; their
 *  machine conditions decided (decide false: as the catalog has them, what facts sums). */
function eachLine(b: Sr6Build, data: Sr6Data, g: (bs: Bonus[], rating: number, times: number, from: string) => void, decide = true) {
  let memo: WhenFacts | undefined
  const fx = () => (memo ??= facts(b, data))
  const f = (bs: Bonus[], rating: number, times: number, from: string, sit?: Sr6Situational) => g(decide ? decided(bs, fx, sit) : bs, rating, times, from)
  for (const x of b.picks)
    f(lineBonuses(data, x.bonuses, data.entry(x.kind, x.id), choiceOf(data, x.note)), x.level ?? 1, 1, data.entry(x.kind, x.id)?.name ?? x.name ?? x.id, x.sit)
  // (an owned critter's stat block and powers are its own, never the runner's)
  for (const x of b.purchases.filter(y => y.kind !== 'critters')) {
    const e = entryOf(x, data)
    f(lineBonuses(data, x.bonuses, e), ratingOf(x, e), x.qty, e?.name ?? x.name ?? 'Custom item', x.sit)
  }
  for (const q of b.qualities) {
    const e = data.entry('qualities', q.id)
    f(entryBonuses(data, e, choiceOf(data, q.note)), 1, q.level, e?.name ?? q.name ?? q.id, q.sit)
  }
}
/** The skill and attribute a pick's or quality's note names: its `skill:choice` and `attr:choice` effects' target. */
export const choiceOf = (data: Sr6Data, note?: string) => (note ? { skill: noteSkill(data, note), attr: noteAttr(note) } : {})
/** The bonuses to `target` (for `skill` the one skill's dice pool) that only the bracketed total holds (switchable, some
 *  tests only, or a specialization the runner hasn't), each with its line's name, value at its rating and its note (its
 *  switch, condition or specialization, and `affects the caster`): why the bracket differs (owner decision 2026-10-10:
 *  the hover card, Review and the sheet name it). */
export function bracketNotes(
  b: Sr6Build,
  data: Sr6Data,
  target: Bonus['target'],
  skill?: string,
  spec?: string,
): { value: number; when: string; from: string; set?: true }[] {
  const out: { value: number; when: string; from: string; set?: true }[] = []
  eachLine(b, data, (bs, rating, times, from) => {
    for (const x of bs)
      if (x.target === target && (target !== 'skill' || x.skill === skill) && counts(x, true) && !sameSpec(x.spec, spec) && (!counts(x) || !!x.spec))
        out.push({
          value: bonusValue(x, rating) * times,
          from,
          ...(x.set ? { set: true as const } : {}),
          when: [x.spec, x.when, x.switch !== 'conditional' && x.switch, x.affects === 'caster' && 'affects the caster'].filter(Boolean).join(', '),
        })
  })
  return out
}
/** bracketNotes of a skill's pool. */
export const conditionalBonuses = (b: Sr6Build, data: Sr6Data, skill: string, spec?: string) => bracketNotes(b, data, 'skill', skill, spec)
/** The notes as one line each (a hover card's title): `+2 Muscle toner (wireless)`. */
export const notesText = (xs: { value: number; when: string; from: string; set?: true }[]) =>
  xs.map(x => `${x.set ? `${x.value} (sets)` : `${x.value >= 0 ? '+' : ''}${x.value}`} ${x.from}${x.when ? ` (${x.when})` : ''}`).join('\n')
/** What the bonuses limited to specialization `spec` add to skill `skill`'s pool for it (on: the switchable ones too). */
export function specBonus(b: Sr6Build, data: Sr6Data, skill: string, spec: string, on = false): number {
  let total = 0
  eachLine(b, data, (bs, rating, times) => {
    for (const x of bs)
      if (x.target === 'skill' && x.skill === skill && sameSpec(x.spec, spec) && counts({ ...x, spec: undefined } as Bonus, on))
        total += bonusValue(x, rating) * times
  })
  return total
}
/** A catalog entry's effects as bonuses (effects.ts effectBonuses: what importer/sr6/effects.py reads from the book's
 *  text and tables, with the entries it grants or works as). A low-confidence one is shown, never applied (owner decision
 *  D3). */
export const entryBonuses = (data: Sr6Data, e?: Sr6Entry, choice?: { skill?: string; attr?: Sr6Attr }): Bonus[] => effectBonuses(data, e, 0, choice)
/** The bonuses a line gives (the one place creation, Review, the sheets and the export read them): the player's or GM's
 *  own entered ones when it has any (they override, owner decision D3), else its catalog entry's effects. */
export const lineBonuses = (data: Sr6Data, entered: Bonus[] | undefined, e?: Sr6Entry, choice?: { skill?: string; attr?: Sr6Attr }): Bonus[] =>
  own(entered, entryBonuses(data, e, choice))
/** What the runner's picks, purchases and qualities add to its `k`, for `skill` the one skill's dice pool (`skill`: its
 *  id) (lineBonuses): picks and qualities by level, purchases by rating times quantity. on: the bracketed total's (the
 *  switchable and conditional bonuses too; spec: the specialization the runner has, whose bonuses specBonus counts). An
 *  accessory's bonuses are its host item's, never the runner's (hostBonus). */
export function augmentBonus(b: Sr6Build, data: Sr6Data, k: Bonus['target'], skill?: string, on = false, spec?: string): number {
  let total = 0
  eachLine(b, data, (bs, rating, times) => {
    total += bonusOf(bs, k, rating, skill, on, spec) * times
  })
  return total
}
/** The value a `set` effect gives `k` (Hardening's unarmed Attack Rating 6, a centaur body's movement), or undefined when none
 *  counts (on: the switchable and conditional ones too). It replaces the base value; what adds to `k` (augmentBonus) still
 *  applies on top. The highest wins when several apply (Foundry's actorChanges is mode 5 OVERRIDE, the last one; the builder
 *  takes the highest so the choice never depends on the order of the runner's gear). */
export function setBonus(b: Sr6Build, data: Sr6Data, k: Bonus['target'], on = false): number | undefined {
  let best: number | undefined
  eachLine(b, data, (bs, rating) => {
    for (const x of bs) if (x.target === k && x.set && counts(x, on)) best = Math.max(best ?? -Infinity, bonusValue(x, rating))
  })
  return best
}
/** augmentBonus line by line: each pick, purchase or quality that adds to `k` in the total shown first, with its name and
 *  what it adds (the attribute card lists them; their sum is augmentBonus, so the two never disagree; the bracketed ones
 *  are bracketNotes). */
export function bonusSources(
  b: Sr6Build,
  data: Sr6Data,
  k: Bonus['target'],
  skill?: string,
): { from: string; kind?: Sr6Kind; id?: string; value: number; set?: true }[] {
  const out: { from: string; kind?: Sr6Kind; id?: string; value: number; set?: true }[] = []
  let memo: WhenFacts | undefined
  const fx = () => (memo ??= facts(b, data))
  const add = (value: number, e: Sr6Entry | undefined, kind: Sr6Kind, id: string | undefined, name: string | undefined, bs: Bonus[], rating: number) => {
    const from = e ? entryLabel(e) : (name ?? id ?? 'Custom item')
    if (value) out.push({ from, kind, id, value })
    // (a line that sets the value: listed, marked, never summed in the adds)
    const sets = bs.filter(x => x.target === k && x.set && counts(x)).map(x => bonusValue(x, rating))
    if (sets.length) out.push({ from, kind, id, value: Math.max(...sets), set: true })
  }
  for (const x of b.picks) {
    const e = data.entry(x.kind, x.id)
    const bs = decided(lineBonuses(data, x.bonuses, e, choiceOf(data, x.note)), fx, x.sit)
    add(bonusOf(bs, k, x.level ?? 1, skill), e, x.kind, x.id, x.name, bs, x.level ?? 1)
  }
  for (const x of b.purchases.filter(y => y.kind !== 'critters')) {
    const e = entryOf(x, data)
    const bs = decided(lineBonuses(data, x.bonuses, e), fx, x.sit)
    add(bonusOf(bs, k, ratingOf(x, e), skill) * x.qty, e, x.kind, x.id, x.name, bs, ratingOf(x, e))
  }
  for (const q of b.qualities) {
    const e = data.entry('qualities', q.id)
    const bs = decided(entryBonuses(data, e, choiceOf(data, q.note)), fx, q.sit)
    add(bonusOf(bs, k, 1, skill) * q.level, e, 'qualities', q.id, q.name, bs, 1)
  }
  return out
}
/** What a line's accessories add to the line itself (a cyberlimb's Strength, its armor), each by its own rating:
 *  target -> total, only the targets they touch (not a skill's pool: a runner's, never an item's). */
export function hostBonus(x: Sr6Purchase, data: Sr6Data, on = false): Partial<Record<Exclude<Bonus['target'], 'skill'>, number>> {
  const out: Partial<Record<Exclude<Bonus['target'], 'skill'>, number>> = {}
  for (const a of x.accessories) {
    const e = entryOf(a, data),
      bs = lineBonuses(data, a.bonuses, e)
    for (const t of new Set(bs.map(y => y.target))) if (t !== 'skill') out[t] = (out[t] ?? 0) + bonusOf(bs, t, ratingOf(a, e), undefined, on)
  }
  // a weapon's standard upgrades (its <part>s the player hasn't removed) act as fitted accessories
  if (x.kind === 'weapons')
    for (const p of partsOf(x, data))
      if (!p.removed && p.entry) {
        const bs = entryBonuses(data, p.entry)
        for (const t of new Set(bs.map(y => y.target))) if (t !== 'skill') out[t] = (out[t] ?? 0) + bonusOf(bs, t, Number(p.rating) || 1, undefined, on)
      }
  return out
}

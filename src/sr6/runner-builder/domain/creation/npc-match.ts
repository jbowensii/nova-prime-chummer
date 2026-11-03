// NPC matching to the catalog: finding the entry a printed name is, and standard armor/items.
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { matchKey, nameRatio, normName, quickRatio } from '../../../catalog/domain/names'
import { rated } from '../../../catalog/domain/values'
import { byPublication } from './npc-block'
import { NPC_MATCH, type Sr6NpcMatch } from './npc-types'

import { indexOf } from './npc-index'

/** Of entries that match alike: the NPC's own book's, then the latest printing's (owner: the current printing wins),
 *  then catalog order. */
export const prefer = (c: Sr6Catalog, source: string | undefined) => {
  const order = byPublication(c.sources)
  return (list: Sr6Entry[]) => [...list].sort((a, b) => Number(b.source === source) - Number(a.source === source) || order(b.source, a.source))[0]
}
/** The catalog entry a printed name is, in `kinds`: by name (as printed, without its trailing note `Khopesh (Weapon Foci
 *  +2)` or footnote mark; the first kind with one wins); else the entry whose name is most alike, at least NPC_MATCH
 *  (matchKey, nameRatio, and sameWords; the first kind wins a tie; `how` loose or standard); else, with `standard`, the standard item of the category a generic
 *  name is (`commlink`: the category Commlinks' lowest rated, then cheapest entry). Ties: the NPC's own book, then the
 *  latest printing. */
export function findEntry(
  c: Sr6Catalog,
  name: string,
  kinds: Sr6Kind[],
  source?: string,
  how: 'exact' | 'loose' | 'standard' = 'exact',
  rating?: number,
): { entry: Sr6Entry; match: Sr6NpcMatch } | undefined {
  const x = indexOf(c),
    pick = prefer(c, source)
  for (const n of [name, name.replace(/\s*\([^()]*\)\s*$/, ''), name.replace(/\*+$/, '')])
    for (const k of kinds) {
      const list = x.exact.get(`${k}/${normName(n)}`)
      if (list?.length) return { entry: pick(list), match: { score: 1, how: 'exact' } }
    }
  const key = matchKey(name)
  if (how === 'exact' || key.length < 3) return undefined
  // the same name but for its plural, its rating or its note (`data taps`: Data tap) is that entry, before any guess at a type
  for (const k of kinds) {
    const same = x.loose.get(k)?.find(l => l.key === key)
    if (same) return { entry: pick(same.entries), match: { score: 1, how: 'fuzzy' } }
  }
  const words = key.split(' '),
    head = words[words.length - 1],
    rest = words.slice(0, -1)
  // a guess's score: its name against the entry's, or without its type word (`Erika Elite commlink`: `Erika Elite`, 1)
  const standard = (entry: Sr6Entry) => {
    const ek = matchKey(entry.name),
      score = round(Math.max(nameRatio(key, ek), rest.length ? nameRatio(rest.join(' '), ek) : 0))
    return { entry, match: { score, how: score >= NPC_MATCH ? ('fuzzy' as const) : ('standard' as const) } }
  }
  // its type: its last word is a category's last word (`smoke grenade`, `Yamaha Rapier motorcycle`, `commlink`): that
  // category's entries and the entries of its kinds with that word in their names
  const ofType =
    how === 'standard' && head.length >= 3 && !KIND_WORDS.test(head)
      ? kinds.flatMap(k =>
          [...(x.categories.get(k) ?? [])]
            .filter(([ck]) => ck.split(' ').at(-1) === head || (head.length >= 7 && nameRatio(head, ck.split(' ').at(-1)!) >= 0.9))
            .flatMap(([, es]) => es),
        )
      : []
  const typeKinds = [...new Set(ofType.map(e => e.kind))]
  const typed = [
    ...new Set([...ofType, ...typeKinds.flatMap(k => (x.loose.get(k) ?? []).filter(l => l.key.split(' ').includes(head)).flatMap(l => l.entries))]),
  ]
  const hits = (e: Sr6Entry) => {
    const ws = matchKey(e.name).split(' ')
    return rest.filter(w => ws.some(v => nameRatio(w, v) >= 0.85)).length
  }
  const closest = (list: Sr6Entry[]) => {
    const top = Math.max(...list.map(e => nameRatio(key, matchKey(e.name))))
    return pick(list.filter(e => nameRatio(key, matchKey(e.name)) === top))
  }
  // of its type, one with all its other words (`smoke grenade`: `Smoke/thermal smoke`)
  const whole = rest.length ? typed.filter(e => hits(e) === rest.length) : []
  if (whole.length) return standard(closest(whole))
  let best: { score: number; entries: Sr6Entry[] } | undefined
  // the name, and the name without a trailing generic word its kinds' categories are (`Erika Elite commlink`; two words
  // left at least: `Basic spacesuit` is no `Basic`)
  const cats = kinds.flatMap(k => [...(x.categories.get(k)?.keys() ?? [])])
  const keys = [key, ...cats.filter(ck => key.endsWith(` ${ck}`)).map(ck => key.slice(0, -ck.length - 1))].filter((k, i) => !i || k.includes(' '))
  // (the most alike within its type's kinds when it has one: a motorcycle is no rifle)
  for (const kk of keys)
    for (const k of typeKinds.length ? typeKinds : kinds)
      for (const l of x.loose.get(k) ?? []) {
        if (!within(kk, l.key) || quickRatio(kk, l.key) < NPC_MATCH) continue
        const score = nameRatio(kk, l.key)
        if (score >= NPC_MATCH && score > (best?.score ?? 0)) best = { score, entries: l.entries }
      }
  if (best) return { entry: pick(best.entries), match: { score: round(best.score), how: 'fuzzy' } }
  if (how !== 'standard' || KIND_WORDS.test(key)) return undefined
  // of its type, the one with most of its other words, else the type's standard item
  if (typed.length) {
    const most = Math.max(...typed.map(hits))
    if (most > 0) return standard(closest(typed.filter(e => hits(e) === most)))
    // (the name is its type alone, `commlink`: a whole match of the type)
    const entry = standardOf(ofType, pick, rating)
    return rest.length ? standard(entry) : { entry, match: { score: 1, how: 'standard' as const } }
  }
  for (const k of kinds)
    for (const [cat, entries] of x.categories.get(k) ?? []) {
      const score = !within(key, cat) || quickRatio(key, cat) < NPC_MATCH ? 0 : nameRatio(key, cat)
      if (score >= NPC_MATCH && score > (best?.score ?? 0)) best = { score, entries }
    }
  if (best) return { entry: standardOf(best.entries, pick, rating), match: { score: round(best.score), how: 'standard' as const } }
  // its last word names a kind of thing (`jammer`): of the entries whose name or category has it, the one whose other
  // words are most alike, else their standard one
  if (head.length < 3 || /^\d+$/.test(head)) return undefined
  const has = (k: string) => k.split(' ').includes(head)
  const found = new Set<Sr6Entry>()
  for (const k of kinds) {
    for (const l of x.loose.get(k) ?? []) if (has(l.key)) l.entries.forEach(e => found.add(e))
    for (const [ck, es] of x.categories.get(k) ?? []) if (has(ck)) es.forEach(e => found.add(e))
  }
  if (!found.size) return undefined
  const others = (e: Sr6Entry) =>
    matchKey(e.name)
      .split(' ')
      .filter(w => w !== head)
      .join(' ')
  const scored = [...found].map(e => ({ e, score: rest.length ? nameRatio(rest.join(' '), others(e)) : 0 }))
  const top = Math.max(...scored.map(t => t.score))
  return standard(standardOf(top > 0 ? scored.filter(t => t.score === top).map(t => t.e) : [...found], pick, rating))
}
/** a generic name that is only a kind of thing (`augmentations`, `bioware`): no standard item */
const KIND_WORDS = /^(?:augmentation|cyberware|bioware|gear|equipment|weapon|electronic|armor|power|item|thing)$/
/** head gear: a helmet, hood, mask, visor, hat or cap */
const HEAD = /\b(?:helmet|hood|mask|visor|hat|cap)\b/i
/** The standard armor for a printed Defense the catalog has no armor of that name for: an armor at that Defense, else the
 *  nearest below, else the least; its standard one (standardOf). */
export function standardArmor(c: Sr6Catalog, defense: number, name = ''): Sr6Entry | undefined {
  const d = (e: Sr6Entry) => Number((e.attrs.defense ?? '').replace('+', ''))
  // (body armor for body gear, head armor for a helmet, hood or mask: no cloak, shield or glove; and the same for every NPC, whichever book it is in)
  const all = [...(c.entries.armor?.values() ?? [])].filter(
    e =>
      /^\+?\d+$/.test(e.attrs.defense ?? '') &&
      !/accessor|mod/i.test(e.attrs.category ?? '') &&
      HEAD.test(e.name) === HEAD.test(name) &&
      !/\b(?:cloak|shield|gloves?|boots?|saddle|barding|cyclewear|goggles)\b/i.test(e.name),
  )
  // (a hood is head armor of the same kind when the catalog has it)
  const word = HEAD.exec(name)?.[0].toLowerCase()
  const same = word ? all.filter(e => e.name.toLowerCase().includes(word)) : []
  if (same.length) all.splice(0, all.length, ...same)
  if (!all.length) return undefined
  const at = all.filter(e => d(e) === defense),
    below = all.filter(e => d(e) < defense)
  const list = at.length ? at : below.length ? below.filter(e => d(e) === Math.max(...below.map(d))) : all.filter(e => d(e) === Math.min(...all.map(d)))
  return standardOf(list, prefer(c, undefined))
}
/** lengths that can still reach NPC_MATCH (nameRatio is at most 2 × the shorter / both) */
const within = (a: string, b: string) => (2 * Math.min(a.length, b.length)) / (a.length + b.length) >= NPC_MATCH
export const round = (n: number) => Math.round(n * 1000) / 1000
/** A category's standard item: at the printed rating when one has it, else the nearest level below it, else its lowest; then its lowest
 *  price (a price it can't read last). */
export function standardOf(list: Sr6Entry[], pick: (l: Sr6Entry[]) => Sr6Entry, rating?: number): Sr6Entry {
  const level = (e: Sr6Entry) => Number(e.attrs.level ?? e.attrs.rating) || 0,
    cost = (e: Sr6Entry) => rated(e.attrs.cost, level(e) || 1).n ?? Infinity
  // (the printed rating's, else the nearest below it, else the lowest)
  const below = rating == null ? [] : list.map(level).filter(l => l > 0 && l <= rating)
  const low = list.some(e => level(e) === rating) ? rating! : below.length ? Math.max(...below) : Math.min(...list.map(level)),
    l1 = list.filter(e => level(e) === low)
  const cheap = Math.min(...l1.map(cost))
  return pick(l1.filter(e => cost(e) === cheap))
}

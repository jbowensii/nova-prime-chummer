// NPC powers: reading a stat block power and finding its catalog entry.
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { matchKey, nameRatio, normName } from '../../../catalog/domain/names'
import { groups } from './npc-parse'
import { NPC_MATCH } from './npc-types'
import { findEntry, prefer } from './npc-match'

// (the kinds a power is linked in by its name only, never by a guess)
const BY_NAME_ONLY = new Set<Sr6Kind>(['qualities', 'augmentations'])
/** A stat block power read as its name, its rating and its parameters: `Venom [Vector: Injection; Speed: 1 round]` is
 *  `Venom`, those words; `Hardened Armor (4)` and `Hardened Armor 4` are `Hardened Armor`, rating 4. */
export function powerParts(printed: string): { name: string; rating?: number; detail: string } {
  const s = printed.replace(/\*+$/, '').trim(),
    g = groups(s)[0],
    head = (g ? s.slice(0, g[0]) : s).trim(),
    inside = g ? s.slice(g[0] + 1, g[1]).trim() : '',
    after = g ? s.slice(g[1] + 1).trim() : ''
  // (a bracket holding only a number is the rating: `Hardened Armor (4)`)
  const r = /^\d{1,2}$/.test(inside) ? inside : (head.match(/\s(\d{1,2})$/)?.[1] ?? after.match(/^\d{1,2}$/)?.[0])
  return {
    name: head.replace(/\s+\d{1,2}$/, ''),
    ...(r ? { rating: Number(r) } : {}),
    detail: [/^\d{1,2}$/.test(inside) ? '' : inside, /^\d{1,2}$/.test(after) ? '' : after].filter(Boolean).join(' '),
  }
}
/** Whether a guess drops or swaps no word: each word of one is a word of the other, at least NPC_MATCH alike or one the
 *  start of the other (`Wall Walk`, `Wall Walking`), or the names differ only in their spacing (`Mana Bolt`, `Manabolt`);
 *  not `Improved Close Combat` and `Improved Sense`. */
const CONNECTORS = new Set(['to', 'of', 'the', 'and', 'in', 'on', 'for', 'with', 'a', 'an'])
/** A name's content words, singular, without its bracket and the connectors a name has. */
const contentWords = (n: string) =>
  matchKey(n.replace(/\s*\([^()]*\)$/, ''))
    .split(' ')
    .filter(w => !CONNECTORS.has(w))
function sameWords(a: string, b: string): boolean {
  const wa = contentWords(a),
    wb = contentWords(b)
  // (a word that differs from the other in letters alone is another word: `Agility` and `Ability`)
  const alike = (x: string, y: string) =>
    x === y || (nameRatio(x, y) >= NPC_MATCH && x.length !== y.length) || (Math.min(x.length, y.length) >= 4 && (x.startsWith(y) || y.startsWith(x)))
  const has = (w: string, list: string[]) => list.some(x => alike(w, x))
  const [ja, jb] = [wa.join(''), wb.join('')]
  return (wa.every(w => has(w, wb)) && wb.every(w => has(w, wa))) || ja === jb || (nameRatio(ja, jb) >= 0.9 && ja.length !== jb.length)
}
/** A power's catalog entry (the first kind with it; `Sapience digital assault`: the longest run of its first words that
 *  names one, the rest its parameters). A book's entry named with a bracket (`Heavy Scales (Western Drake)`, `Shift
 *  (Shifter add-on)`) is the bare name's when nothing else has it (the NPC's own book's first). */
export function findPower(
  c: Sr6Catalog,
  printed: string,
  name: string,
  kinds: Sr6Kind[],
  source?: string,
): { found?: ReturnType<typeof findEntry>; rest: string; ruled?: true } {
  const words = name.split(/\s+/).filter(Boolean),
    guessKinds = kinds.filter(k => !BY_NAME_ONLY.has(k)) // (a guess among the powers, never the qualities)
  for (const n of [printed, name]) {
    const found = findEntry(c, n, kinds, source, 'exact')
    if (found) return { found, rest: '' }
  }
  // (the books' shorthand `Improved Agility 2` is the CRB adept power Improved Physical Attribute, the attribute its detail; owner
  // 2026-10-22, never `Improved Ability (Skill)`)
  const physical = name.match(/^improved\s+(body|agility|reaction|strength)$/i)
  const power = physical && findEntry(c, 'Improved Physical Attribute', ['adeptpowers'], source)
  if (power) return { found: { entry: power.entry, match: { score: 1, how: 'fuzzy' } }, rest: physical[1], ruled: true }
  const key = normName(name),
    set = contentWords(name).sort().join(' ')
  const among = (kind: Sr6Kind, test: (e: Sr6Entry) => boolean) => [...c.entries[kind].values()].filter(test)
  const best = (list: Sr6Entry[], how: 'exact' | 'fuzzy') => ({ found: { entry: prefer(c, source)(list), match: { score: 1, how } }, rest: '' })
  // (the whole name, then its first words, by name)
  for (let k = words.length; k >= 1; k--) {
    const found = findEntry(c, words.slice(0, k).join(' '), kinds, source, 'exact')
    if (found) return { found, rest: words.slice(k).join(' ') }
  }
  // (an entry named with a bracket, `Heavy Scales (Western Drake)`, is the bare name's; each kind in its turn)
  for (const kind of kinds) {
    const named = among(kind, e => e.name !== name && normName(e.name.replace(/\s*\([^()]*\)$/, '')) === key)
    if (named.length) return best(named, 'exact')
  }
  // (then the same by a 75% guess, but not on one word of several)
  for (let k = words.length; k >= 1; k--) {
    if (k === 1 && words.length > 1) continue
    const part = words.slice(0, k).join(' '),
      found = findEntry(c, part, guessKinds, source, 'loose')
    if (found && sameWords(part, found.entry.name)) return { found, rest: words.slice(k).join(' ') }
  }
  // (the same words in another order, `Mystic Hardened Armor`, `Hardened Mystic Armor`: a guess, so never among the qualities)
  for (const kind of guessKinds) {
    const same = among(kind, e => contentWords(e.name).sort().join(' ') === set)
    if (same.length) return best(same, 'fuzzy')
  }
  return { rest: '' }
}

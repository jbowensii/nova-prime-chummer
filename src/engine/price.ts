// Nuyen pricing (CRB p.83). One price list for creation and advancement.
import type { Build, Catalog, Character, Item, ItemEntry, KnowledgeEntry, Pricing, TableFlags } from '../model/types'
import { evalFormula, formulaOf, type Formula } from './formula'
import { ATTRS } from '../model/types'
import { ampCtx, ampRating, sinnerFree } from './amps'

/** Attribute points from..to; the point that reaches the metatype max costs attrLastPoint. */
export function attrCost(p: Pricing, from: number, to: number, max: number): number {
  if (to < from) return -attrCost(p, to, from, max)
  let n = 0
  for (let pt = from + 1; pt <= to; pt++) n += pt === max ? p.attrLastPoint : p.attrPoint
  return n
}

/** Skill points from..to; points up to skillLowMax cost skillLow, higher ones skillHigh. */
export function skillCost(p: Pricing, from: number, to: number): number {
  if (to < from) return -skillCost(p, to, from)
  let n = 0
  for (let pt = from + 1; pt <= to; pt++) n += pt <= p.skillLowMax ? p.skillLow : p.skillHigh
  return n
}

/** An item's price: free starting gear, a GM's price, its catalog entry's cost formula (B: the standard price below),
 *  else the standard price for its kind from pricing.xml. `cat`: its catalog entry (default: the snapshot taken when
 *  picked). A formula that can't be worked out leaves the standard price (itemPrice says why). */
export function itemCost(p: Pricing, i: ItemEntry, cat: Item | undefined = i.snapshot): number {
  return itemPrice(p, i, cat).n
}

/** itemCost with its workings: the formula (B: `base`, the standard price), what it assumed, why it can't be worked out. */
export function itemPrice(
  p: Pricing,
  i: ItemEntry,
  cat: Item | undefined = i.snapshot,
): { n: number; base: number; formula?: Formula; notes: string[]; error?: string } {
  const std = standardCost(p, i)
  if (i.starting) return { n: 0, base: std, notes: [] }
  if (i.price != null) return { n: Math.max(0, i.price), base: std, notes: [] } // a GM price below 0 would pay the runner (validate.ts item.negativePrice)
  const f = formulaOf(cat?.formulas, 'cost')
  if (!f) return { n: std, base: std, notes: [] }
  const r = evalFormula(f, { B: std })
  return r.n === null ? { n: std, base: std, formula: f, notes: r.notes, error: r.error } : { n: Math.max(0, r.n), base: std, formula: f, notes: r.notes }
}

function standardCost(p: Pricing, i: ItemEntry): number {
  switch (i.kind) {
    case 'armor':
      return (i.armor ?? 0) * p.armorPoint
    case 'weapon':
      return i.specialist ? p.weaponSpecialist : p.weaponStandard
    case 'spell':
      return p.spell
    case 'complex-form':
      return p.complexForm
    default:
      return p.equipment
  }
}

/** The item's catalog entry: the live one, else its snapshot. */
export const catalogItem = (c: Catalog, i: ItemEntry) => (i.catalogId ? c.items.get(i.catalogId) : undefined) ?? i.snapshot

export interface Breakdown {
  attributes: number
  skills: number
  amps: number
  gear: number
  spells: number
}
export interface PriceBreakdown extends Breakdown {
  total: number
  budget: number
  remaining: number
}

export const attrMax = (c: Catalog, metatype: string, a: keyof Build['attributes']) => c.metatypes.get(metatype)?.ranges[a][1] ?? Infinity

/** Why an entry's free slot no longer holds ("Stealth below 4", "keyword “X” removed", an unknown slot), or null (it holds, or it
 *  has none). skillName: the skill's display name. */
export function slotLapse(b: Build, keywords: string[], k: KnowledgeEntry, skillName = (id: string) => id): string | null {
  if (k.from?.startsWith('skill:')) {
    const id = k.from.slice(6)
    return (b.skills.find(s => s.id === id)?.rating ?? 0) < 4 ? `${skillName(id)} below 4` : null
  }
  if (k.from?.startsWith('keyword:')) {
    const kw = k.from.slice(8)
    return keywords.some(x => x.trim() === kw) ? null : `keyword “${kw}” removed`
  }
  // (a slot neither a skill's nor a keyword's, a hand-edited file's: no free slot, so paid)
  return k.from ? `an unknown slot “${k.from}”` : null
}
/** The free native language: the first language entry marked native (one per runner). */
export const nativeLanguage = (b: Build) => b.knowledge.find(k => k.native && k.kind === 'language')
/** Paid: not the native language, and no free slot or a slot that no longer holds (its skill below 4, its keyword gone). */
export const knowledgePaid = (b: Build, keywords: string[], k: KnowledgeEntry) => k !== nativeLanguage(b) && (!k.from || slotLapse(b, keywords, k) !== null)

/** What each thing in a build costs, keyed as the ledger names it (career.ts diffBuild): attr:<a>, skill:<id> (its
 *  points), spec:<skill>:<spec>, knowledge:<row key>, amp:<uid>, item:<uid>. The parts add up to the build's price. */
export function priceParts(
  c: Catalog,
  b: Build,
  metatype: string,
  keywords: string[] = [],
  freeSinner = true,
): { key: string; cat: keyof Breakdown; price: number }[] {
  const p = c.pricing
  const magic = (i: { kind: string }) => i.kind === 'spell' || i.kind === 'complex-form'
  return [
    ...ATTRS.map(a => ({ key: `attr:${a}`, cat: 'attributes' as const, price: attrCost(p, 0, b.attributes[a] ?? 0, attrMax(c, metatype, a)) })),
    ...b.skills.flatMap(sk => [
      { key: `skill:${sk.id}`, cat: 'skills' as const, price: skillCost(p, 0, sk.rating) },
      ...sk.specs.map(sp => ({ key: `spec:${sk.id}:${sp}`, cat: 'skills' as const, price: p.spec })),
    ]),
    ...b.knowledge.map(k => ({
      key: `knowledge:${k.from ?? k.id ?? `${k.kind}:${k.name}`}`,
      cat: 'skills' as const,
      price: knowledgePaid(b, keywords, k) ? p.knowledge : 0,
    })),
    ...b.amps.map(a => ({ key: `amp:${a.uid}`, cat: 'amps' as const, price: ampRating(c, a, ampCtx(b, a, c, freeSinner)) * p.ampPoint })),
    ...b.items.map(i => ({ key: `item:${i.uid}`, cat: magic(i) ? ('spells' as const) : ('gear' as const), price: itemCost(p, i, catalogItem(c, i)) })),
  ]
}

export function priceBuild(c: Catalog, b: Build, metatype: string, keywords: string[] = [], freeSinner = true): Breakdown {
  const out: Breakdown = { attributes: 0, skills: 0, amps: 0, gear: 0, spells: 0 }
  for (const x of priceParts(c, b, metatype, keywords, freeSinner)) out[x.cat] += x.price
  return out
}

/** A character's priceParts as key -> price (keys that repeat add up). */
export function partPrices(c: Catalog, ch: Character, table?: TableFlags): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of priceParts(c, ch.build, ch.identity.metatype, ch.narrative.keywords, sinnerFree(ch, table))) m.set(x.key, (m.get(x.key) ?? 0) + x.price)
  return m
}

/** Price of the build against the level-of-play budget (+ a reopened runner's carry). */
export function price(c: Catalog, ch: Character, table?: TableFlags): PriceBreakdown {
  const b = priceBuild(c, ch.build, ch.identity.metatype, ch.narrative.keywords, sinnerFree(ch, table))
  const total = b.attributes + b.skills + b.amps + b.gear + b.spells
  // an NPC has no budget (budget 0, nothing remaining to overspend)
  if (ch.npc) return { ...b, total, budget: 0, remaining: 0 }
  const budget = c.levels.get(ch.level)?.nuyen ?? 0
  // a reopened runner's carry (career.ts reopen): what its earlier ledger held beyond budget - build price
  return { ...b, total, budget, remaining: budget - total + (ch.carry ?? 0) }
}

/** The book package as nuyen per category (a guide; nuyen may move between categories). */
export function packageGuide(c: Catalog, pkgId: string): Breakdown | undefined {
  const k = c.packages.get(pkgId)
  if (!k) return undefined
  const p = c.pricing
  return {
    attributes: k.attrPoints * p.attrPoint + k.attrAtMax * (p.attrLastPoint - p.attrPoint),
    skills: k.skillPoints * p.skillLow + k.skillsAtSix * (p.skillHigh - p.skillLow),
    amps: k.ampPoints * p.ampPoint,
    gear: k.armor * p.armorPoint + k.standardWeapons * p.weaponStandard + k.specialistWeapons * p.weaponSpecialist + k.equipment * p.equipment,
    spells: k.spells * p.spell,
  }
}

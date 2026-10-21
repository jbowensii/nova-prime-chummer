// Itemized creation budgets (a port of SR6 Forge's budgets.mjs): pure functions over a build, the catalog views
// (Sr6Data), the table's creation rules and the method's provider. Prices come from the catalog through bookValue (a
// <formula>, else the printed string read by rated());
// a value the app can't read counts 0 (priced().ok false, Review warns); an unset creation setting counts 0 (Review
// warns that it isn't set). Never NaN.
// The figures live in the modules re-exported here; this one holds the nuyen budget (purchases, lifestyles, SINs and
// licences, data structures, the karma turned into nuyen) and adds every budget at once.
import { SR6_ATTRS, sinName, type Sr6Attr, type Sr6Build, type Sr6Purchase, type Sr6Sin } from '../formats/domain/character'
import { flag, n0, type CreationRules } from '../table-setup/domain/creation'
import { MAGIC_KINDS, type Sr6Data } from '../catalog/domain/data'
import { normName } from '../catalog/domain/names'
import { pool, type Budget, type BudgetLine, type Provider } from './providers'
import { bookValue, dataFind } from '../catalog/domain/values'
import { entryLabel } from '../catalog/domain/categories'
import { entryOf, licenceFee, priced, purchaseTab } from './purchases'
import { essenceBudget } from './essence'
import { countPicks as count, dataStructureLevels, freeSpellSlots, powerPoints } from './magic'
import { skillSpend, knowledgePoints } from './skills'
import { contactPoints } from './contacts'
import { karmaBudget, nuyenPerKarma, toNuyen } from './karma'
import { runnerInfected } from './infected'

export type { Budget, BudgetLine } from './providers'
export * from './choices'
export * from './purchases'
export * from './bonuses'
export * from './attributes'
export * from './essence'
export * from './magic'
export * from './skills'
export * from './contacts'
export * from './karma'

export interface Sr6Budgets {
  attributePoints: Budget
  adjustmentPoints: Budget
  skillPoints: Budget
  karma: Budget
  nuyen: Budget
  /** magicLoss: the Magic or Resonance lost, 1 per started point of Essence spent (CRB p. 38) */
  essence: Budget & { magicLoss: number }
  /** cap: the most power points a mystic adept may buy (its priority Magic) */
  powerPoints: Budget & { cap: number }
  /** free spells and rituals (complex forms for a technomancer) */
  spellSlots: Budget
  contactPoints: Budget & { ratingCap: number; karma?: number }
  knowledgePoints: Budget
  /** point buy only */
  characterPoints?: Budget
}

const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A SIN's nuyen, at creation and in career alike: a fake one's rating × fakeSinPerRating (a real one comes with its
 *  quality, and a placeholder is real, so free) plus its licences' ratings × licencePerRating, but an owned item's licence
 *  on a real SIN at `fee` (its printed fee, by the item's uid; owner 2026-10-16). `price` reads a setting. */
export function sinCost(sin: Sr6Sin, price: (key: string) => number, fee?: (item: string) => number | undefined): number {
  let t = sin.kind === 'real' ? 0 : (sin.rating ?? 1) * price('fakeSinPerRating')
  for (const l of sin.licences) t += (sin.kind === 'real' && l.item !== undefined ? fee?.(l.item) : undefined) ?? l.rating * price('licencePerRating')
  return t
}

/** An owned line's name as shown: its catalog entry's, else the name it carries. */
export const purchaseName = (x: Sr6Purchase, data: Sr6Data) => {
  const e = entryOf(x, data)
  return e ? entryLabel(e) : (x.name ?? x.id ?? 'Custom item')
}

export function nuyenBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const breakdown: BudgetLine[] = []
  const add = (key: string, label: string, amount: number, tab: string) => {
    if (amount) breakdown.push({ key, label, amount: Math.round(amount), sign: 'spend', tab })
  }
  for (const x of b.purchases)
    add(
      `purchase:${x.uid}`,
      `${purchaseName(x, data)}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
      priced(x, data, cr).cost,
      purchaseTab(x, data),
    )
  // (an item's licence on a real SIN is its printed fee: sinCost)
  const fee = (uid: string) => {
    const x = b.purchases.flatMap(y => [y, ...y.accessories]).find(y => y.uid === uid)
    return x && licenceFee(x, data)
  }
  for (const sin of b.sins)
    for (const l of sin.lifestyles ?? []) {
      const e = data.entry('lifestyles', l.id)
      add(
        `lifestyle:${l.uid}`,
        `${e?.name ?? l.id} lifestyle × ${s(l.months, 'month')} (${sinName(sin)})`,
        (bookValue(e, 'cost', undefined, dataFind(data)).n ?? 0) * l.months,
        'contacts',
      )
    }
  for (const sin of b.sins) {
    const what = sin.placeholder ? 'placeholder' : sin.kind === 'real' ? 'real SIN' : `fake SIN, rating ${sin.rating ?? 1}`
    add(
      `sin:${sin.uid}`,
      `${sinName(sin)} (${what})${sin.licences.length ? ` · ${s(sin.licences.length, 'licence')}` : ''}`,
      sinCost(sin, k => n0(cr, k), fee),
      'contacts',
    )
  }
  // the owner's house rule (metatypeSizePricing, 2026-10-11): a troll-sized runner pays 10% more for everything bought, a
  // dwarf-sized one 10% more for armor; one line, so each item still shows its printed price
  const size = flag(cr, 'metatypeSizePricing') ? metatypeSize(data, b.metatype) : undefined
  if (size)
    add(
      'sizePricing',
      `${size === 'troll' ? 'Troll' : 'Dwarf'}-sized: 10% more on ${size === 'troll' ? 'everything bought' : 'armor'}`,
      b.purchases.filter(x => size === 'troll' || x.kind === 'armor').reduce((t, x) => t + priced(x, data, cr).cost, 0) * 0.1,
      'gear',
    )
  // Hack & Slash p. 72: a data structure is bought for its level times dataStructureNuyen
  add('dataStructures', 'Data structures bought', dataStructureLevels(b) * n0(cr, 'dataStructureNuyen'), 'magic')
  const karma = toNuyen(b, cr, data),
    converted = karma * (nuyenPerKarma(b, cr, data) ?? 0)
  if (converted) breakdown.push({ key: 'fromKarma', label: `${karma} karma turned into nuyen`, amount: converted, sign: 'gain', tab: 'contacts' })
  const spent = breakdown.filter(l => l.sign === 'spend').reduce((t, l) => t + l.amount, 0)
  return { ...pool(p.nuyen(b) + converted, spent), breakdown }
}

/** Whether the runner's metatype is troll- or dwarf-sized, by its name's words (metatypeSizePricing). ponytail: the core
 *  metatypes and their metavariants by name; a catalog `size` attribute would replace the list. */
export function metatypeSize(data: Pick<Sr6Data, 'metatypes'>, metatype: string): 'troll' | 'dwarf' | undefined {
  const words = normName(data.metatypes[metatype]?.name ?? '').split(' ')
  if (words.some(w => ['troll', 'trolls', 'cyclops', 'fomori', 'fomorian', 'giant', 'minotaur'].includes(w))) return 'troll'
  if (words.some(w => ['dwarf', 'dwarfs', 'dwarves', 'gnome', 'hanuman', 'koborokuru', 'menehune'].includes(w))) return 'dwarf'
  return undefined
}

/** Every budget, as the editor's budget panel shows them. */
export function allBudgets(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Sr6Budgets {
  const spend = (pool_: 'points' | 'adjust') => SR6_ATTRS.reduce((t, k) => t + b.attributes[k][pool_], 0)
  const k = MAGIC_KINDS[b.magic],
    slots = freeSpellSlots(b, data, cr, p)
  const cp = p.characterPoints?.(b)
  // the Sixth World Companion p. 104: an Infected type's free points, 2 physical and 2 mental, count as far as points are
  // spent on attributes of that group (never Edge, Magic or Resonance)
  const t = runnerInfected(b, data)?.t,
    group = (ks: Sr6Attr[]) => ks.reduce((n, k) => n + b.attributes[k].points, 0)
  const free = t ? Math.min(t.freePhysical, group(['bod', 'agi', 'rea', 'str'])) + Math.min(t.freeMental, group(['wil', 'log', 'int', 'cha'])) : 0
  return {
    attributePoints: pool(p.attributePoints(b) + free, spend('points')),
    adjustmentPoints: pool(p.adjustmentPoints(b), spend('adjust')),
    skillPoints: pool(p.skillPoints(b), skillSpend(b, cr, p.skillPoints(b), data).points),
    karma: karmaBudget(b, data, cr, p),
    nuyen: nuyenBudget(b, data, cr, p),
    essence: essenceBudget(b, data, cr),
    powerPoints: powerPoints(b, data, cr, p),
    spellSlots: pool(slots, k.resonance ? count(b, 'complexforms') : count(b, 'spells', 'rituals')),
    contactPoints: contactPoints(b, data, cr, p),
    knowledgePoints: knowledgePoints(b, data, cr, p),
    ...(cp ? { characterPoints: cp } : {}),
  }
}

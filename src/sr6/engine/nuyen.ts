// The nuyen budget: purchases, lifestyles, SINs and licences, data structures and the karma turned into nuyen.
import { sinName, type Sr6Build, type Sr6Purchase, type Sr6Sin } from '../model/character'
import { flag, n0, type CreationRules } from './creation'
import type { Sr6Data } from './data'
import { normName } from './names'
import { pool, type Budget, type BudgetLine, type Provider } from './providers'
import { bookValue, dataFind } from './values'
import { entryLabel } from './categories'
import { entryOf, priced, PURCHASE_TAB } from './purchases'
import { dataStructureLevels } from './magic'
import { nuyenPerKarma, toNuyen } from './karma'

const s = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A SIN's nuyen, at creation and in career alike: a fake one's rating × fakeSinPerRating (a real one comes with its
 *  quality, and a placeholder is real, so free) plus its licences' ratings × licencePerRating. `price` reads a setting. */
export function sinCost(sin: Sr6Sin, price: (key: string) => number): number {
  const own = sin.kind === 'real' ? 0 : (sin.rating ?? 1) * price('fakeSinPerRating')
  return own + (sin.licences.length ? sin.licences.reduce((t, l) => t + l.rating, 0) * price('licencePerRating') : 0)
}

const purchaseName = (x: Sr6Purchase, data: Sr6Data) => { const e = entryOf(x, data); return e ? entryLabel(e) : x.name ?? x.id ?? 'Custom item' }

export function nuyenBudget(b: Sr6Build, data: Sr6Data, cr: CreationRules, p: Provider): Budget {
  const breakdown: BudgetLine[] = []
  const add = (key: string, label: string, amount: number, tab: string) => { if (amount) breakdown.push({ key, label, amount: Math.round(amount), sign: 'spend', tab }) }
  for (const x of b.purchases)
    add(`purchase:${x.uid}`, `${purchaseName(x, data)}${x.rating ? ` (rating ${x.rating})` : ''}${x.qty > 1 ? ` × ${x.qty}` : ''}`,
      priced(x, data, cr).cost, PURCHASE_TAB[x.kind])
  for (const sin of b.sins) for (const l of sin.lifestyles ?? []) {
    const e = data.entry('lifestyles', l.id)
    add(`lifestyle:${l.uid}`, `${e?.name ?? l.id} lifestyle × ${s(l.months, 'month')} (${sinName(sin)})`,
      (bookValue(e, 'cost', undefined, dataFind(data)).n ?? 0) * l.months, 'contacts')
  }
  for (const sin of b.sins) {
    const what = sin.placeholder ? 'placeholder' : sin.kind === 'real' ? 'real SIN' : `fake SIN, rating ${sin.rating ?? 1}`
    add(`sin:${sin.uid}`, `${sinName(sin)} (${what})${sin.licences.length ? ` · ${s(sin.licences.length, 'licence')}` : ''}`, sinCost(sin, k => n0(cr, k)), 'contacts')
  }
  // the owner's house rule (metatypeSizePricing, 2026-10-11): a troll-sized runner pays 10% more for everything bought, a
  // dwarf-sized one 10% more for armor; one line, so each item still shows its printed price
  const size = flag(cr, 'metatypeSizePricing') ? metatypeSize(data, b.metatype) : undefined
  if (size) add('sizePricing', `${size === 'troll' ? 'Troll' : 'Dwarf'}-sized: 10% more on ${size === 'troll' ? 'everything bought' : 'armor'}`,
    b.purchases.filter(x => size === 'troll' || x.kind === 'armor').reduce((t, x) => t + priced(x, data, cr).cost, 0) * 0.1, 'gear')
  // Hack & Slash p. 72: a data structure is bought for its level times dataStructureNuyen
  add('dataStructures', 'Data structures bought', dataStructureLevels(b) * n0(cr, 'dataStructureNuyen'), 'magic')
  const karma = toNuyen(b, cr), converted = karma * (nuyenPerKarma(b, cr, data) ?? 0)
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

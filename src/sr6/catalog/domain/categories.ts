// An item's category is the title of the table it is printed in (docs/sr6-data-format/categories.md, Categories): the importer
// writes it on each row (`category="Cyberlimb"`) and one record per category in categories.xml, which links an accessory
// category to the hosts it fits (`Cyberlimb accessory` fits `Cyberlimb`). A row whose printed name needs its category
// (a bare part: `Arm (synthetic)`) carries `group`; the app shows `Cyberlimb: Arm (synthetic)`. The printed name stays
// the entry's name.
import type { Sr6Entry, Sr6Kind } from '../../formats/domain/types'
import { normName } from './names'
import { rated } from './values'
import { structureOf } from './structure'

/** How a catalog entry is named in lists, pickers, Review, the ledger, sheets and exports: its category first when its
 *  own name needs it. */
export const entryLabel = (e: Pick<Sr6Entry, 'name' | 'attrs'>): string => (e.attrs.group ? `${e.attrs.group}: ${e.name}` : e.name)

/** What a search matches: the printed name, the category and the two together, the maker, the other names. */
export const entrySearch = (e: Pick<Sr6Entry, 'name' | 'attrs' | 'aliases'>): string =>
  [e.name, e.attrs.group && `${e.attrs.group}: ${e.name}`, e.attrs.group && `${e.attrs.group} ${e.name}`, e.attrs.category, e.attrs.maker, ...(e.aliases ?? [])]
    .filter(Boolean)
    .join(' | ')

/** A word's singular, roughly (as the importer's formula._stem). */
const stem = (w: string) =>
  w.endsWith('ies') && w.length > 4
    ? `${w.slice(0, -3)}y`
    : /(?:x|ss|ch|sh)es$/.test(w)
      ? w.slice(0, -2)
      : w.endsWith('s') && !w.endsWith('ss') && w.length > 3
        ? w.slice(0, -1)
        : w
/** A category as its words compare: `cyberlimb accessories` and `Cyberlimb accessory` are one. */
export const catKey = (s: string | undefined) =>
  normName(s ?? '')
    .split(' ')
    .filter(Boolean)
    .map(stem)
    .join(' ')

/** A host named by a kind's or an augmentation type's own word (`Weapon accessories` fit every weapon). */
const KIND_WORDS: Record<string, Sr6Kind> = {
  weapon: 'weapons',
  armor: 'armor',
  armour: 'armor',
  vehicle: 'vehicles',
  drone: 'vehicles',
  device: 'electronics',
  electronic: 'electronics',
  commlink: 'electronics',
  cyberdeck: 'electronics',
  augmentation: 'augmentations',
  implant: 'augmentations',
  cyberware: 'augmentations',
  bioware: 'augmentations',
  geneware: 'augmentations',
  nanoware: 'augmentations',
  gear: 'gear',
  program: 'programs',
  ammunition: 'ammotypes',
}
const TYPE_WORDS = new Set(['cyberware', 'bioware', 'geneware', 'nanoware'])

/** The categories' records by `<kind>|<category key>`, the latest loaded last (a source's own first, see categoryOf). */
export function categoryIndex(records: Iterable<Sr6Entry>): Map<string, Sr6Entry[]> {
  const out = new Map<string, Sr6Entry[]>()
  for (const r of records) {
    const k = `${r.attrs.of}|${catKey(r.name)}`
    out.set(k, [...(out.get(k) ?? []), r])
  }
  return out
}

/** The record of an entry's category: its own source's, else any. */
export function categoryOf(index: Map<string, Sr6Entry[]>, e: Sr6Entry): Sr6Entry | undefined {
  const rs = index.get(`${e.kind}|${catKey(e.attrs.category)}`) ?? []
  return rs.find(r => r.source === e.source) ?? rs[0]
}

/** The hosts an accessory's category fits ("Cyberlimb"), [] when it is no accessory (or its category has no record). */
export const hostsOf = (index: Map<string, Sr6Entry[]>, acc: Sr6Entry): string[] =>
  (categoryOf(index, acc)?.attrs.fits ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)

/** Whether an accessory fits a host item: its category's `fits` names the host's exact category, or the host's kind or
 *  augmentation type by its own word. null when the accessory's category names no host (nothing to check). */
export function fitsHost(index: Map<string, Sr6Entry[]>, acc: Sr6Entry, host: Sr6Entry): boolean | null {
  const slots = structureOf(acc).fits
  if (slots.length) return slots.some(id => structureOf(host).slots.some(s => s.id === id))
  const hosts = hostsOf(index, acc)
  if (!hosts.length) return null
  return hosts.some(h => {
    const k = catKey(h)
    return k === catKey(host.attrs.category) || (KIND_WORDS[k] === host.kind && (!TYPE_WORDS.has(k) || host.attrs.type === k))
  })
}

/** The capacity a host item has at its rating (`8`, `Rating × 2`), null when it prints none or the app can't read it. */
export function capacityOf(e: Sr6Entry | undefined, rating = 1): number | null {
  const c = e?.attrs.capacity
  if (!c || /^\s*\[/.test(c)) return null
  const v = rated(c, rating)
  return v.ok ? v.n : null
}

/** The capacity an accessory takes from its host: its bracketed capacity (`[2]`, `[Rating]`) at its rating; 0 without one. */
export function capacityUsed(e: Sr6Entry | undefined, rating = 1): number {
  const m = /^\s*\[(.*)\]\s*$/.exec(e?.attrs.capacity ?? '')
  const v = m ? rated(m[1], rating) : null
  return v?.ok && v.n !== null ? v.n : 0
}

/** An ammunition type fitted to an ammunition line (CRB p. 261: Explosive, APDS, Gel …; priced as a multiple of it): an
 *  ammotypes entry that is no material (isMaterial) and no ammunition of its own (a Silver Arrow, class AMMUNITION/…). */
export const isAmmoType = (e?: Sr6Entry) => e?.kind === 'ammotypes' && !isMaterial(e) && !/^AMMUNITION\//i.test(e.attrs.class ?? '')

/** An ammunition material (Bestial Nature p. 36: `x2 for copper or other common materials, x5 for silver or other
 *  semi-precious materials, x10 for gold or other precious materials`): the importer's material add-on, an ammunition
 *  type priced as a multiple of the ammunition it is loaded in (catalog.py variants: its cost formula is `H*N`). */
export const isMaterial = (e?: Sr6Entry) => e?.kind === 'ammotypes' && !!e.formulas?.some(f => f.field === 'cost' && /\bH\b/.test(f.expr))

/** Shared remaining-capacity calculation; unknown capacity stays unbounded. */
export function capacityRemaining(host: Sr6Entry | undefined, accessories: { entry?: Sr6Entry; rating?: number; qty?: number }[], rating = 1): number | null {
  const max = capacityOf(host, rating)
  return max === null ? null : max - accessories.reduce((sum, a) => sum + capacityUsed(a.entry, a.rating) * (a.qty ?? 1), 0)
}

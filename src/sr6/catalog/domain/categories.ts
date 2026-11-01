// An item's category is the title of the table it is printed in (docs/sr6-data-format/categories.md, Categories): the importer
// writes it on each row (`category="Cyberlimb"`) and one record per category in categories.xml, which links an accessory
// category to the hosts it fits (`Cyberlimb accessory` fits `Cyberlimb`). A row whose printed name needs its category
// (a bare part: `Arm (synthetic)`) carries `group`; the app shows `Cyberlimb: Arm (synthetic)`. The printed name stays
// the entry's name.
import type { Sr6Entry, Sr6Kind } from '../../formats/domain/types'
import { normName } from './names'
import { rated } from './values'
import { enhancementFits, fit, fitsOnly, structureOf, type Slot } from './structure'

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

/** A host named by a kind's or an augmentation type's own word (`Weapon accessories` fit every weapon): kept only for an
 *  entry Commlink6 has no record of (no `usage`, no `<fits>`: book-only; owner ruling 2026-10-29). */
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

/** Whether an accessory fits a host item. One that declares usages (`<fits>`) fits by hook alone (fit plan I1: the host,
 *  with the instance's `extra` hooks less `removed`, offers one of them). A Commlink6 item enhancement (`usage=
 *  "enhancement"`) fits a host its requirements' item type/subtype accept; a Commlink6 stand-alone item (`usage=
 *  "carried"`) fits none. Any other fits a host of the exact category its category record names, or, when Commlink6 has
 *  no record of it (book-only), of the kind its word names. null when it declares nothing (nothing to check). Owner
 *  rulings 2026-10-29. */
export function fitsHost(index: Map<string, Sr6Entry[]>, acc: Sr6Entry, host: Sr6Entry, extra: Slot[] = [], removed: string[] = []): boolean | null {
  if (structureOf(acc).usages.length) {
    const f = fit(host, acc, [], 1, extra, removed)
    return f.ok !== false || f.reason === 'room'
  }
  if (acc.attrs.usage === 'enhancement') return enhancementFits(acc, host)
  if (acc.attrs.usage === 'carried') return false
  const hosts = hostsOf(index, acc)
  if (!hosts.length) return null
  return hosts.some(h => {
    const k = catKey(h)
    return k === catKey(host.attrs.category) || (KIND_WORDS[k] === host.kind && (!TYPE_WORDS.has(k) || host.attrs.type === k))
  })
}
/** Whether the picker offers `e` as an accessory of `host`. An entry that fits the host (fitsHost) is offered. One that
 *  is fitted only (an embedded usage of its own: fitsOnly) or has a category, and does not fit, never is: it belongs to
 *  other hosts (a weapon's flashlight on a pair of cyberears). Only an entry that declares neither (a pre-categories
 *  import) falls through, by `filter`, and not to a host whose own accessories are slot-based. With no `filter` (a line
 *  that takes any gear, a vehicle's) the entry is offered when it is no accessory (`isAccessory`) and is not fitted only. */
export function offeredOn(
  index: Map<string, Sr6Entry[]>,
  e: Sr6Entry,
  host: Sr6Entry | undefined,
  filter: ((e: Sr6Entry) => boolean) | undefined,
  isAccessory: (e: Sr6Entry) => boolean,
  extra: Slot[] = [],
  removed: string[] = [],
): boolean {
  if (host && fitsHost(index, e, host, extra, removed) === true) return true
  const s = structureOf(e)
  // a mod-only item (CL6 modonly="true": a spare clip, a core vehicle mod) exists only embedded in a host — never
  // offered standalone, only through the fitsHost path above.
  if (s.modOnly) return false
  const declared = fitsOnly(s)
  if (!filter) return !isAccessory(e) && !declared
  return !declared && !categoryOf(index, e) && !(host && structureOf(host).slots.length > 0) && filter(e)
}
/** The capacity a host item has at its rating (`8`, `Rating × 2`), null when it prints none or the app can't read it. */
export function capacityOf(e: Sr6Entry | undefined, rating = 1): number | null {
  const c = e?.attrs.capacity
  if (!c || /^\s*\[/.test(c)) return null
  // a ranged capacity (glasses `1–4`, rating 1–4) means the capacity equals the chosen rating: CL6 fills it by capacity
  // points, so a Capacity-3 pair of glasses holds enhancements whose [cost]s sum to 3. Clamp the rating into the range.
  const range = /^\s*(\d+)\s*[–-]\s*(\d+)\s*$/.exec(c)
  if (range) return Math.min(Math.max(rating, +range[1]), +range[2])
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

/** A base ammunition line (CRB p. 261: `Ammo by weapon type`, priced per 10 rounds): a gear entry an ammunition type is fitted to. */
/** Designer fashion (owner ruling 2026-10-25): any armor entry with a `fashion` slot of its own data. The FASHION hook
 *  Commlink6's code gives every body armor with a Social rating (rule F) is not one. */
export const isDesignerFashion = (e?: Sr6Entry) => e?.kind === 'armor' && structureOf(e).slots.some(s => s.id === 'fashion' && s.rule !== 'F')
/** Whether N of an item are ONE line with a count (the rest are one line each, with their own accessories or levels).
 *  Decided per ITEM, not per kind: gear/electronics/programs/ammotypes stack (except foci, each individually bound);
 *  weapons stack only when they are expendable (grenades, explosives, rockets/missiles: class AMMUNITION/*; thrown
 *  weapons: class WEAPON_RANGED/THROWING); firearms and melee weapons (which take accessories), armor, augmentations,
 *  vehicles and critters never do. `e` is undefined for a custom line (it stacks only by kind). */
export function stacks(kind: string, e?: Sr6Entry): boolean {
  if (kind === 'weapons') return /^AMMUNITION\/|^WEAPON_RANGED\/THROWING$/i.test(e?.attrs.class ?? '')
  if (kind === 'gear' && /foci|focus/i.test(e?.attrs.category ?? '')) return false
  return kind === 'electronics' || kind === 'programs' || kind === 'gear' || kind === 'ammotypes'
}
/** Explosives and demolitions (CRB pp. 264-271): explosive packages, grenades, rockets and missiles, detonator caps; whatever
 *  kind they are catalogued as (weapons, gear), from every book. Not the base ammunition lines (isAmmoGear). */
export const isExplosive = (e?: Sr6Entry) =>
  (e?.kind === 'weapons' || e?.kind === 'gear') && /^AMMUNITION\/(EXPLOSIVES|GRENADES|ROCKETS)$/i.test(e.attrs.class ?? '')
/** Where an explosive is filed in a picker: explosive packages (by type, at a rating), detonators and triggers, grenades,
 *  rockets and missiles. */
export const explosiveGroup = (e: Sr6Entry) =>
  /GRENADES$/i.test(e.attrs.class ?? '')
    ? 'Grenades'
    : /ROCKETS$/i.test(e.attrs.class ?? '')
      ? 'Rockets & missiles'
      : /detonator|trigger/i.test(`${e.name} ${e.attrs.category ?? ''}`)
        ? 'Detonators & triggers'
        : 'Explosives'

/** The major category of a gear entry (~130 vendor-named categories fold into ten): first matching rule wins. */
const GEAR_GROUPS: [string, RegExp][] = [
  ['Ammunition', /ammo|ammunition|arrow|bolt shaft|mortar bomb/i],
  [
    'Vehicle & drone parts',
    /vehicle|chassis|powertrain|propulsion|skin mod|trailer|drone|weapon mount|naval|cannon|mortar|laser|grapple|facility|rack|storage|mechanical arm/i,
  ],
  ['Software & Matrix', /software|app$|\bapp\b|codemod|\bic\b|hack|tag abuse|bbs|library|agent|coding|relay|formula|ripjack|btl/i],
  [
    'Electronics & commlinks',
    /electronic|commlink|sensor|cyberdeck|data tap|visual|audio|optical|rfid|credstick|badgecam|internal component|case |faraday|identification|id and credit|communication|scanner|printing|cyberkit/i,
  ],
  ['Medical, drugs & chemicals', /drug|toxin|poison|medical|chemical|dmso|perfume|rescue/i],
  ['Biotech & nanotech', /biotech|nano|colony|bacteria|chimera|cyberette|critter|cybertech/i],
  ['Magic supplies & foci', /foci|focus|prepar|awakened|magic|alchem|astral|shifter|inhibitor/i],
  ['Security, B&E & espionage', /security|restraint|breaking|disguise|espionage|interrogation|brick/i],
  [
    'Survival, tools & clothing',
    /survival|supply|standard equipment|outfitting|clothing|tool|kit|equipment|instrument|spare|tent|fashion|accessory|spacesuit|ceramic/i,
  ],
]
export const gearGroupOf = (e: Sr6Entry): string =>
  isExplosive(e) ? explosiveGroup(e) : (GEAR_GROUPS.find(([, r]) => r.test(e.attrs.category ?? ''))?.[0] ?? 'Miscellaneous gear')
export const isAmmoGear = (e?: Sr6Entry) => e?.kind === 'gear' && /ammo by weapon/i.test(e.attrs.category ?? '')

/** An ammunition material (Bestial Nature p. 36: `x2 for copper or other common materials, x5 for silver or other
 *  semi-precious materials, x10 for gold or other precious materials`): the importer's material add-on, an ammunition
 *  type priced as a multiple of the ammunition it is loaded in (catalog.py variants: its cost formula is `H*N`). */
export const isMaterial = (e?: Sr6Entry) => e?.kind === 'ammotypes' && !!e.formulas?.some(f => f.field === 'cost' && /\bH\b/.test(f.expr))

/** Shared remaining-capacity calculation; unknown capacity stays unbounded. */
export function capacityRemaining(host: Sr6Entry | undefined, accessories: { entry?: Sr6Entry; rating?: number; qty?: number }[], rating = 1): number | null {
  const max = capacityOf(host, rating)
  return max === null ? null : max - accessories.reduce((sum, a) => sum + capacityUsed(a.entry, a.rating) * (a.qty ?? 1), 0)
}

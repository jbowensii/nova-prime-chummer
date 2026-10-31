// SURGE (Sixth World Companion pp. 116-129), as Commlink6 1.14.0 handles it (CommonQualityGenerator, the SURGE wizard page):
// - the metagenic qualities a player picks add up their printed Karma, positive and negative alike (CL6 sums Quality.karma ×
//   level of every metagenic quality not auto-added: calculateKarmaSURGE); over 30 is a stopper (spentMoreThan30SURGE);
// - a SURGE collective (a quality set, CL6 SetItem) costs its own Karma and gives its qualities free (auto-added: they
//   neither cost nor count toward the 30). One collective a runner (Shadowrun6Character.getSurgeCollective).
import { newId } from '../../../../core/shared/types'
import type { Sr6Build } from '../../../formats/domain/character'
import type { Sr6Entry } from '../../../formats/domain/types'
import type { Sr6Data } from '../../../catalog/domain/data'
import { normName } from '../../../catalog/domain/names'
import { flag, type CreationRules } from '../../../table-setup/domain/creation'
import { baseMetatype } from './infected'

/** The most Karma on metagenic qualities (CL6's fixed 30). */
export const SURGE_CAP = 30

/** A metagenic quality: one Commlink6 types METAGENIC (`class="METAGENIC"`, the importer's to write). */
export const isMetagenic = (e: Sr6Entry | undefined): boolean => !!e && e.kind === 'qualities' && /^METAGENIC\b/.test(e.attrs.class ?? '')

/** Karma on the metagenic qualities the player picked (CL6 calculateKarmaSURGE: the printed Karma, × the level of one with
 *  levels; a collective's free ones not counted). */
export const surgeKarma = (b: Sr6Build, data: Sr6Data) =>
  b.qualities
    .filter(q => !q.free && isMetagenic(data.entry('qualities', q.id)))
    .reduce((t, q) => {
      const v = data.qualities[q.id]
      return t + Math.abs(v?.karma ?? 0) * (v?.perLevel ? q.level : 1)
    }, 0)

/** The SURGE collectives (the catalog's quality sets). */
export const collectives = (data: Sr6Data) => data.kindEntries?.('qualitysets') ?? []
/** A collective's choice (Raptor: Feathers or Unusual Hair): its `<selection type="QUALITY" options>`, Commlink6 ids. */
export const collectiveOptions = (e: Sr6Entry | undefined): string[] =>
  (e?.parts.find(p => p.tag === 'selection' && p.attrs.type === 'QUALITY')?.attrs.options ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

/** The catalog quality a collective's Commlink6 id names: the set's book's `<book>.<id>` (underscores as hyphens), else its
 *  quality of that name, a `_metagenetic` suffix (CL6's twin of a core quality) dropped. */
export function collectiveQuality(data: Sr6Data, set: Sr6Entry, ref: string): string | undefined {
  const book = set.id.split('.')[0]
  for (const r of [ref, ref.replace(/_metagenetic$/, '')]) {
    const id = `${book}.${r.replace(/_/g, '-')}`
    if (data.qualities[id]) return id
    const key = normName(r.replace(/_/g, ' '))
    const named = Object.values(data.qualities).find(q => q.id.startsWith(`${book}.`) && normName(q.name) === key)
    if (named) return named.id
  }
  return undefined
}

/** What a collective gives: its qualities' Commlink6 ids (`<modifier kind="itemmod" type="QUALITY" ref>`), its choice's
 *  options left out but the one chosen, each with the catalog quality it names (none: not found). */
export function collectiveGrants(data: Sr6Data, set: Sr6Entry, choice?: string): { ref: string; id?: string }[] {
  const opts = collectiveOptions(set)
  const refs = set.parts
    .filter(p => p.tag === 'modifier' && p.attrs.kind === 'itemmod' && p.attrs.type === 'QUALITY' && p.attrs.ref !== 'CHOICE' && !opts.includes(p.attrs.ref))
    .map(p => p.attrs.ref)
  if (choice && opts.includes(choice)) refs.push(choice)
  return [...new Set(refs)].map(ref => ({ ref, id: collectiveQuality(data, set, ref) }))
}

/** The runner's collective's Karma (its printed `karma`; none: 0). */
export const collectiveKarma = (b: Sr6Build, data: Sr6Data) => Math.abs(Number(data.entry('qualitysets', b.surgeCollective ?? '')?.attrs.karma) || 0)

/** Take a collective (id; undefined: none) and its choice: the old one's free qualities go, the new one's come free. */
export function setCollective(b: Sr6Build, data: Sr6Data, id: string | undefined, choice?: string): void {
  dropGrants(b, data)
  b.surgeCollective = id || undefined
  b.surgeChoice = id && choice ? choice : undefined
  addGrants(b, data)
}
/** The collective's free qualities taken off (before a change, or a metatype change that redoes the free traits). */
export function dropGrants(b: Sr6Build, data: Sr6Data): void {
  const set = data.entry('qualitysets', b.surgeCollective ?? '')
  if (!set) return
  const ids = new Set(collectiveGrants(data, set, b.surgeChoice).map(g => g.id))
  b.qualities = b.qualities.filter(q => !(q.free && ids.has(q.id)))
}
/** The collective's qualities added free (each once). */
export function addGrants(b: Sr6Build, data: Sr6Data): void {
  const set = data.entry('qualitysets', b.surgeCollective ?? '')
  if (!set) return
  for (const g of collectiveGrants(data, set, b.surgeChoice))
    if (g.id && !b.qualities.some(q => q.free && q.id === g.id))
      b.qualities.push({ uid: newId(), id: g.id, level: 1, free: true, name: data.qualities[g.id]?.name })
}

/** Whether the collective fits the runner's metatype (CL6's METATYPE requirement; our set's `metatypes`, names): none listed,
 *  any. */
export function collectiveFits(b: Sr6Build, data: Sr6Data): boolean {
  const set = data.entry('qualitysets', b.surgeCollective ?? '')
  const list = (set?.attrs.metatypes ?? '')
    .split(',')
    .map(s => normName(s))
    .filter(Boolean)
  // (a metavariant counts as its base metatype: owner ruling 2026-10-31; Hobgoblin is an ork)
  return !list.length || [data.metatypes[b.metatype]?.name ?? '', baseMetatype(data, b.metatype)].some(n => list.includes(normName(n)))
}
/** The table's SURGE setting (allowSurge, default on): off, no metagenic quality or collective at creation. */
export const surgeAllowed = (cr: CreationRules) => flag(cr, 'allowSurge') ?? true

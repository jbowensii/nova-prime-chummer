// An SR6 catalog entry as one row (Game data's browser and the editor's hover card, src/ui/EntryHover.tsx): its printed
// values, its formulas with their values over its ratings, its cell notes and other names, its effects (applied, or shown
// only: switchable, conditional or read with low confidence), source and page, issues, and an Edited or House mark.
import type { ReactNode } from 'react'
import { EditedMark } from '../../ui/EditEntry'
import type { BrowseRow } from '../../ui/CatalogBrowser'
import { EntryHover, type CardEffect } from '../../ui/EntryHover'
import { entryLabel, entrySearch } from '../engine/categories'
import { catalogFind } from '../engine/load'
import type { Find } from '../engine/values'
import { SR6_ATTRS, type Sr6Attr, type Sr6Character, type Sr6Purchase } from '../model/character'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../model/types'
import { ATTR_NAMES, useSr6Editor } from './editor'
import { formulaShown } from './Picker'

const DERIVED: Record<string, string> = { defense: 'Defense Rating', initiative: 'Initiative', composure: 'Composure', 'judge-intentions': 'Judge Intentions',
  memory: 'Memory', social: 'Social Rating' }
const cap = (s: string) => s.replace(/(^|[ -])\w/g, m => m.toUpperCase()).replace(/-/g, ' ')
/** `attr:agi` -> Agility, `skill:close-combat` -> Close Combat dice, `derived:defense` -> Defense Rating, `item:ar` ->
 *  its Attack Ratings */
function targetName(t: string): string {
  const [k, v = ''] = t.split(':')
  if (k === 'attr' && (SR6_ATTRS as string[]).includes(v)) return ATTR_NAMES[v as Sr6Attr]
  if (k === 'skill') return `${cap(v)} dice`
  if (k === 'pool') return `${ATTR_NAMES[v as Sr6Attr] ?? v} tests' dice`
  if (k === 'derived') return DERIVED[v] ?? cap(v)
  if (k === 'item') return v === 'ar' ? 'its Attack Ratings (close to extreme)' : `its ${v}`
  return t
}

/** What an entry's <effect> parts do, as the hover card and Game data show them. */
export function effectsOf(e: Sr6Entry): CardEffect[] {
  return e.parts.filter(p => p.tag === 'effect').map(({ attrs: a }) => {
    const v = a.value === 'R' ? 'rating' : a.value, sign = /^[-–]/.test(v) ? '' : '+'
    const text = a.op === 'edge-cost' ? `Edge boosts and actions cost ${v.replace(/^[-–]/, '')} less on ${targetName(a.target).replace(/ dice$/, '')} tests`
      : `${sign}${v} ${targetName(a.target)}`
    const how = a.switch && a.switch !== 'conditional' ? `${a.switch}: ` : ''
    return { text: `${how}${text}`, state: a.confidence === 'low' ? (a.switch && a.switch !== 'conditional' ? 'conditional' : 'low') : 'applied' }
  })
}

/** "category zappers · dv 3P · cost Rating × 50": an entry's printed values, then its formulas with their values over its
 *  ratings ("cost = Rating × 50¥ (50–200¥)"), its cell notes and other names. */
const details = (e: Sr6Entry, find: Find) => [...Object.entries(e.attrs).map(([k, v]) => `${k} ${v}`),
  ...(e.formulas ?? []).map(f => `${f.field} = ${formulaShown(e, f.field, find)}`),
  ...(e.notes ?? []).map(x => `${x.field} note: ${x.text}`), ...(e.aliases?.length ? [`also ${e.aliases.join(', ')}`] : []),
  ...(e.parts.some(p => p.tag === 'spec') ? [`specializations ${e.parts.filter(p => p.tag === 'spec').map(p => p.text || p.attrs.name).join(', ')}`] : [])].join(' · ')

/** The entry as one row: Game data's (which adds its sub-category and Edit button) and the hover card's. */
export function sr6Row(c: Sr6Catalog, e: Sr6Entry, find: Find = catalogFind(c)): BrowseRow {
  const house = c.sources.get(e.source)?.compendium
  return { key: e.id, name: entryLabel(e), search: entrySearch(e), source: e.source, page: e.page, details: details(e, find), text: e.text,
    issues: e.issues, effects: effectsOf(e), marks: <>{e.edited && <EditedMark />}{house && <span className="noncanon">House</span>}</> }
}

/** `children` naming an entry of the runner's catalog, with its card on hover, focus or tap (none when it's gone). */
export function Sr6Ref({ kind, id, children, open, tabbable }: { kind: Sr6Kind; id?: string; children: ReactNode; open?: boolean; tabbable?: boolean }) {
  const { c } = useSr6Editor()
  const e = id ? c.entries[kind]?.get(id) : undefined
  return <EntryHover row={e && (() => sr6Row(c, e))} kind={SR6_KINDS[kind].label} open={open} tabbable={tabbable}>{children}</EntryHover>
}

/** The catalog entry a Review line's path names (`augmentations.<uid>`, `qualities.<uid>`, `magic.<uid>`,
 *  `skills.<id>`): a line, quality or pick by its uid, a skill by its id; none for a path naming no entry. */
export function entryOfPath(ch: Sr6Character, path: string): { kind: Sr6Kind; id: string } | undefined {
  const [head, key] = path.split('.')
  if (!key) return undefined
  const lines = (xs: Sr6Purchase[]): Sr6Purchase[] => xs.flatMap(x => [x, ...lines(x.accessories)])
  const x = lines(ch.build.purchases).find(p => p.uid === key)
  if (x?.id) return { kind: x.kind, id: x.id }
  const q = ch.build.qualities.find(q => q.uid === key) ?? ch.build.picks.find(p => p.uid === key)
  if (q) return { kind: 'kind' in q ? q.kind : 'qualities', id: q.id }
  return head === 'skills' ? { kind: 'skills', id: key } : undefined
}

/** A picker item's card (src/ui/bits.tsx PickItem): the entry's row, made when shown. */
export function cardOf(c: Sr6Catalog, kind: Sr6Kind, id: string): { card?: () => BrowseRow; cardKind?: string } {
  const e = c.entries[kind]?.get(id)
  return e ? { card: () => sr6Row(c, e), cardKind: SR6_KINDS[kind].label } : {}
}

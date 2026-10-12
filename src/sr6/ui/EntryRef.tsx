// An SR6 catalog entry as one row (Game data's browser and the editor's hover card, src/ui/EntryHover.tsx): its printed
// values, its formulas with their values over its ratings, its cell notes and other names, its effects (applied, or shown
// only: switchable, conditional or read with low confidence), source and page, issues, and an Edited or House mark.
import type { ReactNode } from 'react'
import { EditedMark } from '../../ui/EditEntry'
import type { BrowseRow, CardEffect } from '../../ui/types'
import { EntryHover } from '../../ui/EntryHover'
import { entryLabel, entrySearch } from '../engine/categories'
import { catalogFind, resolveEntry } from '../engine/load'
import { formulaRange, type Find } from '../engine/values'
import { formulaOf, formulaText } from '../../engine/formula'
import { type Sr6Advance, type Sr6Attr, type Sr6Character, type Sr6Purchase } from '../model/character'
import { effectState, effectText } from '../engine/effects'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../model/types'
import { ATTR_NAMES, n, useSr6Editor, type Sr6Ctx } from './editor'
import { attrMax, bonusSources, bracketNotes } from '../engine/budgets'
import { br } from '../print/view'

/** A field's formula and its values over the ratings the entry comes in: "Rating × 200¥ (200–1,200¥)", "(unpriced)"
 *  when it can't be worked out; undefined without a formula. (The picker shows it too.) */
export function formulaShown(e: Sr6Entry, field: string, find?: Find): string | undefined {
  const f = formulaOf(e.formulas, field)
  if (!f) return undefined
  const r = formulaRange(e, field, find),
    u = field === 'cost' ? '¥' : ''
  return `${formulaText(f, e.attrs[field])} (${!r ? 'unpriced' : r[0] === r[1] ? `${n(r[0])}${u}` : `${n(r[0])}–${n(r[1])}${u}`})`
}

/** What an entry's <effect> and <link> parts do (effects.ts effectText), as the hover card and Game data show them. */
export function effectsOf(e: Sr6Entry): CardEffect[] {
  return e.parts.filter(p => p.tag === 'effect' || p.tag === 'link').map(p => ({ text: effectText(p), state: effectState(p) }))
}

/** "category zappers · dv 3P · cost Rating × 50": an entry's printed values, then its formulas with their values over its
 *  ratings ("cost = Rating × 50¥ (50–200¥)"), its cell notes and other names. */
const details = (e: Sr6Entry, find: Find) =>
  [
    ...Object.entries(e.attrs).map(([k, v]) => `${k} ${v}`),
    ...(e.formulas ?? []).map(f => `${f.field} = ${formulaShown(e, f.field, find)}`),
    ...(e.notes ?? []).map(x => `${x.field} note: ${x.text}`),
    ...(e.aliases?.length ? [`also ${e.aliases.join(', ')}`] : []),
    ...(e.parts.some(p => p.tag === 'spec')
      ? [
          `specializations ${e.parts
            .filter(p => p.tag === 'spec')
            .map(p => p.text || p.attrs.name)
            .join(', ')}`,
        ]
      : []),
  ].join(' · ')

/** The entry as one row: Game data's (which adds its sub-category and Edit button) and the hover card's. */
export function sr6Row(c: Sr6Catalog, e: Sr6Entry, find: Find = catalogFind(c)): BrowseRow {
  const house = c.sources.get(e.source)?.compendium
  return {
    key: e.id,
    name: entryLabel(e),
    search: entrySearch(e),
    source: e.source,
    page: e.page,
    details: details(e, find),
    text: e.text,
    issues: e.issues,
    effects: effectsOf(e),
    marks: (
      <>
        {e.edited && <EditedMark />}
        {house && <span className="noncanon">House</span>}
      </>
    ),
  }
}

/** `children` naming an entry of the runner's catalog, with its card on hover, focus or tap (none when it's gone). */
export function Sr6Ref({ kind, id, children, open, tabbable }: { kind: Sr6Kind; id?: string; children: ReactNode; open?: boolean; tabbable?: boolean }) {
  const { c } = useSr6Editor()
  const e = id ? resolveEntry(c, kind, id) : undefined // (a family's hidden parent too, levels.ts)
  return (
    <EntryHover row={e && (() => sr6Row(c, e))} kind={SR6_KINDS[kind].label} open={open} tabbable={tabbable}>
      {children}
    </EntryHover>
  )
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
  const e = resolveEntry(c, kind, id)
  return e ? { card: () => sr6Row(c, e), cardKind: SR6_KINDS[kind].label } : {}
}

/** An attribute's range on the runner: Magic or Resonance from its magic rating to the cap less the Essence loss (none
 *  while the cap isn't set); the others the metatype's minimum to its maximum (attrMax: with Exceptional Attribute). */
export function attrRange({ data, cr, ch, p, d }: Pick<Sr6Ctx, 'data' | 'cr' | 'ch' | 'p' | 'd'>, a: Sr6Attr): [number, number] | undefined {
  const b = ch.build,
    meta = data.metatypes[b.metatype]
  return a === 'mag' || a === 'res' ? (d.magicMax === null ? undefined : [p.magicRating(b), d.magicMax]) : meta && [meta.ranges[a][0], attrMax(data, cr, b, a)!]
}

/** An attribute's card: its catalog entry (description, source and page) with the runner's natural and augmented
 *  ratings (the switchable and conditional bonuses in brackets), its maximum and what raises it: the lines the total
 *  counts (bonusSources, what augmentBonus adds up), then the bracketed ones with their notes (bracketNotes: switch,
 *  condition, whom a spell affects; owner decision 2026-10-10). */
export function sr6AttrRow(ctx: Pick<Sr6Ctx, 'c' | 'data' | 'cr' | 'ch' | 'p' | 'd'>, a: Sr6Attr): BrowseRow {
  const e = [...ctx.c.entries.attributes.values()].find(x => x.attrs.abbr?.toLowerCase() === a)
  const { natural, augmented } = ctx.d.attrs[a],
    r = attrRange(ctx, a)
  const raised = [
    ...bonusSources(ctx.ch.build, ctx.data, a).map(x => ({ text: `${x.value > 0 ? '+' : ''}${x.value} from ${x.from}`, state: 'applied' as const })),
    ...bracketNotes(ctx.ch.build, ctx.data, a).map(x => ({
      text: `${x.value > 0 ? '+' : ''}${x.value} from ${x.from}${x.when ? ` (${x.when})` : ''}`,
      state: 'conditional' as const,
    })),
  ]
  const values = [
    `natural ${natural}`,
    `augmented ${br(augmented, ctx.d.on.attrs[a].augmented)}`,
    r ? `max ${r[1]}` : 'no max set',
    ...((a === 'mag' || a === 'res') && ctx.d.magicLoss ? [`${ctx.d.magicLoss} lost to Essence`] : []),
    // (CRB Hong Kong p. 37: an adjusted attribute is never above its rank + 4)
    ...(ctx.d.on.capped[a]
      ? [
          `${br(ctx.d.capped[a] ?? 0, ctx.d.on.capped[a])} of the bonus not counted: capped at +${ctx.cr.get('attributeAugmentMax')?.value} (CRB Hong Kong p. 37)`,
        ]
      : []),
  ].join(' · ')
  return {
    key: a,
    name: ATTR_NAMES[a],
    source: e?.source ?? '',
    page: e?.page ?? 0,
    details: values,
    effects: raised,
    text: e?.text || undefined,
    issues: e?.issues,
    marks: e?.edited ? <EditedMark /> : undefined,
  }
}

/** `children` naming one of the runner's attributes, with its card on hover, focus or tap. */
export function Sr6AttrRef({ attr, children, tabbable }: { attr: Sr6Attr; children: ReactNode; tabbable?: boolean }) {
  const ctx = useSr6Editor()
  return (
    <EntryHover row={() => sr6AttrRow(ctx, attr)} kind="Attribute" tabbable={tabbable}>
      {children}
    </EntryHover>
  )
}

/** What a ledger spend names (src/sr6/ui/tabs/Ledger.tsx): an attribute, or a catalog entry (a skill, quality, pick,
 *  style or technique, the gear bought or dropped, a lifestyle), else nothing. */
export function advanceTarget(ch: Sr6Character, a: Sr6Advance): { attr: Sr6Attr } | { kind: Sr6Kind; id: string } | undefined {
  const b = ch.build
  const lines = (xs: Sr6Purchase[]): Sr6Purchase[] => xs.flatMap(x => [x, ...lines(x.accessories)])
  const of = (kind: Sr6Kind | undefined, id: string | undefined) => (kind && id ? { kind, id } : undefined)
  switch (a.op) {
    case 'attribute':
      return { attr: a.target }
    case 'skill':
    case 'spec':
    case 'expertise':
      return of('skills', a.target)
    case 'quality':
      return of('qualities', a.line.id)
    case 'buyoff':
      return of('qualities', a.line?.id ?? b.qualities.find(q => q.uid === a.target)?.id)
    case 'pick':
      return of(a.line.kind, a.line.id)
    case 'initiate':
      return of(a.line?.kind, a.line?.id)
    case 'martialart':
      return of('martialarts', a.line.id)
    case 'technique':
      return of('martialtechniques', a.line.id)
    case 'purchase':
      return of(a.line.kind, a.line.id)
    case 'drop': {
      const x = a.line ?? lines(b.purchases).find(y => y.uid === a.target)
      return of(x?.kind, x?.id)
    }
    case 'lifestyle':
      return of('lifestyles', a.id)
    default:
      return undefined
  }
}

/** `children` naming what a ledger spend buys, with its card (an attribute's or the entry's); plain when it names none. */
export function Sr6AdvanceRef({ advance, children }: { advance: Sr6Advance; children: ReactNode }) {
  const { ch } = useSr6Editor()
  const t = advanceTarget(ch, advance)
  return !t ? (
    <>{children}</>
  ) : 'attr' in t ? (
    <Sr6AttrRef attr={t.attr}>{children}</Sr6AttrRef>
  ) : (
    <Sr6Ref kind={t.kind} id={t.id}>
      {children}
    </Sr6Ref>
  )
}

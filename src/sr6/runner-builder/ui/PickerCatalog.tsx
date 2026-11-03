// The SR6 catalog picker: a searchable list of one or more kinds with a category filter; an item that comes in ratings (or a grade)
// opens a second step with the rating and grade selects and its cost, Availability and Essence at that rating; and the price and
// grouping helpers. Picker.tsx re-exports it with the other Picker* files.
import { effectiveAvailability } from '../domain/creation/rule-markers'
import { prereqNote } from '../domain/creation/prereq'
import type { Sr6Build } from '../../formats/domain/character'
import { useContext, useState } from 'react'
import { HouseChip, Modal, Picker, Stepper } from '../../../core/ui-kit/bits'
import { entryOf } from '../domain/creation/budgets'
import { num, type CreationRules } from '../../table-setup/domain/creation'
import { armorSocial, availNote, bookValue, chosenRating, dataFind, legality, ratingRange } from '../../catalog/domain/values'
import { IssueBadges } from '../../../core/ui-kit/Issues'
import { type Sr6Purchase } from '../../formats/domain/character'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../../formats/domain/types'
import type { Sr6Data } from '../../catalog/domain/data'
import { gradeFactor, gradeName, gradeOptions, gradesFor, type GradeFactor } from '../domain/creation/grades'
import { critterOnly, infectedOff } from '../domain/assets/critterware'
import { entryLabel, entrySearch, explosiveGroup, gearGroupOf, isAmmoGear, isExplosive, stacks as itemStacks } from '../../catalog/domain/categories'
import { n, Sr6Editor, useSr6Editor, type Sr6Ctx } from './editor'
import { formulaShown, Sr6Ref, sr6Row } from './EntryRef'

/** An entry's cost, Availability and Essence at `rating` (and grade, when its factors are set) as shown: '' when none is
 *  printed, '?' when the app can't read it. */
export function priceAt(
  e: Sr6Entry,
  rating: number,
  cr?: CreationRules,
  grade?: string,
  data?: Sr6Data,
  b?: Sr6Build,
): { cost: string; avail: string; essence: string } {
  const g = (k: GradeFactor) => (cr && grade ? (data ? gradeFactor(cr, data, grade, k) : num(cr, `grade:${grade}:${k}`)) : undefined)
  const show = (attr: string, f: (v: number) => string) => {
    const v = bookValue(e, attr, rating, data && dataFind(data))
    return !v.ok ? (v.formula ? 'unpriced' : '?') : v.n === null ? '' : f(v.n)
  }
  const legal = legality(e.attrs.avail)
  const licence = availNote(e.attrs.avail, rating).text // (listed, never enforced: licences are for the GM)
  const effective = (v: number) => (b && data ? effectiveAvailability(b, data, v) : v)
  const shownAvail = show('avail', v => `${effective(v + (g('avail') ?? 0))}${legal ? `(${legal})` : ''}`)
  return {
    cost: show('cost', v => `${n(v * (g('cost') ?? 1))}¥`),
    avail: b && data ? (licence ? `${shownAvail}, ${licence.replace(/^.*?licence/, 'licence')}` : shownAvail) : (licence ?? shownAvail),
    essence: show('essence', v => n(Math.round(v * (g('essence') ?? 1) * 100) / 100)),
  }
}

/** An armor's Social modifier as shown (`Social +2`, `Social –4`), or nothing when it prints none. */
export const social = (s: string | undefined) => {
  const v = armorSocial(s)
  return v === null ? undefined : `Social ${v < 0 ? '–' : '+'}${Math.abs(v)}`
}

/** The picker's and Game data's sub-category: an augmentation's type and category, else its category. */
export const groupOf = (e: Sr6Entry) =>
  isExplosive(e) ? explosiveGroup(e) : e.kind === 'augmentations' ? [e.attrs.type, e.attrs.category].filter(Boolean).join(': ') : e.attrs.category
/** A coarse major category for a picker that spans many kinds (Buy gear): breaks out by weapons, cyberware, bioware,
 *  geneware, ammunition, armour, software, … — the item's kind (or, for an augmentation, its type) — instead of the fine,
 *  often vendor-named, category. */
export const majorGroupOf = (e: Sr6Entry): string =>
  isExplosive(e) ? explosiveGroup(e) : e.kind === 'augmentations' ? e.attrs.type || 'Augmentations' : SR6_KINDS[e.kind].label

/** The group a catalog picker files an entry under: gear by its major category (gearGroupOf), the rest by kind or category. */
const pickerGroup = (e: Sr6Entry, multi: boolean) => (e.kind === 'gear' ? gearGroupOf(e) : multi ? majorGroupOf(e) : groupOf(e))

/** House and the compendium's name for a GM compendium's entry (nothing for a book's). */
export function House({ c, source }: { c: Sr6Catalog; source: string }) {
  const s = c.sources.get(source)
  return s?.compendium ? <HouseChip name={s.name} /> : null
}

/** A line's name: the catalog's, else the stored one; marked when its entry is gone. */
export function LineName({ x }: { x: Sr6Purchase }) {
  const { data } = useSr6Editor()
  const e = entryOf(x, data)
  return (
    <>
      <Sr6Ref kind={x.kind} id={e?.id}>
        <b>{e ? entryLabel(e) : (x.name ?? 'Custom item')}</b>
      </Sr6Ref>
      {x.id && !x.design && !data.entry(x.kind, x.id) && <span className="err"> (no longer in the catalog)</span>}
      {x.design && <span className="noncanon">Custom design</span>}
      {e && (
        <span className="muted">
          {' '}
          {e.source} p.{e.page}
        </span>
      )}
      {!x.id && (
        <>
          {' '}
          <span className="noncanon">Custom</span>
        </>
      )}
    </>
  )
}

export interface PickedItem {
  e: Sr6Entry
  rating?: number
  grade?: string
  qty?: number
}
// (the stepper's top for a rating the player picks: the book's rules bound it elsewhere, chosenRating)
export const MAX_CHOSEN = 99

/** A grade as a select shows it: one the entry's type doesn't take marked (Review's gear.grade). */
export const gradeLabel = (data: Sr6Data, cr: CreationRules, g: string, e: Sr6Entry) =>
  `${gradeName(data, g)}${gradesFor(cr, data, e).includes(g) ? '' : ` (not for ${/cultured/i.test(e.attrs.category ?? '') && gradesFor(cr, data).includes(g) ? 'cultured bioware' : e.attrs.type || 'this item'})`}`

/** The catalog picker in a dialog. onAdd answers null when added (the dialog closes) or the refusal. `note` marks an
 *  entry the runner lacks a prerequisite for (it may still be picked: Review flags it). */
export function CatalogPicker({
  title,
  open,
  onClose,
  kinds,
  filter,
  grades,
  note,
  blocked,
  onAdd,
  from,
  critter,
  quantity,
}: {
  title: string
  open: boolean
  onClose: () => void
  kinds: Sr6Kind[]
  filter?: (e: Sr6Entry) => boolean
  grades?: boolean
  note?: (e: Sr6Entry) => string | undefined
  /** why an entry can't be picked here (a host requirement it fails): listed greyed with the reason, owner ruling 4 */
  blocked?: (e: Sr6Entry) => string | undefined
  onAdd: (p: PickedItem) => string | null
  /** the catalog and rules outside a runner's editor (the Designer's) */
  from?: Pick<Sr6Ctx, 'c' | 'cr' | 'data'>
  /** for an owned critter: the critter-only entries (critterware, critter gear, companion qualities) are offered too */
  critter?: boolean
  /** offer a quantity (stacking kinds only): N of one item is one line with a count */
  quantity?: boolean
}) {
  const ctx = useContext(Sr6Editor)
  const { c, cr, data } = from ?? ctx!
  const [chosen, setChosen] = useState<PickedItem | null>(null)
  // grades for cyberware and bioware; geneware, nanoware, symbionts and transgenics are bought as printed (a grade on
  // one is offered marked, Review's gear.grade); the picker's grade step opens for an entry whose type takes one
  const offered = (e: Sr6Entry) => (grades ? gradesFor(cr, data, e) : [])
  // (only while open: a tab draws a closed picker per list and per line taking accessories, each over thousands of entries)
  const entries = !open
    ? []
    : kinds
        .flatMap(k => [...c.entries[k].values()])
        .filter(e => (critter || !critterOnly(e)) && !infectedOff(e, cr) && (!filter || filter(e))) // (critter-only equipment but for a critter, and Infected entries while the table's rule is off, stay in the data browser, not here)
        .sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
  const close = () => {
    setChosen(null)
    onClose()
  }
  const add = (p: PickedItem) => {
    if (!onAdd(p)) close()
  }
  const pick = (key: string) => {
    const e = entries.find(x => `${x.kind}:${x.id}` === key)
    if (!e) return
    const range = ratingRange(e.attrs.rating),
      free = chosenRating(e)
    const gs = offered(e)
    const stacks = quantity && itemStacks(e.kind, e)
    if (range.length > 1 || free || gs.length || stacks)
      setChosen({ e, rating: range.length > 1 || free ? (range[0] ?? 1) : undefined, grade: gs[0], ...(stacks ? { qty: 1 } : {}) })
    else add({ e })
  }
  const range = chosen ? ratingRange(chosen.e.attrs.rating) : [],
    free = chosen && chosenRating(chosen.e)
  const price = chosen && priceAt(chosen.e, chosen.rating ?? range[0] ?? 1, cr, chosen.grade, data, from ? undefined : ctx?.ch.build)
  const availWarn = chosen && availNote(chosen.e.attrs.avail, chosen.rating ?? range[0] ?? 1).warn // (a heads-up, never a refusal)
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      actions={
        chosen ? (
          <>
            <button className="btn" onClick={() => setChosen(null)}>
              Back
            </button>
            <button className="btn primary" onClick={() => add(chosen)}>
              Add
            </button>
          </>
        ) : undefined
      }
    >
      {chosen ? (
        <div className="stack">
          <p>
            <b>{entryLabel(chosen.e)}</b>{' '}
            <span className="muted">
              {[chosen.e.attrs.type, chosen.e.attrs.category].filter(Boolean).join(', ')} · {chosen.e.source} p.{chosen.e.page}
            </span>
          </p>
          <div className="row">
            {range.length > 1 && (
              <label className="inline">
                Rating
                <select value={chosen.rating} onChange={e => setChosen({ ...chosen, rating: Number(e.target.value) })}>
                  {range.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {free && (
              <label className="inline">
                {free} <Stepper label={free} value={chosen.rating ?? 1} min={1} max={MAX_CHOSEN} onChange={v => setChosen({ ...chosen, rating: v })} />
              </label>
            )}
            {chosen.qty !== undefined && (
              <label className="inline">
                Quantity <Stepper label="Quantity" value={chosen.qty} min={1} max={999} onChange={v => setChosen({ ...chosen, qty: v })} />
                {isAmmoGear(chosen.e) && <span className="muted"> (each is one printed unit, e.g. 10 rounds)</span>}
              </label>
            )}
            {grades && gradeOptions(cr, data, chosen.e).length > 0 && (
              <label className="inline">
                Grade
                <select value={chosen.grade ?? ''} onChange={e => setChosen({ ...chosen, grade: e.target.value || undefined })}>
                  <option value="">None</option>
                  {gradeOptions(cr, data, chosen.e).map(g => (
                    <option key={g} value={g}>
                      {gradeLabel(data, cr, g, chosen.e)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {price && (
            <p>
              Cost <b title={formulaShown(chosen.e, 'cost', dataFind(data))}>{price.cost || '—'}</b>
              {chosen.qty && chosen.qty > 1 && price.cost ? (
                <>
                  {' '}
                  (× {chosen.qty} = {Number(price.cost) * chosen.qty})
                </>
              ) : null}{' '}
              · Availability <b title={formulaShown(chosen.e, 'avail', dataFind(data))}>{price.avail || '—'}</b>
              {availWarn && (
                <span className="warn" title={availWarn}>
                  {' '}
                  ⚑ {availWarn}
                </span>
              )}
              {price.essence && (
                <>
                  {' '}
                  · Essence <b>{price.essence}</b>
                </>
              )}
            </p>
          )}
          <IssueBadges issues={chosen.e.issues} source={chosen.e.source} />
        </div>
      ) : (
        <Picker
          placeholder="Search"
          onPick={pick}
          groups={[...new Set(entries.map(e => pickerGroup(e, kinds.length > 1) ?? ''))].filter(Boolean).sort()}
          items={entries.map(e => {
            const r = ratingRange(e.attrs.rating),
              p = priceAt(e, r[0] ?? 1, cr, undefined, data, from ? undefined : ctx?.ch.build),
              formula = formulaShown(e, 'cost', dataFind(data))
            return {
              id: `${e.kind}:${e.id}`,
              name: entryLabel(e),
              group: pickerGroup(e, kinds.length > 1),
              card: () => sr6Row(c, e),
              cardKind: SR6_KINDS[e.kind].label,
              meta: [
                e.attrs.type,
                e.attrs.category,
                r.length > 1 && `rating ${r[0]}–${r[r.length - 1]}`,
                p.essence && `Essence ${p.essence}`,
                e.kind === 'armor' && social(e.attrs.social),
                note?.(e),
                // the runner lacks a character prerequisite (Review errors on it; the pick is still allowed)
                !from && ctx && prereqNote(e, { data, cr, b: ctx.ch.build, p: ctx.p }),
                blocked?.(e),
              ]
                .filter(Boolean)
                .join(', '),
              label: (
                <>
                  <span className="muted">
                    {e.source} p.{e.page}
                  </span>{' '}
                  <House c={c} source={e.source} /> <IssueBadges issues={e.issues} source={e.source} />
                </>
              ),
              search: `${entrySearch(e)} ${pickerGroup(e, kinds.length > 1)} ${e.source} p.${e.page} ${c.sources.get(e.source)?.name ?? ''}`,
              price: formula && !/tier\(/.test(formula) ? formula : p.cost ? `${r.length > 1 ? 'from ' : ''}${p.cost}` : formula, // (a short formula as printed; a tier table as the price for the first rating)
              ...(blocked?.(e) ? { disabled: true } : {}),
            }
          })}
        />
      )}
    </Modal>
  )
}

// The SR6 catalog picker and the bits every purchase tab shares: a searchable list of one or more kinds with a category
// filter; an item that comes in ratings (or a grade) opens a second step with the rating and grade selects and its cost,
// Availability and Essence at that rating. Also the player's bonuses on a line or pick, a line's accessories and its price.
import { useState, type ReactNode } from 'react'
import { HouseChip, Modal, Picker, Stepper } from '../../ui/bits'
import { entryOf, priced } from '../engine/budgets'
import { num, type CreationRules } from '../engine/creation'
import { armorSocial, availNote, bookValue, chosenRating, dataFind, legality, ratingRange } from '../engine/values'
import { formulaOf, formulaText } from '../../shared/formula'
import { IssueBadges } from '../../ui/Issues'
import { BONUS_TARGETS, type Bonus, type PurchaseKind, type Sr6Purchase } from '../model/character'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../model/types'
import type { Sr6Data } from '../engine/data'
import { gradeFactor, gradeName, gradeOptions, gradesFor, type GradeFactor } from '../engine/grades'
import { critterOnly, infectedOff } from '../engine/critterware'
import { categoryOf, entryLabel, entrySearch, fitsHost, hostsOf } from '../engine/categories'
import { ATTR_NAMES, n, useSr6Editor } from './editor'
import { formulaShown, Sr6Ref, sr6Row } from './EntryRef'

/** An entry's cost, Availability and Essence at `rating` (and grade, when its factors are set) as shown: '' when none is
 *  printed, '?' when the app can't read it. */
export function priceAt(e: Sr6Entry, rating: number, cr?: CreationRules, grade?: string, data?: Sr6Data): { cost: string; avail: string; essence: string } {
  const g = (k: GradeFactor) => (cr && grade ? (data ? gradeFactor(cr, data, grade, k) : num(cr, `grade:${grade}:${k}`)) : undefined)
  const show = (attr: string, f: (v: number) => string) => {
    const v = bookValue(e, attr, rating, data && dataFind(data))
    return !v.ok ? (v.formula ? 'unpriced' : '?') : v.n === null ? '' : f(v.n)
  }
  const legal = legality(e.attrs.avail)
  const licence = availNote(e.attrs.avail, rating).text // (listed, never enforced: licences are for the GM)
  return {
    cost: show('cost', v => `${n(v * (g('cost') ?? 1))}¥`),
    avail: licence ?? show('avail', v => `${v + (g('avail') ?? 0)}${legal ? `(${legal})` : ''}`),
    essence: show('essence', v => n(Math.round(v * (g('essence') ?? 1) * 100) / 100)),
  }
}

/** An armor's Social modifier as shown (`Social +2`, `Social –4`), or nothing when it prints none. */
export const social = (s: string | undefined) => {
  const v = armorSocial(s)
  return v === null ? undefined : `Social ${v < 0 ? '–' : '+'}${Math.abs(v)}`
}

/** The picker's and Game data's sub-category: an augmentation's type and category, else its category. */
export const groupOf = (e: Sr6Entry) => (e.kind === 'augmentations' ? [e.attrs.type, e.attrs.category].filter(Boolean).join(': ') : e.attrs.category)

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
      {x.id && !data.entry(x.kind, x.id) && <span className="err"> (no longer in the catalog)</span>}
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
}
// (the stepper's top for a rating the player picks: the book's rules bound it elsewhere, chosenRating)
const MAX_CHOSEN = 99

/** A grade as a select shows it: one the entry's type doesn't take marked (Review's gear.grade). */
const gradeLabel = (data: Sr6Data, cr: CreationRules, g: string, e: Sr6Entry) =>
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
  onAdd,
}: {
  title: string
  open: boolean
  onClose: () => void
  kinds: Sr6Kind[]
  filter?: (e: Sr6Entry) => boolean
  grades?: boolean
  note?: (e: Sr6Entry) => string | undefined
  onAdd: (p: PickedItem) => string | null
}) {
  const { c, cr, data } = useSr6Editor()
  const [chosen, setChosen] = useState<PickedItem | null>(null)
  // grades for cyberware and bioware; geneware, nanoware, symbionts and transgenics are bought as printed (a grade on
  // one is offered marked, Review's gear.grade); the picker's grade step opens for an entry whose type takes one
  const offered = (e: Sr6Entry) => (grades ? gradesFor(cr, data, e) : [])
  // (only while open: a tab draws a closed picker per list and per line taking accessories, each over thousands of entries)
  const entries = !open
    ? []
    : kinds
        .flatMap(k => [...c.entries[k].values()])
        .filter(e => !critterOnly(e) && !infectedOff(e, cr) && (!filter || filter(e))) // (critter-only equipment, and Infected entries while the table's rule is off, stay in the data browser, not here)
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
    if (range.length > 1 || free || gs.length) setChosen({ e, rating: range.length > 1 || free ? (range[0] ?? 1) : undefined, grade: gs[0] })
    else add({ e })
  }
  const range = chosen ? ratingRange(chosen.e.attrs.rating) : [],
    free = chosen && chosenRating(chosen.e)
  const price = chosen && priceAt(chosen.e, chosen.rating ?? range[0] ?? 1, cr, chosen.grade, data)
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
              Cost <b title={formulaShown(chosen.e, 'cost', dataFind(data))}>{price.cost || '—'}</b> · Availability{' '}
              <b title={formulaShown(chosen.e, 'avail', dataFind(data))}>{price.avail || '—'}</b>
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
          groups={[...new Set(entries.map(e => groupOf(e) ?? ''))].filter(Boolean).sort()}
          items={entries.map(e => {
            const r = ratingRange(e.attrs.rating),
              p = priceAt(e, r[0] ?? 1, undefined, undefined, data),
              formula = formulaShown(e, 'cost', dataFind(data))
            return {
              id: `${e.kind}:${e.id}`,
              name: entryLabel(e),
              group: groupOf(e),
              card: () => sr6Row(c, e),
              cardKind: SR6_KINDS[e.kind].label,
              meta: [
                e.attrs.type,
                e.attrs.category,
                r.length > 1 && `rating ${r[0]}–${r[r.length - 1]}`,
                p.essence && `Essence ${p.essence}`,
                e.kind === 'armor' && social(e.attrs.social),
                note?.(e),
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
              search: `${entrySearch(e)} ${e.source} p.${e.page} ${c.sources.get(e.source)?.name ?? ''}`,
              price: formula ?? (p.cost && `${r.length > 1 ? 'from ' : ''}${p.cost}`),
            }
          })}
        />
      )}
    </Modal>
  )
}

const targetName = (t: Bonus['target']) =>
  t === 'initDice'
    ? 'Initiative dice'
    : t === 'defense'
      ? 'Defense Rating'
      : t === 'physical'
        ? 'Physical monitor boxes'
        : t === 'stun'
          ? 'Stun monitor boxes'
          : t === 'overflow'
            ? 'Damage Overflow boxes'
            : t === 'skill'
              ? 'Skill dice pool'
              : t === 'unarmedAR'
                ? 'Unarmed Attack Rating'
                : t === 'unarmedDV'
                  ? 'Unarmed DV'
                  : t === 'movement'
                    ? 'Movement (metres)'
                    : t === 'matrixInitDice'
                      ? 'Matrix initiative dice'
                      : ATTR_NAMES[t]
/** `+1 Agility`, `+2 Firearms dice` (a skill by its catalog name) */
export const bonusText = (x: Bonus, data: Pick<Sr6Data, 'skills'>) =>
  `${x.value >= 0 ? '+' : '−'}${Math.abs(x.value)} ${
    x.target === 'skill' ? `${data.skills[x.skill ?? '']?.name ?? x.skill ?? 'skill'} dice` : targetName(x.target)
  }${x.perRating ? ' × rating' : ''}`

/** The player's bonuses on a line or pick (R: the catalog has no bonus data), each removable, and a dialog to add one: to
 *  an attribute, initiative dice, the Defense Rating or one skill's dice pool. */
export function Bonuses({ uid, name, bonuses, rated: hasRating }: { uid: string; name: string; bonuses?: Bonus[]; rated?: boolean }) {
  const { act, data } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Bonus['target']>('agi'),
    [value, setValue] = useState('1'),
    [per, setPer] = useState(false)
  const skills = Object.values(data.skills).sort((a, z) => a.name.localeCompare(z.name))
  const [skill, setSkill] = useState('')
  const list = bonuses ?? [],
    v = Number(value),
    sk = skill || skills[0]?.id
  const add = () => {
    if (
      !act({
        op: 'bonus',
        uid,
        bonuses: [...list, { target, ...(target === 'skill' ? { skill: sk } : {}), value: v, ...(per ? { perRating: true as const } : {}) }],
      })
    )
      setOpen(false)
  }
  return (
    <span className="row bonuses">
      {list.map((x, i) => (
        <span key={i} className="chip">
          {bonusText(x, data)}
          <button aria-label={`Remove ${bonusText(x, data)} from ${name}`} onClick={() => act({ op: 'bonus', uid, bonuses: list.filter((_, j) => j !== i) })}>
            ×
          </button>
        </span>
      ))}
      <button className="btn small quiet" aria-label={`Add a bonus to ${name}`} onClick={() => setOpen(true)}>
        Bonus…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Bonus for ${name}`}
        actions={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!Number.isFinite(v) || v === 0 || (target === 'skill' && !sk)} onClick={add}>
              Add bonus
            </button>
          </>
        }
      >
        <p className="muted">What it adds to the runner while it has it.</p>
        <div className="row">
          <label className="inline">
            Bonus to{' '}
            <select value={target} onChange={e => setTarget(e.target.value as Bonus['target'])}>
              {BONUS_TARGETS.map(t => (
                <option key={t} value={t}>
                  {targetName(t)}
                </option>
              ))}
            </select>
          </label>
          {target === 'skill' && (
            <label className="inline">
              Skill{' '}
              <select value={sk ?? ''} onChange={e => setSkill(e.target.value)}>
                {skills.map(x => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="inline">
            Value <input type="number" step={1} value={value} onChange={e => setValue(e.target.value)} style={{ width: '5rem' }} />
          </label>
          {hasRating && (
            <label className="inline">
              <input type="checkbox" checked={per} onChange={e => setPer(e.target.checked)} /> × rating
            </label>
          )}
        </div>
      </Modal>
    </span>
  )
}

/** The accessories fitted to a line, each removable, and the picker to fit another: every accessory whose category names
 *  hosts (one naming others marked: it may still be fitted, Review's catalog.accessoryHost); one whose category names no
 *  host, by `filter`. */
export function Accessories({ host, name, kinds, filter }: { host: Sr6Purchase; name: string; kinds: PurchaseKind[]; filter?: (e: Sr6Entry) => boolean }) {
  const { act, data, cr } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const he = entryOf(host, data)
  // an accessory category naming its hosts is offered (marked unless it fits); a line taking any gear (a vehicle's)
  // takes no other host's accessory; else an entry with no category record (an import before categories) by `filter`
  const fits = (e: Sr6Entry) => (he && fitsHost(data.categories, e, he) !== null) || (!filter ? !isAccessory(e) : !categoryOf(data.categories, e) && filter(e))
  const wrong = (e: Sr6Entry) => (he && fitsHost(data.categories, e, he) === false ? `for ${hostsOf(data.categories, e).join(' or ')}, not this` : undefined)
  return (
    <span className="row">
      {host.accessories.map(a => {
        const e = entryOf(a, data),
          own = e ? entryLabel(e) : (a.name ?? 'Accessory'),
          label = `${own}${a.rating ? ` ${a.rating}` : ''}`
        // on an implant an add-on has its grade (CRB p. 282): shown, never chosen
        const range = levelsOf(data, a),
          implant = host.kind === 'augmentations',
          grades = e && !implant ? gradeOptions(cr, data, e) : []
        const free = chosenRating(e)
        // its rating and grade change in place, as a line's do (a level of a family: to that level's entry)
        return (
          <span key={a.uid} className="chip">
            <Sr6Ref kind={a.kind} id={e?.id}>
              {range.length > 1 || free ? own : label}
            </Sr6Ref>
            {range.length > 1 && (
              <select
                aria-label={`${own} on ${name}: rating`}
                value={a.rating ?? data.levelOf(e) ?? range[0]}
                onChange={ev => act({ op: 'rate', uid: a.uid, rating: Number(ev.target.value) })}
              >
                {range.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            {free && (
              <Stepper
                label={`${own} on ${name}: ${free.toLowerCase()}`}
                value={a.rating ?? 1}
                min={1}
                max={MAX_CHOSEN}
                onChange={v => act({ op: 'rate', uid: a.uid, rating: v })}
              />
            )}
            {grades.length > 0 && (
              <select
                aria-label={`${own} on ${name}: grade`}
                value={a.grade ?? ''}
                onChange={ev => act({ op: 'rate', uid: a.uid, grade: ev.target.value || null })}
              >
                <option value="">No grade</option>
                {grades.map(g => (
                  <option key={g} value={g}>
                    {gradeLabel(data, cr, g, e!)}
                  </option>
                ))}
              </select>
            )}
            {implant && host.grade && (
              <span className="muted" title="An add-on has its implant’s grade (core rulebook p. 282)">
                {' '}
                {gradeName(data, host.grade)}
              </span>
            )}
            <button aria-label={`Remove ${label} from ${name}`} onClick={() => act({ op: 'accessory', host: host.uid, remove: a.uid })}>
              ×
            </button>
            {/* what it does to its host (a cyberlimb's Strength), never to the runner */}
            <Bonuses uid={a.uid} name={`${own} on ${name}`} bonuses={a.bonuses} rated={!!a.rating} />
          </span>
        )
      })}
      <button className="btn small quiet" aria-label={`Add an accessory to ${name}`} onClick={() => setOpen(true)}>
        Accessory…
      </button>
      <CatalogPicker
        title={`Add an accessory to ${name}`}
        open={open}
        onClose={() => setOpen(false)}
        kinds={kinds}
        filter={fits}
        note={wrong}
        onAdd={p => act({ op: 'accessory', host: host.uid, kind: p.e.kind as PurchaseKind, id: p.e.id, rating: p.rating })}
      />
    </span>
  )
}

/** An entry of an accessory category (its record names the hosts it fits; one that names none, by its category's word). */
export const isAccessory = (e: Sr6Entry) => /accessor|modification|\bmods?\b|enhancement/i.test(e.attrs.category ?? '')
/** The kinds an accessory may be printed as (a cyberlimb's are augmentations, the core rulebook's weapon accessories
 *  weapons): the picker keeps those that fit the line. */
export const ACCESSORY_KINDS: PurchaseKind[] = ['gear', 'weapons', 'augmentations', 'electronics', 'armor']

/** The ratings a line can be set to: its family's levels (levels.ts: the select moves the line to that level's entry),
 *  else the entry's printed range. */
const levelsOf = (data: Sr6Data, x: Sr6Purchase): number[] => {
  const sibs = x.id ? data.siblings(x.kind, x.id) : []
  return sibs.length > 1 ? sibs.map(s => data.levelOf(s)!) : ratingRange(entryOf(x, data)?.attrs.rating)
}

/** A line's rating and grade, changed in place where the entry comes in ratings or grades are offered. */
function RatingGrade({ x, name, grades }: { x: Sr6Purchase; name: string; grades?: boolean }) {
  const { data, cr, act } = useSr6Editor()
  const e = entryOf(x, data),
    range = levelsOf(data, x),
    offered = grades && e ? gradeOptions(cr, data, e) : []
  const free = chosenRating(e)
  if (range.length < 2 && !free && !offered.length)
    return x.rating || x.grade ? (
      <div className="muted">{[x.rating && `Rating ${x.rating}`, x.grade && gradeName(data, x.grade)].filter(Boolean).join(' · ')}</div>
    ) : null
  return (
    <div className="row muted">
      {range.length > 1 ? (
        <label className="inline">
          Rating{' '}
          <select
            aria-label={`${name} rating`}
            value={x.rating ?? data.levelOf(e) ?? range[0]}
            onChange={ev => act({ op: 'rate', uid: x.uid, rating: Number(ev.target.value) })}
          >
            {range.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : free ? (
        <label className="inline">
          {free}{' '}
          <Stepper
            label={`${name} ${free.toLowerCase()}`}
            value={x.rating ?? 1}
            min={1}
            max={MAX_CHOSEN}
            onChange={v => act({ op: 'rate', uid: x.uid, rating: v })}
          />
        </label>
      ) : (
        x.rating && `Rating ${x.rating}`
      )}
      {offered.length > 0 ? (
        <label className="inline">
          Grade{' '}
          <select aria-label={`${name} grade`} value={x.grade ?? ''} onChange={ev => act({ op: 'rate', uid: x.uid, grade: ev.target.value || null })}>
            {!x.grade && <option value="">None</option>}
            {[...offered, ...(x.grade && !offered.includes(x.grade) ? [x.grade] : [])].map(g => (
              <option key={g} value={g}>
                {gradeLabel(data, cr, g, e!)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        x.grade && gradeName(data, x.grade)
      )}
    </div>
  )
}

const STACKS = new Set<PurchaseKind>(['electronics', 'programs', 'gear'])

/** One kind of purchase as a table: name (rating, grade, source), what `detail` adds, accessories and bonuses; quantity
 *  where lines stack, worn for armor, Essence for augmentations, Availability, cost; and its picker. */
export function PurchaseSection({
  kind,
  title,
  one,
  grades,
  detail,
  accessories,
  bonuses,
  hint,
  offer,
}: {
  kind: PurchaseKind
  title: string
  one: string
  grades?: boolean
  detail?: (x: Sr6Purchase) => ReactNode
  /** which catalog entries the picker offers (none: all) */
  offer?: (e: Sr6Entry) => boolean
  accessories?: { kinds: PurchaseKind[]; filter?: (e: Sr6Entry) => boolean }
  bonuses?: boolean
  hint?: ReactNode
}) {
  const { ch, data, cr, act, d } = useSr6Editor()
  const [adding, setAdding] = useState(false)
  const rows = ch.build.purchases.filter(x => x.kind === kind)
  const own = (x: Sr6Purchase) => d.hosts.find(h => h.uid === x.uid)?.text
  const ware = kind === 'augmentations'
  return (
    <section className="stack">
      <div className="row">
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span className="spacer" />
        <button className="btn small" onClick={() => setAdding(true)}>
          Add {one}…
        </button>
      </div>
      {hint && (
        <p className="muted" style={{ margin: 0 }}>
          {hint}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <div className="scroll-x">
          <table className="data">
            <thead>
              <tr>
                <th>{title}</th>
                {(STACKS.has(kind) || kind === 'armor') && <th>{kind === 'armor' ? 'Worn' : 'Qty'}</th>}
                {ware && <th className="num">Essence</th>}
                <th className="num">Avail</th>
                <th className="num">Cost</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(x => {
                const e = entryOf(x, data),
                  name = e ? entryLabel(e) : (x.name ?? 'Custom item'),
                  p = priced(x, data, cr),
                  cf = formulaOf(e?.formulas, 'cost'),
                  note = availNote(e?.attrs.avail, x.rating ?? 1),
                  licence = note.text
                return (
                  <tr key={x.uid}>
                    <td>
                      <LineName x={x} />
                      <RatingGrade x={x} name={name} grades={grades} />
                      {detail && <div className="muted">{detail(x)}</div>}
                      {accessories && (
                        <div>
                          <Accessories host={x} name={name} {...accessories} />
                        </div>
                      )}
                      {own(x) && (
                        <div className="muted" aria-label={`${name}: its own values`}>
                          This item: {own(x)}
                        </div>
                      )}
                      {bonuses && (
                        <div>
                          <Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={!!x.rating} />
                        </div>
                      )}
                    </td>
                    {STACKS.has(kind) && (
                      <td>
                        <Stepper label={`${name} quantity`} value={x.qty} min={1} max={999} onChange={qty => act({ op: 'quantity', uid: x.uid, qty })} />
                      </td>
                    )}
                    {kind === 'armor' && (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${name} is worn`}
                          checked={!!x.worn}
                          onChange={ev => act({ op: 'wear', uid: x.uid, worn: ev.target.checked })}
                        />
                      </td>
                    )}
                    {ware && <td className="num">{n(p.essence)}</td>}
                    <td className="num">
                      {licence ? (
                        licence
                      ) : (
                        <>
                          {p.avail}
                          {legality(e?.attrs.avail) ? `(${legality(e?.attrs.avail)})` : ''}
                        </>
                      )}
                      {note.warn && (
                        <span className="warn" title={note.warn} aria-label={note.warn}>
                          {' '}
                          ⚑
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {/* a formula's price shows the formula on hover (and what it had to assume) */}
                      <span className={cf ? 'has-formula' : undefined} title={cf ? [formulaText(cf), ...p.notes].join('\n') : undefined}>
                        {p.unpriced ? <span className="warn">unpriced</span> : `${n(p.cost)}¥`}
                      </span>
                      {!p.ok && !p.unpriced && (
                        <span className="warn" title="A value the app can’t read counts 0">
                          {' '}
                          ?
                        </span>
                      )}
                    </td>
                    <td className="num">
                      <button className="btn small quiet" aria-label={`Remove ${name}`} onClick={() => act({ op: 'purchase', remove: x.uid })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <CatalogPicker
        title={`Add ${one}`}
        open={adding}
        onClose={() => setAdding(false)}
        kinds={[kind]}
        grades={grades}
        filter={offer}
        onAdd={p => act({ op: 'purchase', kind, id: p.e.id, rating: p.rating, grade: p.grade })}
      />
    </section>
  )
}

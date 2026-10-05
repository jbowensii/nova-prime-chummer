// The SR6 catalog picker and the bits every purchase tab shares: a searchable list of one or more kinds with a category
// filter; an item that comes in ratings (or a grade) opens a second step with the rating and grade selects and its cost,
// Availability and Essence at that rating. Also the player's bonuses on a line or pick, a line's accessories and its price.
import { useState, type ReactNode } from 'react'
import { HouseChip, Modal, Picker, Stepper } from '../../ui/bits'
import { entryOf, priced } from '../engine/budgets'
import { num, type CreationRules } from '../engine/creation'
import { legality, rated, ratingRange } from '../engine/values'
import { BONUS_TARGETS, type Bonus, type PurchaseKind, type Sr6Purchase } from '../model/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../model/types'
import type { Sr6Data } from '../engine/data'
import { gradeFactor, gradeName, gradesFor, type GradeFactor } from '../engine/grades'
import { ATTR_NAMES, n, useSr6Editor } from './editor'


/** An entry's cost, Availability and Essence at `rating` (and grade, when its factors are set) as shown: '' when none is
 *  printed, '?' when the app can't read it. */
export function priceAt(e: Sr6Entry, rating: number, cr?: CreationRules, grade?: string, data?: Sr6Data): { cost: string; avail: string; essence: string } {
  const g = (k: GradeFactor) => (cr && grade ? (data ? gradeFactor(cr, data, grade, k) : num(cr, `grade:${grade}:${k}`)) : undefined)
  const show = (attr: string, f: (v: number) => string) => {
    const v = rated(e.attrs[attr], rating)
    return !v.ok ? '?' : v.n === null ? '' : f(v.n)
  }
  const legal = legality(e.attrs.avail)
  return {
    cost: show('cost', v => `${n(v * (g('cost') ?? 1))}¥`),
    avail: show('avail', v => `${v + (g('avail') ?? 0)}${legal ? `(${legal})` : ''}`),
    essence: show('essence', v => n(Math.round(v * (g('essence') ?? 1) * 100) / 100)),
  }
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
  return <><b>{e?.name ?? x.name ?? 'Custom item'}</b>
    {x.id && !data.entry(x.kind, x.id) && <span className="err"> (no longer in the catalog)</span>}
    {e && <span className="muted"> {e.source} p.{e.page}</span>}
    {!x.id && <> <span className="noncanon">Custom</span></>}
  </>
}

export interface PickedItem { e: Sr6Entry; rating?: number; grade?: string }

/** The catalog picker in a dialog. onAdd answers null when added (the dialog closes) or the refusal. */
export function CatalogPicker({ title, open, onClose, kinds, filter, grades, onAdd }: {
  title: string; open: boolean; onClose: () => void; kinds: Sr6Kind[]; filter?: (e: Sr6Entry) => boolean; grades?: boolean
  onAdd: (p: PickedItem) => string | null
}) {
  const { c, cr, data } = useSr6Editor()
  const [chosen, setChosen] = useState<PickedItem | null>(null)
  // grades for cyberware and bioware only; geneware, nanoware, symbionts and transgenics are bought as printed
  const offered = (e: Sr6Entry) => (grades ? gradesFor(cr, data, e) : [])
  const entries = kinds.flatMap(k => [...c.entries[k].values()]).filter(e => !filter || filter(e)).sort((a, z) => a.name.localeCompare(z.name))
  const close = () => { setChosen(null); onClose() }
  const add = (p: PickedItem) => { if (!onAdd(p)) close() }
  const pick = (key: string) => {
    const e = entries.find(x => `${x.kind}:${x.id}` === key)
    if (!e) return
    const range = ratingRange(e.attrs.rating)
    const gs = offered(e)
    if (range.length > 1 || gs.length) setChosen({ e, rating: range.length > 1 ? range[0] : undefined, grade: gs[0] })
    else add({ e })
  }
  const range = chosen ? ratingRange(chosen.e.attrs.rating) : []
  const price = chosen && priceAt(chosen.e, chosen.rating ?? range[0] ?? 1, cr, chosen.grade, data)
  return (
    <Modal open={open} onClose={close} title={title}
      actions={chosen ? <><button className="btn" onClick={() => setChosen(null)}>Back</button>
        <button className="btn primary" onClick={() => add(chosen)}>Add</button></> : undefined}>
      {chosen ? <div className="stack">
        <p><b>{chosen.e.name}</b> <span className="muted">{[chosen.e.attrs.type, chosen.e.attrs.category].filter(Boolean).join(', ')} · {chosen.e.source} p.{chosen.e.page}</span></p>
        <div className="row">
          {range.length > 1 && <label className="inline">Rating
            <select value={chosen.rating} onChange={e => setChosen({ ...chosen, rating: Number(e.target.value) })}>
              {range.map(r => <option key={r} value={r}>{r}</option>)}</select></label>}
          {offered(chosen.e).length > 0 && <label className="inline">Grade
            <select value={chosen.grade} onChange={e => setChosen({ ...chosen, grade: e.target.value })}>
              {offered(chosen.e).map(g => <option key={g} value={g}>{gradeName(data, g)}</option>)}</select></label>}
        </div>
        {price && <p>Cost <b>{price.cost || '—'}</b> · Availability <b>{price.avail || '—'}</b>{price.essence && <> · Essence <b>{price.essence}</b></>}</p>}
      </div> : <Picker placeholder="Search" onPick={pick}
        groups={[...new Set(entries.map(e => groupOf(e) ?? ''))].filter(Boolean).sort()}
        items={entries.map(e => {
          const r = ratingRange(e.attrs.rating), p = priceAt(e, r[0] ?? 1)
          return { id: `${e.kind}:${e.id}`, name: e.name, group: groupOf(e),
            meta: [e.attrs.type, e.attrs.category, r.length > 1 && `rating ${r[0]}–${r[r.length - 1]}`, p.essence && `Essence ${p.essence}`].filter(Boolean).join(', '),
            label: <><span className="muted">{e.source} p.{e.page}</span> <House c={c} source={e.source} /></>, search: `${e.source} p.${e.page} ${c.sources.get(e.source)?.name ?? ''}`,
            price: p.cost && `${r.length > 1 ? 'from ' : ''}${p.cost}` }
        })} />}
    </Modal>
  )
}

const targetName = (t: Bonus['target']) => (t === 'initDice' ? 'Initiative dice' : t === 'defense' ? 'Defense Rating' : ATTR_NAMES[t])
const bonusText = (x: Bonus) => `${x.value >= 0 ? '+' : '−'}${Math.abs(x.value)} ${targetName(x.target)}${x.perRating ? ' × rating' : ''}`

/** The player's bonuses on a line or pick (R: the catalog has no bonus data), each removable, and a dialog to add one. */
export function Bonuses({ uid, name, bonuses, rated: hasRating }: { uid: string; name: string; bonuses?: Bonus[]; rated?: boolean }) {
  const { act } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<Bonus['target']>('agi'), [value, setValue] = useState('1'), [per, setPer] = useState(false)
  const list = bonuses ?? [], v = Number(value)
  const add = () => { if (!act({ op: 'bonus', uid, bonuses: [...list, { target, value: v, ...(per ? { perRating: true as const } : {}) }] })) setOpen(false) }
  return <span className="row bonuses">
    {list.map((x, i) => <span key={i} className="chip">{bonusText(x)}
      <button aria-label={`Remove ${bonusText(x)} from ${name}`} onClick={() => act({ op: 'bonus', uid, bonuses: list.filter((_, j) => j !== i) })}>×</button></span>)}
    <button className="btn small quiet" aria-label={`Add a bonus to ${name}`} onClick={() => setOpen(true)}>Bonus…</button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Bonus for ${name}`}
      actions={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary" disabled={!Number.isFinite(v) || v === 0} onClick={add}>Add bonus</button></>}>
      <p className="muted">What it adds to the runner while it has it.</p>
      <div className="row">
        <label className="inline">Bonus to <select value={target} onChange={e => setTarget(e.target.value as Bonus['target'])}>
          {BONUS_TARGETS.map(t => <option key={t} value={t}>{targetName(t)}</option>)}</select></label>
        <label className="inline">Value <input type="number" step={1} value={value} onChange={e => setValue(e.target.value)} style={{ width: '5rem' }} /></label>
        {hasRating && <label className="inline"><input type="checkbox" checked={per} onChange={e => setPer(e.target.checked)} /> × rating</label>}
      </div>
    </Modal>
  </span>
}

/** The accessories fitted to a line, each removable, and the picker to fit another. */
export function Accessories({ host, name, kinds, filter }: { host: Sr6Purchase; name: string; kinds: PurchaseKind[]; filter?: (e: Sr6Entry) => boolean }) {
  const { act, data, cr } = useSr6Editor()
  const [open, setOpen] = useState(false)
  return <span className="row">
    {host.accessories.map(a => {
      const e = entryOf(a, data), own = e?.name ?? a.name ?? 'Accessory', label = `${own}${a.rating ? ` ${a.rating}` : ''}`
      const range = ratingRange(e?.attrs.rating), grades = e ? gradesFor(cr, data, e) : []
      // its rating and grade change in place, as a line's do
      return <span key={a.uid} className="chip">{range.length > 1 ? own : label}
        {range.length > 1 && <select aria-label={`${own} on ${name}: rating`} value={a.rating ?? range[0]}
          onChange={ev => act({ op: 'rate', uid: a.uid, rating: Number(ev.target.value) })}>{range.map(r => <option key={r} value={r}>{r}</option>)}</select>}
        {grades.length > 0 && <select aria-label={`${own} on ${name}: grade`} value={a.grade ?? ''}
          onChange={ev => act({ op: 'rate', uid: a.uid, grade: ev.target.value || null })}>
          <option value="">No grade</option>{grades.map(g => <option key={g} value={g}>{gradeName(data, g)}</option>)}</select>}
        <button aria-label={`Remove ${label} from ${name}`} onClick={() => act({ op: 'accessory', host: host.uid, remove: a.uid })}>×</button></span>
    })}
    <button className="btn small quiet" aria-label={`Add an accessory to ${name}`} onClick={() => setOpen(true)}>Accessory…</button>
    <CatalogPicker title={`Add an accessory to ${name}`} open={open} onClose={() => setOpen(false)} kinds={kinds} filter={filter}
      onAdd={p => act({ op: 'accessory', host: host.uid, kind: p.e.kind as PurchaseKind, id: p.e.id, rating: p.rating })} />
  </span>
}

/** R: no mount data, so a weapon or a cyberlimb takes gear from any accessory category. */
export const isAccessory = (e: Sr6Entry) => /accessor/i.test(e.attrs.category ?? '')

/** A line's rating and grade, changed in place where the entry comes in ratings or grades are offered. */
function RatingGrade({ x, name, grades }: { x: Sr6Purchase; name: string; grades?: boolean }) {
  const { data, cr, act } = useSr6Editor()
  const e = entryOf(x, data), range = ratingRange(e?.attrs.rating), offered = grades && e ? gradesFor(cr, data, e) : []
  if (range.length < 2 && !offered.length) return (x.rating || x.grade)
    ? <div className="muted">{[x.rating && `Rating ${x.rating}`, x.grade && gradeName(data, x.grade)].filter(Boolean).join(' · ')}</div> : null
  return <div className="row muted">
    {range.length > 1 ? <label className="inline">Rating <select aria-label={`${name} rating`} value={x.rating ?? range[0]}
      onChange={ev => act({ op: 'rate', uid: x.uid, rating: Number(ev.target.value) })}>{range.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
      : x.rating && `Rating ${x.rating}`}
    {offered.length > 0 ? <label className="inline">Grade <select aria-label={`${name} grade`} value={x.grade ?? ''}
      onChange={ev => act({ op: 'rate', uid: x.uid, grade: ev.target.value || null })}>
      {!x.grade && <option value="">None</option>}
      {[...offered, ...(x.grade && !offered.includes(x.grade) ? [x.grade] : [])].map(g => <option key={g} value={g}>{gradeName(data, g)}</option>)}</select></label>
      : x.grade && gradeName(data, x.grade)}
  </div>
}

const STACKS = new Set<PurchaseKind>(['electronics', 'programs', 'gear'])

/** One kind of purchase as a table: name (rating, grade, source), what `detail` adds, accessories and bonuses; quantity
 *  where lines stack, worn for armor, Essence for augmentations, Availability, cost; and its picker. */
export function PurchaseSection({ kind, title, one, grades, detail, accessories, bonuses, hint }: {
  kind: PurchaseKind; title: string; one: string; grades?: boolean; detail?: (x: Sr6Purchase) => ReactNode
  accessories?: { kinds: PurchaseKind[]; filter?: (e: Sr6Entry) => boolean }; bonuses?: boolean; hint?: ReactNode
}) {
  const { ch, data, cr, act } = useSr6Editor()
  const [adding, setAdding] = useState(false)
  const rows = ch.build.purchases.filter(x => x.kind === kind)
  const ware = kind === 'augmentations'
  return <section className="stack">
    <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><span className="spacer" />
      <button className="btn small" onClick={() => setAdding(true)}>Add {one}…</button></div>
    {hint && <p className="muted" style={{ margin: 0 }}>{hint}</p>}
    {rows.length === 0 ? <p className="muted">None yet.</p> : <div className="scroll-x"><table className="data">
      <thead><tr><th>{title}</th>{(STACKS.has(kind) || kind === 'armor') && <th>{kind === 'armor' ? 'Worn' : 'Qty'}</th>}
        {ware && <th className="num">Essence</th>}<th className="num">Avail</th><th className="num">Cost</th><th /></tr></thead>
      <tbody>{rows.map(x => {
        const e = entryOf(x, data), name = e?.name ?? x.name ?? 'Custom item', p = priced(x, data, cr)
        return <tr key={x.uid}>
          <td><LineName x={x} />
            <RatingGrade x={x} name={name} grades={grades} />
            {detail && <div className="muted">{detail(x)}</div>}
            {accessories && <div><Accessories host={x} name={name} {...accessories} /></div>}
            {bonuses && <div><Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={!!x.rating} /></div>}</td>
          {STACKS.has(kind) && <td><Stepper label={`${name} quantity`} value={x.qty} min={1} max={999} onChange={qty => act({ op: 'quantity', uid: x.uid, qty })} /></td>}
          {kind === 'armor' && <td><input type="checkbox" aria-label={`${name} is worn`} checked={!!x.worn} onChange={ev => act({ op: 'wear', uid: x.uid, worn: ev.target.checked })} /></td>}
          {ware && <td className="num">{n(p.essence)}</td>}
          <td className="num">{p.avail}{legality(e?.attrs.avail) ? `(${legality(e?.attrs.avail)})` : ''}</td>
          <td className="num">{n(p.cost)}¥{!p.ok && <span className="warn" title="A value the app can’t read counts 0"> ?</span>}</td>
          <td className="num"><button className="btn small quiet" aria-label={`Remove ${name}`} onClick={() => act({ op: 'purchase', remove: x.uid })}>Remove</button></td>
        </tr>
      })}</tbody>
    </table></div>}
    <CatalogPicker title={`Add ${one}`} open={adding} onClose={() => setAdding(false)} kinds={[kind]} grades={grades}
      onAdd={p => act({ op: 'purchase', kind, id: p.e.id, rating: p.rating, grade: p.grade })} />
  </section>
}

// Picker: the per-kind pieces of a purchase tab: a line's rating and grade, choice and option fields, the starter-pack options, and
// PurchaseSection (one kind of purchase as a table). Moved out of Picker.tsx unchanged; Picker.tsx re-exports them.
import { effectiveAvailability } from '../domain/creation/rule-markers'
import { subChoices, VARIANT } from '../../catalog/domain/structure'
import { customisable } from '../domain/assets/builders'
import { useState, type ReactNode } from 'react'
import { Stepper } from '../../../core/ui-kit/bits'
import { entryOf, priced } from '../domain/creation/budgets'
import { choiceCtx, choiceOptions, choiceSelectOptions, type ChoiceSpec } from '../domain/creation/choices'
import { availNote, chosenRating, legality } from '../../catalog/domain/values'
import { formulaOf, formulaText } from '../../../core/shared/formula'
import { sinName, type PurchaseKind, type Sr6Purchase, type Sr6Quality } from '../../formats/domain/character'
import { type Sr6Entry } from '../../formats/domain/types'
import { gradeName, gradeOptions } from '../domain/creation/grades'
import { entryLabel, stacks as itemStacks } from '../../catalog/domain/categories'
import { n, sr6EditHref, useSr6Editor } from './editor'
import { MAX_CHOSEN, gradeLabel, LineName, CatalogPicker } from './PickerCatalog'
import { levelsOf, Accessories } from './PickerAccessories'
import { Situational, Bonuses } from './PickerBonuses'

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

/** One kind of purchase as a table: name (rating, grade, source), what `detail` adds, accessories and bonuses; quantity
 *  where lines stack, worn for armor, Essence for augmentations, Availability, cost; and its picker. */
export const CHOICE_PROMPT: Record<string, string> = {
  attribute: 'For which attribute',
  skill: 'For which skill',
  quality: 'Which',
  matrix: 'Which Matrix attribute',
  spell: 'Which spell',
  specialization: 'Which specialization',
  list: 'Which',
  text: 'Which (type it)',
}
/** A choice's input: the ordered dropdown, or a free-text box (committed on blur) when the catalog can't list it. */
export function ChoiceField({ co, value, label, onChange }: { co: ChoiceSpec; value?: string; label: string; onChange: (v: string) => void }) {
  if (co.count && co.count > 1) {
    // a book asking for several picks (Natural Venom's 4 vectors): that many pickers, stored joined by `; `
    const vals = (value ?? '').split('; ')
    return (
      <>
        {Array.from({ length: co.count }, (_, i) => (
          <ChoiceField
            key={i}
            co={{ ...co, count: undefined }}
            value={vals[i] ?? ''}
            label={`${label} ${i + 1}`}
            onChange={v => {
              const next = Array.from({ length: co.count! }, (_, j) => (j === i ? v : (vals[j] ?? '')))
              onChange(next.every(x => !x) ? '' : next.join('; '))
            }}
          />
        ))}
      </>
    )
  }
  if (co.kind === 'text')
    return (
      <input
        key={value ?? ''}
        defaultValue={value ?? ''}
        maxLength={200}
        aria-label={label}
        placeholder={CHOICE_PROMPT.text}
        onBlur={ev => ev.target.value.trim() !== (value ?? '') && onChange(ev.target.value.trim())}
      />
    )
  return (
    <select aria-label={label} value={value ?? ''} onChange={ev => onChange(ev.target.value)}>
      <option value="">Pick one</option>
      {choiceSelectOptions(co, value).map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
/** A line's sub-option and variant picks (structure.ts subChoices: Allergy's allergen and severity, a cyberarm's
 *  variant), each a ChoiceField listing what an option adds or what a variant costs; picking one reprices the line and
 *  turns on its effects. */
export function OptionFields({ line, e, name }: { line: Sr6Purchase | Sr6Quality; e: Sr6Entry | undefined; name: string }) {
  const { act } = useSr6Editor()
  const quality = e?.kind === 'qualities'
  return (
    <>
      {subChoices(e).map(c => {
        const what = c.ref === VARIANT ? 'Variant' : c.ref.replace(/_/g, ' ')
        const co: ChoiceSpec = {
          kind: 'list',
          options: c.options.map(o => ({
            value: o.id,
            label: [
              o.label,
              o.cost ? `+${o.cost}${quality ? ' Karma' : '¥'}` : '',
              o.price !== undefined ? `${o.price}¥` : '',
              o.essence !== undefined ? `Ess ${o.essence}` : '',
              o.avail ? `Avail ${o.avail}` : '',
            ]
              .filter(Boolean)
              .join(', '),
          })),
          ...(c.count > 1 ? { count: c.count } : {}),
        }
        const ids = (line.options?.[c.ref] ?? '').split(',').filter(Boolean)
        return (
          <label key={c.ref} className="inline">
            {what[0].toUpperCase() + what.slice(1)}{' '}
            <ChoiceField
              co={co}
              value={ids.join('; ')}
              label={`${name}: ${what}`}
              onChange={v => act({ op: 'lineOptions', uid: line.uid, ref: c.ref, value: v.split('; ').filter(Boolean).join(',') })}
            />
          </label>
        )
      })}
    </>
  )
}
/** A purchased item that names a choice (an attribute/skill/quality/matrix): the ordered picker that records it, so a
 *  cyberware or gear choice applies the same way a quality's or power's does. Nothing for an item with no choice. */
function ChoiceNote({ x, e, name }: { x: Sr6Purchase; e: Sr6Entry | undefined; name: string }) {
  const { data, act, ch } = useSr6Editor()
  const co = e && choiceOptions(data, e, choiceCtx(data, ch.build))
  if (!co) return null
  return (
    <label className="inline">
      {CHOICE_PROMPT[co.kind]}{' '}
      <ChoiceField co={co} value={x.note} label={`${name}: ${co.kind} choice`} onChange={v => act({ op: 'purchaseNote', uid: x.uid, note: v })} />
    </label>
  )
}
/** The starter packs as <option>s, grouped (<optgroup>) by the book's own section (Complete Character PACKs, Rifles, Cars, ...), A to Z, each with its price. */
export function packChoices(packs: Iterable<Sr6Entry>): ReactNode {
  const groups = new Map<string, Sr6Entry[]>()
  for (const e of [...packs].sort((a, z) => a.name.localeCompare(z.name))) {
    const g = e.attrs.category || 'Other'
    groups.set(g, [...(groups.get(g) ?? []), e])
  }
  return [...groups]
    .sort(([a], [z]) => a.localeCompare(z))
    .map(([g, es]) => (
      <optgroup key={g} label={g}>
        {es.map(e => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.attrs.cost ? ` · ${e.attrs.cost}¥` : ''}
          </option>
        ))}
      </optgroup>
    ))
}
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
  show,
}: {
  kind: PurchaseKind
  title: string
  one: string
  grades?: boolean
  detail?: (x: Sr6Purchase) => ReactNode
  /** which catalog entries the picker offers (none: all) */
  offer?: (e: Sr6Entry) => boolean
  /** which of the kind's lines it lists (none: all) */
  show?: (x: Sr6Purchase) => boolean
  accessories?: { kinds: PurchaseKind[]; filter?: (e: Sr6Entry) => boolean; critter?: boolean }
  bonuses?: boolean
  hint?: ReactNode
}) {
  const { ch, data, cr, act, d } = useSr6Editor()
  const [adding, setAdding] = useState(false)
  const rows = ch.build.purchases.filter(x => x.kind === kind && (!show || show(x)))
  const qtyCol = rows.some(x => itemStacks(x.kind, entryOf(x, data)))
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
                {(qtyCol || kind === 'armor') && <th>{kind === 'armor' ? 'Worn' : 'Qty'}</th>}
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
                  sins = ch.build.sins,
                  note = availNote(
                    e?.attrs.avail,
                    x.rating ?? 1,
                    sins.filter(s => s.licences.some(l => l.item === x.uid)).map(s => sinName(s)),
                  ),
                  licence = note.text
                return (
                  <tr key={x.uid} data-target={x.uid}>
                    <td>
                      <LineName x={x} />
                      {customisable(x, data) && (
                        // the weapon or cyberware builder on this line (owner ruling 1)
                        <a className="btn small quiet" href={sr6EditHref(ch.id, `build/${x.uid}`)} aria-label={`Customise ${name}`}>
                          Customise
                        </a>
                      )}
                      <RatingGrade x={x} name={name} grades={grades} />
                      <ChoiceNote x={x} e={e} name={name} />
                      <OptionFields line={x} e={e} name={name} />
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
                      <Situational line={x} name={name} />
                      {bonuses && (
                        <div>
                          <Bonuses uid={x.uid} name={name} bonuses={x.bonuses} rated={!!x.rating} />
                        </div>
                      )}
                    </td>
                    {qtyCol && (
                      <td>
                        {itemStacks(x.kind, e) && (
                          <Stepper label={`${name} quantity`} value={x.qty} min={1} max={999} onChange={qty => act({ op: 'quantity', uid: x.uid, qty })} />
                        )}
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
                        {(
                          [
                            ['CUSTOM_FITTED', 'custom-fitted'],
                            ['CHEAP_KNOCK_OFF', 'cheap knockoff'],
                          ] as const
                        ).map(([f, label]) => (
                          <label key={f} className="small" title={`${name}: ${label}`}>
                            {' '}
                            <input
                              type="checkbox"
                              aria-label={`${name} is ${label}`}
                              checked={!!x.flags?.includes(f)}
                              onChange={ev => act({ op: 'itemFlag', uid: x.uid, flag: f, on: ev.target.checked })}
                            />
                            {label}
                          </label>
                        ))}
                      </td>
                    )}
                    {ware && <td className="num">{n(p.essence)}</td>}
                    <td className="num">
                      {effectiveAvailability(ch.build, data, p.avail)}
                      {legality(e?.attrs.avail) ? `(${legality(e?.attrs.avail)})` : ''}
                      {licence && `, ${licence.replace(/^\d+(?:\([LIF]\))?, /, '')}`}
                      {note.warn && (
                        <span className="warn" title={note.warn} aria-label={note.warn}>
                          {' '}
                          ⚑
                        </span>
                      )}
                      {/* (licences are managed where SINs are, Contacts: owner 2026-10-16; here only read) */}
                      {licence && note.warn && (
                        <div className="muted">
                          Licence needed — assign it on <a href={sr6EditHref(ch.id, 'contacts')}>Contacts</a>
                        </div>
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
        quantity
        onAdd={p => act({ op: 'purchase', kind, id: p.e.id, rating: p.rating, grade: p.grade, qty: p.qty })}
      />
    </section>
  )
}

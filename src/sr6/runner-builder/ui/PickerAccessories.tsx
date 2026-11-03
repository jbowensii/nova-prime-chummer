// Picker: the accessories fitted to a line (each removable, and the picker to fit another), an ammunition line's material, and the
// accessory kinds. Moved out of Picker.tsx unchanged; Picker.tsx re-exports them.
import { slotLabel } from '../../catalog/domain/structure'
import { instructionPools, instructionText, partsOf } from '../domain/assets/vehiclemods'
import { accessoryState } from '../domain/assets/builders'
import { useState } from 'react'
import { Stepper } from '../../../core/ui-kit/bits'
import { entryOf, materialOf, takesMaterial } from '../domain/creation/budgets'
import { chosenRating, ratingRange } from '../../catalog/domain/values'
import { type PurchaseKind, type Sr6Purchase } from '../../formats/domain/character'
import { type Sr6Entry } from '../../formats/domain/types'
import type { Sr6Data } from '../../catalog/domain/data'
import { gradeName, gradeOptions } from '../domain/creation/grades'
import { entryLabel, isAmmoType } from '../../catalog/domain/categories'
import { n, useSr6Editor } from './editor'
import { Sr6Ref } from './EntryRef'
import { MAX_CHOSEN, gradeLabel, CatalogPicker } from './PickerCatalog'
import { Bonuses } from './PickerBonuses'

/** The accessories fitted to a line, each removable, and the picker to fit another: every accessory whose category names
 *  hosts (one naming others marked: it may still be fitted, Review's catalog.accessoryHost); one whose category names no
 *  host, by `filter`. An owned critter's (`critter`): whatever `filter` offers, critter-only entries too. An ammunition
 *  line's (`ammo`): the ammunition types `filter` offers. */
export function Accessories({
  host,
  name,
  kinds,
  filter,
  critter,
  ammo,
}: {
  host: Sr6Purchase
  name: string
  kinds: PurchaseKind[]
  filter?: (e: Sr6Entry) => boolean
  critter?: boolean
  ammo?: boolean
}) {
  const { act, data, cr } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const { remaining, slots, full, fits, blocked } = accessoryState(host, data, { filter, isAccessory, critter, ammo })
  return (
    <span className="row">
      {remaining !== null && <span className="muted">Capacity remaining: {n(remaining)}</span>}
      {[...slots.remaining].map(([id, left]) => (
        <span key={id} className="muted">
          {slotLabel(id)} slots remaining: {n(left)}
        </span>
      ))}
      {host.kind === 'weapons' &&
        partsOf(host, data).map(p => (
          // a weapon's standard upgrades (the catalog's <part>s): in its price, removable and restorable (as a vehicle's parts)
          <span key={`part:${p.id}`} className={p.removed ? 'chip muted' : 'chip'}>
            <Sr6Ref kind={p.entry?.kind ?? 'weapons'} id={p.entry?.id}>
              {p.name}
            </Sr6Ref>
            {p.removed ? ' (removed)' : ' (standard)'}{' '}
            <button
              className="btn small quiet"
              aria-label={`${p.removed ? 'Restore' : 'Remove'} standard upgrade ${p.name} ${p.removed ? 'on' : 'from'} ${name}`}
              onClick={() => act({ op: 'part', uid: host.uid, ...(p.removed ? { restore: p.id } : { remove: p.id }) })}
            >
              {p.removed ? 'restore' : '×'}
            </button>
          </span>
        ))}
      {instructionPools(host, data).map(i => (
        // a factory tutorsoft's Instruction pool (CRB p. 273): a switch, as the situational effects have
        <label key={i.key} className="chip">
          <input
            type="checkbox"
            role="switch"
            checked={i.on}
            aria-label={`${instructionText(i)}, on ${name}`}
            onChange={e => act({ op: 'situational', uid: host.uid, key: i.key, times: e.target.checked ? 1 : 0 })}
          />{' '}
          {i.on ? instructionText(i) : `Instruction pool (${i.skill}) off`}
        </label>
      ))}
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
            {slots.occupied.has(a.uid) && <span className="muted"> · {slotLabel(slots.occupied.get(a.uid)!)}</span>}
            {implant && host.grade && (
              <span className="muted" title="An add-on has its implant’s grade (core rulebook p. 282)">
                {' '}
                {gradeName(data, host.grade)}
              </span>
            )}
            <button aria-label={`Remove ${label} from ${name}`} onClick={() => act({ op: 'accessory', host: host.uid, remove: a.uid })}>
              ×
            </button>
            <MaterialPick x={a} name={`${own} on ${name}`} />
            {/* what it does to its host (a cyberlimb's Strength), never to the runner */}
            <Bonuses uid={a.uid} name={`${own} on ${name}`} bonuses={a.bonuses} rated={!!a.rating} />
          </span>
        )
      })}
      <button className="btn small quiet" aria-label={`Add an accessory to ${name}`} disabled={full} onClick={() => setOpen(true)}>
        {critter ? 'Critterware or gear…' : ammo ? 'Ammunition type…' : 'Accessory…'}
      </button>
      <CatalogPicker
        title={`Add an accessory to ${name}`}
        open={open}
        onClose={() => setOpen(false)}
        kinds={kinds}
        critter={critter}
        filter={fits}
        blocked={blocked}
        onAdd={p => act({ op: 'accessory', host: host.uid, kind: p.e.kind as PurchaseKind, id: p.e.id, rating: p.rating })}
      />
    </span>
  )
}

/** An ammunition line's material (purchases.ts materialOf: Bestial Nature p. 36's copper, silver, gold), chosen or taken
 *  off; nothing on a line that is no ammunition or when no book with materials is imported. */
export function MaterialPick({ x, name }: { x: Sr6Purchase; name: string }) {
  const { data, act } = useSr6Editor()
  if (!takesMaterial(x, data) || !data.materials.length) return null
  // (owner to-do: any ammunition, its types too; the book's own rule shown when they are combined, for the GM)
  const combined = !!x.material && (isAmmoType(entryOf(x, data)) || x.accessories.some(a => isAmmoType(entryOf(a, data))))
  return (
    <label className="inline" title={MATERIAL_RULE}>
      Material{' '}
      <select aria-label={`${name}: material`} value={x.material ?? ''} onChange={ev => act({ op: 'material', uid: x.uid, material: ev.target.value || null })}>
        <option value="">None</option>
        {[...data.materials]
          .sort((a, z) => (materialOf(data, a.id)?.name ?? '').localeCompare(materialOf(data, z.id)?.name ?? ''))
          .map(e => {
            const m = materialOf(data, e.id)
            return (
              m && (
                <option key={e.id} value={e.id}>
                  {m.name} (×{m.times} the price)
                </option>
              )
            )
          })}
      </select>
      {combined && <span className="muted small"> {MATERIAL_RULE}</span>}
    </label>
  )
}
const MATERIAL_RULE = 'Bestial Nature p. 36: silver bullets “may not be combined with other types of ammunition” (the GM’s call; not enforced).'

/** An entry of an accessory category (its record names the hosts it fits; one that names none, by its category's word). */
export const isAccessory = (e: Sr6Entry) => /accessor|modification|\bmods?\b|enhancement/i.test(e.attrs.category ?? '')
/** The kinds an accessory may be printed as (a cyberlimb's are augmentations, the core rulebook's weapon accessories
 *  weapons): the picker keeps those that fit the line. */
export const ACCESSORY_KINDS: PurchaseKind[] = ['gear', 'weapons', 'augmentations', 'electronics', 'armor']

/** The ratings a line can be set to: its family's levels (levels.ts: the select moves the line to that level's entry),
 *  else the entry's printed range. */
export const levelsOf = (data: Sr6Data, x: Sr6Purchase): number[] => {
  const sibs = x.id ? data.siblings(x.kind, x.id) : []
  return sibs.length > 1 ? sibs.map(s => data.levelOf(s)!) : ratingRange(entryOf(x, data)?.attrs.rating)
}

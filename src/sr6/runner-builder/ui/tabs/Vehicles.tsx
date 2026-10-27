// Vehicles and Drones (owner 2026-10-16: two tabs, a drone by its class or category): each owned one with its stats as
// the catalog prints them, what's fitted to it, and its Modify panel (src/sr6/runner-builder/domain/assets/vehiclemods.ts): with Double
// Clutch among the table's books its mod slots and hardpoints, else the core rulebook's weapon mounts; mods, weapons in
// mounts, a drone's autosofts; the mods built in; a do-it-yourself box on each mod. Capacity is enforced when fitting.
// After finalising the tabs are read only: mods are fitted and taken off on the Ledger. Your designs (the Designer) are
// bought here too (after finalising: on the Ledger).
import { useState } from 'react'
import { Stepper } from '../../../../core/ui-kit/bits'
import { cargoFactor, diyAllowed, entryOf, isDrone, modKind, priced, seatsOf } from '../../domain/creation/budgets'
import { boughtDesign, designOf } from '../../domain/assets/design'
import { entryLabel } from '../../../catalog/domain/categories'
import { flag } from '../../../table-setup/domain/creation'
import { builtinText, modsOf, mountsOf, shiftProblem, type Meter } from '../../domain/assets/vehiclemods'
import { SHIFT_KINDS, type ShiftKind, type SlotKind, type Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { n, reasonText, useSr6Editor } from '../editor'
import { useSr6Designs } from '../repo'
import { CatalogPicker, isAccessory, PurchaseSection } from '../Picker'

const STATS: [string, string][] = [
  ['handling', 'Handling'],
  ['accel', 'Accel'],
  ['interval', 'Speed interval'],
  ['topSpeed', 'Top speed'],
  ['body', 'Body'],
  ['armor', 'Armor'],
  ['pilot', 'Pilot'],
  ['sensor', 'Sensor'],
  ['seats', 'Seats'],
]

export const VehiclesTab = () => <Owned drones={false} />
export const DronesTab = () => <Owned drones />

function Owned({ drones }: { drones: boolean }) {
  const { data, cr, act } = useSr6Editor()
  // the option cargoWithoutSeats (Double Clutch p. 126): seats taken out add to the Cargo Factor
  const cargo = !!flag(cr, 'cargoWithoutSeats')
  return (
    <div className="stack">
      <h2>{drones ? 'Drones' : 'Vehicles'}</h2>
      <BuyDesign drones={drones} />
      <PurchaseSection
        kind="vehicles"
        title={drones ? 'Drones' : 'Vehicles'}
        one={drones ? 'a drone' : 'a vehicle'}
        offer={e => isDrone(e) === drones}
        show={x => isDrone(entryOf(x, data)) === drones}
        accessories={{ kinds: ['gear', 'electronics', 'programs'] }}
        detail={x => {
          const e = entryOf(x, data),
            a = e?.attrs ?? {},
            cf = cargo ? cargoFactor(x, e) : null
          return (
            <>
              {STATS.filter(([k]) => a[k])
                .map(([k, l]) => `${l} ${a[k]}`)
                .join(' · ')}
              {cf && (
                <span className="row">
                  Seats removed{' '}
                  <Stepper
                    label={`${e!.name} seats removed`}
                    value={x.seatsRemoved ?? 0}
                    min={0}
                    max={seatsOf(e)}
                    onChange={removed => act({ op: 'seats', uid: x.uid, removed })}
                  />{' '}
                  Seats {cf.seats} · Cargo Factor {cf.cargo}
                </span>
              )}
              <Modify x={x} name={e ? entryLabel(e) : (x.name ?? 'Custom item')} />
            </>
          )
        }}
      />
    </div>
  )
}

/** Buy one of your designs (the Designer) as a vehicle or drone: its line holds the design as it works out now. */
function BuyDesign({ drones }: { drones: boolean }) {
  const { data, cr, act, career } = useSr6Editor()
  const designs = useSr6Designs().filter(ch => (ch.design!.kind === 'drone') === drones)
  const [pick, setPick] = useState('')
  const doc = designs.find(ch => ch.id === pick) ?? designs[0]
  if (!designs.length)
    return (
      <p className="muted">
        Your designs: none yet. <a href="#/sr6/designs">Design {drones ? 'a drone' : 'a vehicle'} in the Designer</a>.
      </p>
    )
  return (
    <div className="row">
      <label className="inline">
        Your designs{' '}
        <select aria-label="Your designs" value={doc.id} onChange={e => setPick(e.target.value)}>
          {designs.map(ch => (
            <option key={ch.id} value={ch.id}>
              {ch.identity.streetName || 'Unnamed design'} · {n(designOf(ch.design!, data, cr).price)}¥
            </option>
          ))}
        </select>
      </label>
      {career ? (
        <span className="muted">After finalising, buy it on the Ledger.</span>
      ) : (
        <button className="btn small" onClick={() => act({ op: 'design', line: boughtDesign(doc, data, cr) })}>
          Buy design
        </button>
      )}
    </div>
  )
}

const ADD: Record<'mod' | 'weapon' | 'autosoft', { title: string; kinds: Sr6Kind[]; filter: (e: Sr6Entry) => boolean }> = {
  mod: { title: 'a mod', kinds: ['gear'], filter: e => modKind(e) !== null },
  weapon: { title: 'a weapon', kinds: ['weapons'], filter: e => !isAccessory(e) },
  autosoft: { title: 'an autosoft', kinds: ['programs'], filter: e => /autosoft/i.test(e.attrs.type ?? '') },
}
/** The mod-slot families a GM can add to a vehicle instance (the add-slot escape hatch, actions.ts `slot` op). */
const SLOT_VOCAB = [
  'vehicle-chassis',
  'vehicle-powertrain',
  'vehicle-electronics',
  'vehicle-cf',
  'vehicle-accessory',
  'vehicle-tires',
  'vehicle-hardpoint',
  'vehicle-weapon',
  'vehicle-weapon-small',
  'vehicle-weapon-large',
]
const meter = (label: string, m: Meter) => (
  <span key={label} className={m.used > m.max ? 'warn' : undefined}>
    {label} {n(m.used)}/{n(m.max)}
  </span>
)

/** One vehicle's or drone's Modify panel: its meters, the mods built in, a do-it-yourself box on each mod, a mount for
 *  each weapon, and the pickers for a mod, a weapon or (a drone) an autosoft. Each fitted line comes off by its × above. */
function Modify({ x, name }: { x: Sr6Purchase; name: string }) {
  const { data, cr, act } = useSr6Editor()
  const [adding, setAdding] = useState<keyof typeof ADD | null>(null)
  const [shift, setShift] = useState<{ from: ShiftKind; to: ShiftKind }>({ from: 'chassis', to: 'powertrain' })
  const [slot, setSlot] = useState<{ id: string; value: string }>({ id: 'vehicle-chassis', value: '' })
  const m = modsOf(x, data),
    why = shiftProblem(x, shift.from, shift.to, data)
  const label = (a: Sr6Purchase) => (e => (e ? entryLabel(e) : (a.name ?? 'Custom item')))(entryOf(a, data))
  // a removed built-in's name, by its builtin uid (`builtin:<n>`: its place among the entry's <builtin>s)
  const builtinName = (uid: string) =>
    (entryOf(x, data)?.parts ?? []).filter(p => p.tag === 'builtin' && p.attrs.name)[Number(uid.split(':')[1])]?.attrs.name ?? uid
  const mounts = mountsOf(x, data) // (fitted, then built in)
  const freeMounts = mounts.filter(mt => !x.accessories.some(a => a.mount === mt.uid))
  const rows = x.accessories.filter(a => a.kind === 'weapons' || diyAllowed(entryOf(a, data)))
  const add = (k: keyof typeof ADD) => (p: { e: Sr6Entry; rating?: number }) => {
    // a weapon goes into the first mount with none in it (changed below)
    const free = k === 'weapon' ? mounts.find(mt => !x.accessories.some(a => a.mount === mt.uid)) : undefined
    return act({ op: 'accessory', host: x.uid, kind: p.e.kind as Sr6Purchase['kind'], id: p.e.id, rating: p.rating, ...(free ? { mount: free.uid } : {}) })
  }
  return (
    <div className="stack" aria-label={`Modify ${name}`} style={{ gap: '0.25rem' }}>
      <b>Modify</b>
      <label className="row">
        Price (¥, optional: GM adjusts, needs approval)
        <input
          key={x.gmPrice ?? 'none'}
          aria-label="Adjusted price"
          type="number"
          min={0}
          defaultValue={x.gmPrice}
          placeholder={String(Math.round(priced({ ...x, gmPrice: undefined }, data, cr).cost))}
          onBlur={ev => {
            const t = ev.target.value.trim(),
              v = Number(t),
              base = priced({ ...x, gmPrice: undefined }, data, cr).cost
            act({ op: 'gmprice', uid: x.uid, ...(t && Number.isFinite(v) && v >= 0 && v !== base ? { value: v } : {}) })
          }}
        />
      </label>
      <span>Weapon mounts remaining: {freeMounts.length}</span>
      <span className="muted">
        Remaining:{' '}
        {[
          ...(m.slots ? (Object.keys(m.slots) as SlotKind[]).map(k => [k, m.slots![k]] as const) : []),
          ['hardpoints', m.hardpoints] as const,
          ['mounts', m.mounts] as const,
          ['autosofts', m.autosofts] as const,
        ]
          .filter(([, v]) => v)
          .map(([label, v]) => label + ': ' + n(v!.max - v!.used))
          .join('; ')}
      </span>
      <span>
        {m.dc
          ? 'Double Clutch: mod slots per category, its Body each (p. 120); hardpoints, one standard per 3 Body (p. 124).'
          : 'Core rulebook: weapon mounts up to Body / 3, a heavy one counting two (p. 295); mods simply bought.'}
      </span>
      <span>
        {[
          ...(m.slots ? (Object.keys(m.slots) as SlotKind[]).map(k => meter(`${k[0].toUpperCase()}${k.slice(1)} slots`, m.slots![k]!)) : []),
          ...(m.hardpoints ? [meter('Hardpoints', m.hardpoints)] : []),
          ...(m.mounts ? [meter('Weapon mounts', m.mounts)] : []),
          ...(m.autosofts ? [meter('Autosofts', m.autosofts)] : []),
        ].flatMap((el, i) => (i ? [' · ', el] : [el]))}
      </span>
      {m.slots && (
        <span className="row">
          Shift slots (p. 120): two
          <select aria-label={`Shift from on ${name}`} value={shift.from} onChange={ev => setShift({ ...shift, from: ev.target.value as ShiftKind })}>
            {SHIFT_KINDS.map(k => (
              <option key={k}>{k}</option>
            ))}
          </select>
          into one
          <select aria-label={`Shift to on ${name}`} value={shift.to} onChange={ev => setShift({ ...shift, to: ev.target.value as ShiftKind })}>
            {SHIFT_KINDS.map(k => (
              <option key={k}>{k}</option>
            ))}
          </select>
          <button
            className="btn small quiet"
            aria-label={`Shift slots on ${name}`}
            title={why ? reasonText(why) : undefined}
            disabled={!!why}
            onClick={() => act({ op: 'shift', uid: x.uid, ...shift })}
          >
            Shift
          </button>
          {m.shifts!.map((t, i) => (
            <span key={i} className="chip">
              2 {t.from} → 1 {t.to}{' '}
              <button className="btn small quiet" aria-label={`Undo shift ${i + 1} on ${name}`} onClick={() => act({ op: 'shift', uid: x.uid, remove: i })}>
                ×
              </button>
            </span>
          ))}
        </span>
      )}
      <span className="row" aria-label={`Add a mod slot to ${name}`}>
        GM add slot:
        <select aria-label={`Slot family on ${name}`} value={slot.id} onChange={ev => setSlot({ ...slot, id: ev.target.value })}>
          {SLOT_VOCAB.map(id => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <input
          aria-label={`Slot capacity on ${name}`}
          placeholder="capacity"
          size={6}
          value={slot.value}
          onChange={ev => setSlot({ ...slot, value: ev.target.value })}
        />
        <button
          className="btn small quiet"
          aria-label={`Add slot on ${name}`}
          onClick={() => act({ op: 'slot', uid: x.uid, id: slot.id, ...(slot.value.trim() ? { value: slot.value.trim() } : {}) })}
        >
          Add
        </button>
        {(x.addedSlots ?? []).map((s, i) => (
          <span key={i} className="chip">
            {s.id}
            {s.value ? ` ${s.value}` : ''}{' '}
            <button className="btn small quiet" aria-label={`Remove added slot ${i + 1} on ${name}`} onClick={() => act({ op: 'slot', uid: x.uid, remove: i })}>
              ×
            </button>
          </span>
        ))}
      </span>
      {(m.builtin.length > 0 || m.notes.length > 0 || (x.removedBuiltins?.length ?? 0) > 0) && (
        <span className="row">
          Built in (already paid for):
          {m.builtin.map(b => (
            <span key={b.uid} className="chip">
              {builtinText(b)}{' '}
              <button
                className="btn small quiet"
                aria-label={`Remove built-in ${builtinText(b)} from ${name}`}
                onClick={() => act({ op: 'builtin', uid: x.uid, remove: b.uid })}
              >
                ×
              </button>
            </span>
          ))}
          {(x.removedBuiltins ?? []).map(uid => (
            <span key={uid} className="chip muted">
              {builtinName(uid)} (removed){' '}
              <button
                className="btn small quiet"
                aria-label={`Restore built-in ${builtinName(uid)} on ${name}`}
                onClick={() => act({ op: 'builtin', uid: x.uid, restore: uid })}
              >
                restore
              </button>
            </span>
          ))}
          {m.notes.map(t => (
            <span key={t} className="note">
              {' '}
              {t}
            </span>
          ))}
        </span>
      )}
      {rows.map(a => {
        const f = m.fitted.find(y => y.uid === a.uid)!
        return (
          <span key={a.uid} className="row">
            {label(a)}
            {a.kind === 'weapons' ? (
              <select
                aria-label={`${label(a)} on ${name}: weapon mount`}
                value={a.mount ?? ''}
                onChange={ev => act({ op: 'mount', uid: a.uid, mount: ev.target.value || null })}
              >
                <option value="">In no mount</option>
                {mounts.map(mt => (
                  <option key={mt.uid} value={mt.uid} disabled={x.accessories.some(other => other.uid !== a.uid && other.mount === mt.uid)}>
                    In {mt.name}
                    {mt.builtin ? ' (built in)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                {' · '}
                {f.kind === 'hardpoint' ? 'on a hardpoint' : `${f.kind}${m.dc ? `, ${n(f.slots)} slot${f.slots === 1 ? '' : 's'}` : ''}`} ·{' '}
                {n(priced(a, data, cr).cost)}¥
                <label className="inline">
                  <input
                    type="checkbox"
                    aria-label={`${label(a)} on ${name}: do it yourself`}
                    checked={!!a.diy}
                    onChange={ev => act({ op: 'diy', uid: a.uid, diy: ev.target.checked })}
                  />{' '}
                  Do it yourself (half price; the install test is the GM’s)
                </label>
              </>
            )}
          </span>
        )
      })}
      <span className="row">
        <button className="btn small quiet" aria-label={`Add a mod to ${name}`} onClick={() => setAdding('mod')}>
          Mod…
        </button>
        <button className="btn small quiet" aria-label={`Add a weapon to ${name}`} disabled={!freeMounts.length} onClick={() => setAdding('weapon')}>
          Weapon…
        </button>
        {m.drone && (
          <button
            className="btn small quiet"
            aria-label={`Add an autosoft to ${name}`}
            disabled={!!m.autosofts && m.autosofts.used >= m.autosofts.max}
            onClick={() => setAdding('autosoft')}
          >
            Autosoft…
          </button>
        )}
      </span>
      {adding && (
        <CatalogPicker
          title={`Add ${ADD[adding].title} to ${name}`}
          open
          onClose={() => setAdding(null)}
          kinds={ADD[adding].kinds}
          filter={ADD[adding].filter}
          onAdd={add(adding)}
        />
      )}
    </div>
  )
}

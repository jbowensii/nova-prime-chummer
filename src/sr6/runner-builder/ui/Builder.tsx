// The weapon and cyberware builders (#/sr6/c/<id>/build/<uid>[/<uid>]; owner rulings, weapon-cyber-builders): a full page
// editing one line. A weapon: its stats base → fitted (pinned), its mounts with the factory parts as chips (removable,
// restorable) and a picker per mount offering only what fits, requirement failures greyed with why, the switched
// bonuses as switches. An implant: its grade (its add-ons take it), Essence, Capacity, cost and Availability, a limb's own
// stats, a custom limb's attribute increases, its add-ons (a weapon built in opens this page on that weapon). Every
// change is an engine step (act) at creation, a recorded spend in career (the Ledger's: a removed add-on refunds what the
// GM types, a factory part nothing). Also: a player's own add-on (Review asks a GM), and Save as design.
import { useState } from 'react'
import { Modal, Stepper } from '../../../core/ui-kit/bits'
import { canEdit, useMe } from '../../../core/ui-kit/auth'
import { newId } from '../../../core/shared/types'
import { saveAsNew } from '../../../features/runner-store/repo'
import type { Sr6Advance, Sr6Purchase } from '../../formats/domain/character'
import { blankSr6 } from '../../formats/domain/character'
import { capacityOf, capacityUsed, entryLabel } from '../../catalog/domain/categories'
import { hookBudgets, slotLabel, structureOf } from '../../catalog/domain/structure'
import { entryOf, priced, ratingOf } from '../domain/creation/purchases'
import { weaponSkill } from '../domain/creation/derive'
import { gradeName, gradeOptions } from '../domain/creation/grades'
import { bandsText, weaponOf, type WeaponStats } from '../domain/assets/weapons'
import { partsOf } from '../domain/assets/vehiclemods'
import {
  accessoryState,
  addonBlocked,
  boughtItemDesign,
  customAddon,
  CYBERLIMBS,
  customLimb,
  itemDesignOf,
  limbIncrease,
  limbOf,
  LIMB_MAX,
  LIMB_STATS,
  lineAt,
  removalAdvance,
  type CustomAddon,
  type LimbLook,
  type LimbPart,
  type LimbStat,
} from '../domain/assets/builders'
import { n, reasonText, sr6EditHref, useSr6Editor } from './editor'
import { ACCESSORY_KINDS, CatalogPicker, isAccessory, LineName, Situational } from './Picker'
import { sr6DesignRepo, useItemDesigns } from './repo'

const OTHER = '__other'

/** The engine steps the builders take: creation's act, or career's recorded spends (null: done, else why not). */
function useSteps() {
  const { act, record, career } = useSr6Editor()
  const said = (r: string | null) => r && reasonText(r)
  return {
    career,
    add: (host: Sr6Purchase, line: Sr6Purchase) =>
      said(
        career
          ? record({ op: 'fit', target: host.uid, line })
          : line.id?.startsWith('custom.')
            ? act({ op: 'custom', host: host.uid, line })
            : act({ op: 'accessory', host: host.uid, kind: line.kind, id: line.id!, rating: line.rating }),
      ),
    /** an add-on changed in place (career: one 'upgrade' step, the price difference) */
    change: (old: Sr6Purchase, line: Sr6Purchase) => said(record({ op: 'upgrade', target: old.uid, line })),
    remove: (host: Sr6Purchase, a: Sr6Purchase, name: string) => {
      if (!career) return said(act({ op: 'accessory', host: host.uid, remove: a.uid }))
      // owner ruling 7: the GM types the refund (none: 0)
      const adv = removalAdvance(host, a.uid, false, window.prompt(`Refund for ${name} (nuyen; the GM decides, 0 for none)`, '0'))
      return adv ? said(record(adv)) : null
    },
    part: (host: Sr6Purchase, id: string, restore: boolean) =>
      said(
        career
          ? record({ op: 'part', target: host.uid, part: id, ...(restore ? { restore: true } : {}) } as Sr6Advance)
          : act({ op: 'part', uid: host.uid, ...(restore ? { restore: id } : { remove: id }) }),
      ),
  }
}

/** The builder page for the line at `path`. */
export function ItemBuilder({ path }: { path: string }) {
  const { ch, data } = useSr6Editor()
  const x = lineAt(ch.build, path)
  const back = sr6EditHref(ch.id, ch.build.purchases.find(p => p.uid === path.split('/')[0])?.kind === 'augmentations' ? 'augmentations' : 'gear')
  if (!x)
    return (
      <p>
        That item isn’t on this runner any more. <a href={back}>Back</a>
      </p>
    )
  const e = entryOf(x, data)
  const name = e ? entryLabel(e) : (x.name ?? 'Item')
  return (
    <div className="stack builder">
      <div className="row">
        <a className="btn small quiet" href={back}>
          ← Back
        </a>
        <h2 style={{ margin: 0 }}>
          {x.kind === 'weapons' ? 'Weapon builder' : 'Cyberware builder'}: <LineName x={x} />
        </h2>
        <span className="spacer" />
        <SaveDesign x={x} name={name} />
      </div>
      <ItemFitting x={x} name={name} path={path} subHref={sub => sr6EditHref(ch.id, `build/${sub}`)} />
    </div>
  )
}

/** The builder's body (its stats and its mounts): the runner's Customise page and the Designer's weapon and cyberware
 *  designs (sr6/designer, over a one-line scratch runner) both draw it, so the rules live once. `subHref`: where a weapon
 *  built into an implant opens (its uid path). */
export function ItemFitting({ x, name, path, subHref }: { x: Sr6Purchase; name: string; path: string; subHref: (path: string) => string }) {
  return (
    <>
      {x.kind === 'weapons' ? <WeaponStatBlock x={x} /> : <CyberPanel x={x} name={name} />}
      <Mounts x={x} name={name} path={path} subHref={subHref} />
    </>
  )
}

const ROWS: [string, (s: WeaponStats) => string][] = [
  ['Attack Ratings', s => bandsText(s.ar)],
  ['Damage', s => s.dv || '—'],
  ['Modes', s => s.modes || '—'],
  ['Ammo', s => s.ammo || '—'],
  [
    'Recoil (AR per mode)',
    s =>
      Object.entries(s.recoil)
        .map(([m, v]) => `${m} ${v}`)
        .join(', ') || '—',
  ],
  ['Concealability', s => (s.concealability > 0 ? `+${s.concealability}` : String(s.concealability))],
  ['Attack pool (fittings)', s => (s.pool > 0 ? `+${s.pool}` : String(s.pool))],
]

/** The pinned stat block: printed → as fitted (→ with every switched bonus on). */
function WeaponStatBlock({ x }: { x: Sr6Purchase }) {
  const { data, cr, d } = useSr6Editor()
  const w = weaponOf(x, data, weaponSkill(data, entryOf(x, data)))
  const base = priced({ ...x, accessories: [], removedParts: undefined }, data, cr),
    now = priced(x, data, cr)
  const pool = d.attackRatings.weapons.find(v => v.uid === x.uid)?.pool
  return (
    <div className="card" style={{ position: 'sticky', top: 0, zIndex: 2 }} aria-label="Weapon stats">
      <table className="data">
        <thead>
          <tr>
            <th />
            <th>Printed</th>
            <th>Fitted</th>
            <th>All switched on</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(([label, f]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{f(w.base)}</td>
              <td>
                <b>{f(w.now)}</b>
              </td>
              <td>{f(w.on)}</td>
            </tr>
          ))}
          {pool !== undefined && (
            <tr>
              <th scope="row">Attack dice pool</th>
              <td />
              <td>
                <b>{pool}</b>
              </td>
              <td />
            </tr>
          )}
          <tr>
            <th scope="row">Cost</th>
            <td>{n(base.cost)}¥</td>
            <td>
              <b>{n(now.cost)}¥</b>
            </td>
            <td />
          </tr>
          <tr>
            <th scope="row">Availability</th>
            <td>{base.avail}</td>
            <td>
              <b>{Math.max(now.avail, ...x.accessories.map(a => priced(a, data, cr).avail))}</b>
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      {w.from.length > 0 && <p className="muted small">Changed by: {w.from.join(', ')}</p>}
    </div>
  )
}

/** An implant's grade, Essence, Capacity, cost and Availability, a limb's own stats and a custom limb's increases. */
function CyberPanel({ x, name }: { x: Sr6Purchase; name: string }) {
  const { data, cr, act, d } = useSr6Editor()
  const steps = useSteps()
  const [err, setErr] = useState<string | null>(null)
  const e = entryOf(x, data),
    p = priced(x, data, cr),
    grades = e ? gradeOptions(cr, data, e) : []
  const cap = capacityOf(e, ratingOf(x, e)),
    used = x.accessories.reduce((t, a) => t + capacityUsed(entryOf(a, data), ratingOf(a, entryOf(a, data))) * (a.qty ?? 1), 0)
  const host = d.hosts.find(h => h.uid === x.uid)
  const limb = limbOf(x)
  const setInc = (k: LimbStat, v: number) => {
    const old = x.accessories.find(a => a.id?.startsWith(`custom.limb-increase-${k}-`))
    let r: string | null = null
    // career: a new rating is ONE ledger step, priced as the difference (owner ruling 2026-10-30), no refund prompt
    if (old && v > 0 && steps.career) return setErr(steps.change(old, limbIncrease(k, v)))
    if (old) r = steps.remove(x, old, old.name ?? 'increase')
    if (!r && v > 0) r = steps.add(x, limbIncrease(k, v))
    setErr(r)
  }
  return (
    <div className="card stack" style={{ position: 'sticky', top: 0, zIndex: 2 }} aria-label="Implant stats">
      <div className="row">
        {grades.length > 0 && (
          <label className="inline">
            Grade{' '}
            <select
              aria-label={`${name} grade`}
              disabled={steps.career}
              title={steps.career ? 'In career a grade changes by an upgrade on the Ledger' : 'Its add-ons take this grade (core rulebook p. 282)'}
              value={x.grade ?? ''}
              onChange={ev => setErr(act({ op: 'rate', uid: x.uid, grade: ev.target.value || null }))}
            >
              <option value="">None</option>
              {grades.map(g => (
                <option key={g} value={g}>
                  {gradeName(data, g)}
                </option>
              ))}
            </select>
          </label>
        )}
        <span>
          Essence <b>{n(p.essence)}</b>
        </span>
        {cap !== null && (
          <span>
            Capacity <meter min={0} max={cap} value={used} aria-label={`Capacity used: ${used} of ${cap}`} /> <b>{n(used)}</b> / {n(cap)}
          </span>
        )}
        <span>
          Cost <b>{n(p.cost)}¥</b>
        </span>
        <span>
          Availability <b>{p.avail}</b>
        </span>
      </div>
      {host && (
        <p aria-label={`${name}: its own values`}>
          This limb: <b>{host.text}</b>
        </p>
      )}
      {limb && (
        <div className="row">
          {LIMB_STATS.map(([k, label]) => (
            <label key={k} className="inline">
              {label} increase <Stepper label={`${label} increase`} value={limb.inc[k] ?? 0} min={0} max={LIMB_MAX} onChange={v => setInc(k, v)} />
            </label>
          ))}
          <span className="muted small">Core rulebook p. 288: [Rating] Capacity, Availability Rating, Rating × 5,000¥ each; at most +{LIMB_MAX}.</span>
        </div>
      )}
      {err && <p className="err">{err}</p>}
    </div>
  )
}

/** The mounts (a weapon's hooks; an implant's Capacity), what is in each, and what more fits. */
function Mounts({ x, name, path, subHref }: { x: Sr6Purchase; name: string; path: string; subHref: (path: string) => string }) {
  const { data } = useSr6Editor()
  const steps = useSteps()
  const [picking, setPicking] = useState<string | null>(null)
  const [making, setMaking] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const st = accessoryState(x, data, { filter: isAccessory, isAccessory })
  const rating = ratingOf(x, st.he)
  const hooks = [...hookBudgets(st.he, rating, x.addedSlots).keys()]
  const parts = x.kind === 'weapons' ? partsOf(x, data) : []
  const where = (a: Sr6Purchase) => st.slots.occupied.get(a.uid) ?? OTHER
  // what the picker greys: a failed host requirement, no room on its hook, or past the Capacity left
  const blocked = addonBlocked(x, data, st)
  const groups = [...hooks, OTHER].filter(h => h !== OTHER || st.remaining !== null || x.accessories.some(a => where(a) === OTHER) || !hooks.length)
  const chip = (a: Sr6Purchase) => {
    const e = entryOf(a, data),
      own = e ? entryLabel(e) : (a.name ?? 'Add-on'),
      label = `${own}${a.rating ? ` ${a.rating}` : ''}`
    return (
      <span key={a.uid} className="chip">
        {label}
        {a.id?.startsWith('custom.addon-') && <span className="noncanon"> Custom</span>}
        {a.kind === 'weapons' && x.kind === 'augmentations' && (
          <a className="btn small quiet" href={subHref(`${path}/${a.uid}`)} aria-label={`Customise ${own} in ${name}`}>
            Customise
          </a>
        )}
        <button aria-label={`Remove ${label} from ${name}`} onClick={() => setErr(steps.remove(x, a, label))}>
          ×
        </button>
        <Situational line={a} name={`${own} on ${name}`} />
      </span>
    )
  }
  return (
    <section className="stack" aria-label="Mounts and add-ons">
      <div className="row">
        <h3 style={{ margin: 0 }}>{x.kind === 'weapons' ? 'Mounts' : 'Add-ons'}</h3>
        <span className="spacer" />
        <button className="btn small quiet" onClick={() => setMaking(true)}>
          Custom add-on…
        </button>
      </div>
      {groups.map(h => {
        const left = h === OTHER ? st.remaining : st.slots.remaining.get(h)
        const inIt = x.accessories.filter(a => where(a) === h)
        const factory = parts.filter(p => (h === OTHER ? !hooks.includes(p.hook) : p.hook === h))
        return (
          <div key={h} className="card" aria-label={h === OTHER ? 'Other add-ons' : `${slotLabel(h)} mount`}>
            <div className="row">
              <b>{h === OTHER ? (st.remaining !== null ? 'Capacity' : 'Other') : slotLabel(h)}</b>
              {left !== undefined && left !== null && <span className="muted">{n(left)} left</span>}
              <span className="spacer" />
              <button className="btn small" disabled={left !== undefined && left !== null && left <= 0} onClick={() => setPicking(h)}>
                Add…
              </button>
            </div>
            <div className="row">
              {factory.map(p => (
                // owner ruling 8: the printed stats hold it; removed, its effects come off; it never refunds
                <span key={p.id} className={p.removed ? 'chip muted' : 'chip'}>
                  {p.name} {p.removed ? '(removed)' : '(factory)'}{' '}
                  <button
                    className="btn small quiet"
                    aria-label={`${p.removed ? 'Restore' : 'Remove'} factory part ${p.name} ${p.removed ? 'on' : 'from'} ${name}`}
                    onClick={() => setErr(steps.part(x, p.id, p.removed))}
                  >
                    {p.removed ? 'restore' : '×'}
                  </button>
                </span>
              ))}
              {inIt.map(chip)}
              {!factory.length && !inIt.length && <span className="muted">Empty</span>}
            </div>
          </div>
        )
      })}
      {err && <p className="err">{err}</p>}
      <CatalogPicker
        title={picking && picking !== OTHER ? `Add to the ${slotLabel(picking)} mount of ${name}` : `Add to ${name}`}
        open={picking !== null}
        onClose={() => setPicking(null)}
        kinds={ACCESSORY_KINDS}
        filter={e => st.fits(e) && (!picking || picking === OTHER || structureOf(e).fits.includes(picking))}
        blocked={blocked}
        onAdd={p => steps.add(x, { uid: newId(), kind: p.e.kind as Sr6Purchase['kind'], id: p.e.id, rating: p.rating, qty: 1, accessories: [] })}
      />
      <CustomAddonDialog open={making} onClose={() => setMaking(false)} host={x} hooks={hooks} add={line => steps.add(x, line)} />
    </section>
  )
}

const WEAPON_FX: [string, string][] = [
  ['item:ar', 'Attack Rating'],
  ['item:dv', 'Damage Value'],
  ['item:concealability', 'Concealability'],
  ['test:combat', 'Attack dice'],
]
const LIMB_FX: [string, string][] = [
  ['limb-attr:str', 'Limb Strength'],
  ['limb-attr:agi', 'Limb Agility'],
  ['derived:defense', 'Defense Rating (armor)'],
]

/** A player's own add-on (owner ruling 6): its name, price, Availability, what it takes and what it changes. */
function CustomAddonDialog({
  open,
  onClose,
  host,
  hooks,
  add,
}: {
  open: boolean
  onClose: () => void
  host: Sr6Purchase
  hooks: string[]
  add: (x: Sr6Purchase) => string | null
}) {
  const blank = { name: '', cost: 0, avail: 0, capacity: 0, slot: '', fx: {} as Record<string, number> }
  const [f, setF] = useState(blank)
  const [err, setErr] = useState<string | null>(null)
  const fx = host.kind === 'weapons' ? WEAPON_FX : LIMB_FX
  const save = () => {
    const a: CustomAddon = {
      name: f.name,
      cost: f.cost,
      avail: f.avail,
      capacity: f.capacity,
      ...(f.slot ? { slot: f.slot } : {}),
      effects: Object.entries(f.fx)
        .filter(([, v]) => v)
        .map(([target, v]) => ({ target, value: String(v) })),
    }
    const r = add(customAddon(host, a))
    setErr(r)
    if (!r) {
      setF(blank)
      onClose()
    }
  }
  const num = (label: string, v: number, set: (v: number) => void, min = 0) => (
    <label>
      {label}
      <input type="number" min={min} value={v} onChange={e => set(Number(e.target.value) || 0)} />
    </label>
  )
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Custom add-on"
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!f.name.trim()} onClick={save}>
            Add
          </button>
        </>
      }
    >
      <p className="muted">Your own add-on. Review lists it until a GM approves it.</p>
      <div className="grid2">
        <label>
          Name
          <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus />
        </label>
        {num('Cost (¥)', f.cost, cost => setF({ ...f, cost }))}
        {num('Availability', f.avail, avail => setF({ ...f, avail }))}
        {num('Capacity it takes', f.capacity, capacity => setF({ ...f, capacity }))}
        {hooks.length > 0 && (
          <label>
            Mount
            <select value={f.slot} onChange={e => setF({ ...f, slot: e.target.value })}>
              <option value="">None</option>
              {hooks.map(h => (
                <option key={h} value={h}>
                  {slotLabel(h)}
                </option>
              ))}
            </select>
          </label>
        )}
        {fx.map(([t, label]) => num(`${label} (+/−)`, f.fx[t] ?? 0, v => setF({ ...f, fx: { ...f.fx, [t]: v } }), -99))}
      </div>
      {err && <p className="err">{err}</p>}
    </Modal>
  )
}

/** Save the line as a design anyone can buy (owner ruling 2); a GM's is approved, a player's waits for a GM on Review. */
function SaveDesign({ x, name }: { x: Sr6Purchase; name: string }) {
  const gm = canEdit(useMe())
  const [msg, setMsg] = useState<string | null>(null)
  const save = async () => {
    const title = window.prompt('Name for this design', name)
    if (title === null) return
    const doc = blankSr6('priority')
    doc.identity.streetName = title.trim() || name
    doc.itemDesign = { ...itemDesignOf(x)!, ...(gm ? { approved: true as const } : {}) }
    const { r } = await saveAsNew(d => sr6DesignRepo().save(d), doc, newId)
    setMsg(r.ok ? `Saved “${doc.identity.streetName}” to the Designer.` : (r.error ?? 'Couldn’t save the design.'))
  }
  return (
    <>
      {msg && <span className="muted">{msg}</span>}
      <button className="btn small" onClick={() => void save()}>
        Save as design
      </button>
    </>
  )
}

/** A custom cyberlimb (owner ruling 4): part, look and attribute increases, priced from the core rulebook's table. */
export function CustomLimb() {
  const { act, record, career, data, cr } = useSr6Editor()
  const [open, setOpen] = useState(false)
  const [part, setPart] = useState<LimbPart>('arm'),
    [look, setLook] = useState<LimbLook>('obvious'),
    [inc, setInc] = useState<Partial<Record<LimbStat, number>>>({}),
    [err, setErr] = useState<string | null>(null)
  const line = customLimb(part, look, inc),
    p = priced(line, data, cr)
  const add = () => {
    const r = career ? record({ op: 'purchase', line }) : act({ op: 'custom', line })
    setErr(r && reasonText(r))
    if (!r) setOpen(false)
  }
  return (
    <>
      <button className="btn small" onClick={() => setOpen(true)}>
        Custom cyberlimb…
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Custom cyberlimb"
        actions={
          <>
            <button className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={add}>
              Add
            </button>
          </>
        }
      >
        <div className="grid2">
          <label>
            Limb
            <select value={part} onChange={e => setPart(e.target.value as LimbPart)}>
              {Object.entries(CYBERLIMBS).map(([k, t]) => (
                <option key={k} value={k}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Look
            <select value={look} onChange={e => setLook(e.target.value as LimbLook)}>
              <option value="obvious">Obvious</option>
              <option value="synthetic">Synthetic</option>
            </select>
          </label>
          {LIMB_STATS.map(([k, label]) => (
            <label key={k}>
              {label} increase
              <Stepper label={`${label} increase`} value={inc[k] ?? 0} min={0} max={LIMB_MAX} onChange={v => setInc({ ...inc, [k]: v })} />
            </label>
          ))}
        </div>
        <p>
          Cost <b>{n(p.cost)}¥</b> · Essence <b>{n(p.essence)}</b> · Availability <b>{p.avail}</b> · Capacity <b>{CYBERLIMBS[part][look][1]}</b>
        </p>
        <p className="muted small">Core rulebook p. 288 (cyberlimb cost and capacity; attribute increase). A grade is set in the builder afterwards.</p>
        {err && <p className="err">{err}</p>}
      </Modal>
    </>
  )
}

/** Buy a saved weapon or cyberware design (anyone's, owner ruling 2): Review asks a GM unless a GM made or approved it. */
export function BuyItemDesign({ kind }: { kind: 'weapon' | 'cyberware' }) {
  const { act, record, career } = useSr6Editor()
  const designs = useItemDesigns(kind)
  const [pick, setPick] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const doc = designs.find(d => d.id === pick) ?? designs[0]
  if (!doc) return null
  const buy = () => {
    const line = boughtItemDesign(doc)
    const r = career ? record({ op: 'purchase', line }) : act({ op: 'design', line })
    setErr(r && reasonText(r))
  }
  return (
    <div className="row">
      <label className="inline">
        Saved {kind} designs{' '}
        <select value={doc.id} onChange={e => setPick(e.target.value)}>
          {designs.map(d => (
            <option key={d.id} value={d.id}>
              {d.identity.streetName || 'Unnamed design'}
              {d.itemDesign?.approved ? ' (GM approved)' : ''}
            </option>
          ))}
        </select>
      </label>
      <button className="btn small" onClick={buy}>
        Buy design
      </button>
      {err && <span className="err">{err}</span>}
    </div>
  )
}

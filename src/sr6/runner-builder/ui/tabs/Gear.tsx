// Gear: weapons (attack ratings, accessories from the accessory categories), armor (worn, the Defense and Social Ratings it gives),
// electronics, programs and autosofts (at a rating, priced by the book's formula) and other gear (a quantity where lines stack), and a custom item at the player's own price.
import { useState, type ReactNode } from 'react'
import { Modal } from '../../../../core/ui-kit/bits'
import type { PurchaseKind, Sr6Purchase } from '../../../formats/domain/character'
import { sinName } from '../../../formats/domain/character'
import { entryOf, statusesOf, takesMaterial } from '../../domain/creation/budgets'
import { ratingEdge } from '../../domain/creation/derive'
import { useSr6Editor } from '../editor'
import { Accessories, ACCESSORY_KINDS, isAccessory, MaterialPick, PurchaseSection, social } from '../Picker'
import { entryLabel, isAmmoType } from '../../../catalog/domain/categories'

const CUSTOM_KINDS: [PurchaseKind, string][] = [
  ['gear', 'Other gear'],
  ['electronics', 'Electronics'],
  ['weapons', 'Weapon'],
  ['armor', 'Armor'],
]
const band = (v: number | null) => (v === null ? '—' : String(v))

export function GearTab() {
  const { d, ch, data, cr, act, edit } = useSr6Editor()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState(''),
    [kind, setKind] = useState<PurchaseKind>('gear'),
    [cost, setCost] = useState(''),
    [avail, setAvail] = useState(''),
    [err, setErr] = useState<string | null>(null)
  // the Attack Rating against a target's Defense Rating: who gains Edge at each range band (CRB Hong Kong p. 45)
  const [dr, setDr] = useState('')
  const target = dr.trim() === '' ? null : Number(dr)
  const edgeAt = (bands: (number | null)[]) => {
    if (target === null || !Number.isFinite(target)) return ''
    const e = bands.map(v => ratingEdge(v, target, cr))
    return e.every(x => x === null) ? '' : ` · Edge ${e.map(x => (x === null ? '—' : x > 0 ? `+${x}` : x < 0 ? `${x}` : '0')).join('/')}`
  }
  const ar = (uid: string) => {
    const w = d.attackRatings.weapons.find(x => x.uid === uid)
    return w && `AR ${w.bands.map(band).join('/')}${w.pool !== undefined ? ` · pool ${w.pool}` : ''}${w.dvBonus ? ` · DV +${w.dvBonus}` : ''}${edgeAt(w.bands)}`
  }
  const u = d.unarmedDamage
  // ammunition's material (silver rounds: Bestial Nature p. 36) and, on an ammunition line, its ammunition types (CRB p. 261)
  const material = (x: Sr6Purchase) => {
    const name = (e => (e ? entryLabel(e) : (x.name ?? 'Custom item')))(entryOf(x, data))
    return (
      <>
        <MaterialPick x={x} name={name} />
        {x.kind === 'gear' && takesMaterial(x, data) && <Accessories host={x} name={name} kinds={['ammotypes']} filter={isAmmoType} ammo />}
      </>
    )
  }
  // gear registered under one of the runner's identities: a commlink runs its persona (CRB p. 174), and licensed gear is
  // carried under the SIN that holds its licence. The picker lives on the gear line here, not on every SIN over on
  // Contacts; it only appears once the runner has an identity to assign to.
  const identity = (x: Sr6Purchase) => {
    const sins = ch.build.sins
    if (sins.length === 0) return null
    const name = (e => (e ? entryLabel(e) : (x.name ?? 'Item')))(entryOf(x, data))
    return (
      <label className="inline">
        Identity{' '}
        <select
          aria-label={`${name} identity`}
          value={x.sin ?? ''}
          onChange={e =>
            edit(b => {
              const p = b.purchases.find(p => p.uid === x.uid)
              if (!p) return
              if (e.target.value) p.sin = e.target.value
              else delete p.sin
            })
          }
        >
          <option value="">Unassigned</option>
          {sins.map(s => (
            <option key={s.uid} value={s.uid}>
              {sinName(s)}
            </option>
          ))}
        </select>
      </label>
    )
  }
  // an identity picker after a section's own per-line detail (weapons' AR, armor's Social, gear's material)
  const withIdentity =
    (base?: (x: Sr6Purchase) => ReactNode) =>
    (x: Sr6Purchase): ReactNode => (
      <>
        {base?.(x)}
        {identity(x)}
      </>
    )
  const close = () => {
    setCustom(false)
    setName('')
    setCost('')
    setAvail('')
    setErr(null)
  }
  const add = () => {
    const why = act({ op: 'purchase', kind, custom: { name: name.trim(), cost: Number(cost) || 0, avail: Number(avail) || 0, essence: 0 } })
    if (why) setErr(why)
    else close()
  }
  return (
    <div className="stack">
      <div className="row">
        <h2 style={{ margin: 0 }}>Gear</h2>
        <span className="spacer" />
        <button className="btn small quiet" onClick={() => setCustom(true)}>
          Custom item…
        </button>
      </div>
      <PurchaseSection
        kind="weapons"
        title="Weapons"
        one="a weapon"
        detail={withIdentity(x => [ar(x.uid), ...statusesOf(entryOf(x, data)).map(s => `applies ${s}`)].filter(Boolean).join(' · '))}
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        hint={`Unarmed: AR ${d.attackRatings.unarmed}${u ? `, DV ${u.dv}${u.physical ? 'P' : 'S'}` : ''}${edgeAt([d.attackRatings.unarmed])}.`}
      />
      <label className="inline">
        Target’s DR <input type="number" min={0} value={dr} aria-label="Target’s DR" onChange={e => setDr(e.target.value)} />{' '}
        <span className="muted">
          shows who gains Edge at each range band: + you, − the target (CRB p. 45
          {cr.get('stackingAdvantage')?.value === true ? '; Stacking Advantage, SWC p. 144' : ''})
        </span>
      </label>
      <PurchaseSection
        kind="armor"
        title="Armor"
        one="armor"
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity(x => social(entryOf(x, data)?.attrs.social))}
        hint={`Defense Rating ${d.defenseRating} and Social Rating ${d.socialRating} with the armor worn.`}
      />
      <PurchaseSection
        kind="electronics"
        title="Electronics"
        one="electronics"
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity()}
      />
      <PurchaseSection kind="programs" title="Programs and autosofts" one="a program" />
      <PurchaseSection
        kind="gear"
        title="Other gear"
        one="other gear"
        accessories={{ kinds: ACCESSORY_KINDS, filter: isAccessory }}
        bonuses
        detail={withIdentity(material)}
      />
      <PurchaseSection kind="ammotypes" title="Ammunition" one="ammunition type" offer={isAmmoType} detail={material} />
      <Modal
        open={custom}
        onClose={close}
        title="Custom item"
        actions={
          <>
            <button className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" disabled={!name.trim()} onClick={add}>
              Add item
            </button>
          </>
        }
      >
        <p className="muted">Something the catalog doesn’t have, at your own price (the GM checks it).</p>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div className="grid2">
          <label>
            Name <input value={name} onChange={e => setName(e.target.value)} />
          </label>
          <label>
            Kind{' '}
            <select value={kind} onChange={e => setKind(e.target.value as PurchaseKind)}>
              {CUSTOM_KINDS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cost <input type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} />
          </label>
          <label>
            Availability <input type="number" min={0} value={avail} onChange={e => setAvail(e.target.value)} />
          </label>
        </div>
      </Modal>
    </div>
  )
}

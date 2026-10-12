// Gear: weapons (attack ratings, accessories from the accessory categories), armor (worn, the Defense and Social Ratings it gives),
// electronics, programs and autosofts (at a rating, priced by the book's formula) and other gear (a quantity where lines stack), and a custom item at the player's own price.
import { useState } from 'react'
import { Modal } from '../../../ui/bits'
import type { PurchaseKind } from '../../model/character'
import { entryOf } from '../../engine/budgets'
import { ratingEdge } from '../../engine/derive'
import { useSr6Editor } from '../editor'
import { ACCESSORY_KINDS, isAccessory, PurchaseSection, social } from '../Picker'

const CUSTOM_KINDS: [PurchaseKind, string][] = [
  ['gear', 'Other gear'],
  ['electronics', 'Electronics'],
  ['weapons', 'Weapon'],
  ['armor', 'Armor'],
]
const band = (v: number | null) => (v === null ? '—' : String(v))

export function GearTab() {
  const { ch, d, data, cr, act } = useSr6Editor()
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
        detail={x => ar(x.uid)}
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
        bonuses
        detail={x => social(entryOf(x, data)?.attrs.social)}
        hint={`Defense Rating ${d.defenseRating} and Social Rating ${d.socialRating} with the armor worn.`}
      />
      <PurchaseSection kind="electronics" title="Electronics" one="electronics" bonuses />
      <PurchaseSection kind="programs" title="Programs and autosofts" one="a program" />
      <PurchaseSection kind="gear" title="Other gear" one="other gear" bonuses />
      {/* an ammunition type a runner bought as gear before the importer filed it apart (src/sr6/engine/migrate.ts) */}
      {ch.build.purchases.some(x => x.kind === 'ammotypes') && <PurchaseSection kind="ammotypes" title="Ammunition types" one="an ammunition type" />}
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

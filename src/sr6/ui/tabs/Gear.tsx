// Gear: weapons (attack ratings, accessories from the accessory categories), armor (worn, the Defense Rating it gives),
// electronics, programs and autosofts (at a rating, priced by the book's formula) and other gear (a quantity where lines stack), and a custom item at the player's own price.
import { useState } from 'react'
import { Modal } from '../../../ui/bits'
import type { PurchaseKind } from '../../model/character'
import { useSr6Editor } from '../editor'
import { isAccessory, PurchaseSection } from '../Picker'

const CUSTOM_KINDS: [PurchaseKind, string][] = [['gear', 'Other gear'], ['electronics', 'Electronics'], ['weapons', 'Weapon'], ['armor', 'Armor']]
const band = (v: number | null) => (v === null ? '—' : String(v))

export function GearTab() {
  const { d, act } = useSr6Editor()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState(''), [kind, setKind] = useState<PurchaseKind>('gear'), [cost, setCost] = useState(''), [avail, setAvail] = useState('')
  const ar = (uid: string) => { const w = d.attackRatings.weapons.find(x => x.uid === uid); return w && `AR ${w.bands.map(band).join('/')}` }
  const close = () => { setCustom(false); setName(''); setCost(''); setAvail('') }
  const add = () => { if (!act({ op: 'purchase', kind, custom: { name: name.trim(), cost: Number(cost) || 0, avail: Number(avail) || 0, essence: 0 } })) close() }
  return (
    <div className="stack">
      <div className="row"><h2 style={{ margin: 0 }}>Gear</h2><span className="spacer" />
        <button className="btn small quiet" onClick={() => setCustom(true)}>Custom item…</button></div>
      <PurchaseSection kind="weapons" title="Weapons" one="a weapon" detail={x => ar(x.uid)} accessories={{ kinds: ['gear'], filter: isAccessory }}
        hint={`Unarmed: AR ${d.attackRatings.unarmed}.`} />
      <PurchaseSection kind="armor" title="Armor" one="armor" bonuses hint={`Defense Rating ${d.defenseRating} with the armor worn.`} />
      <PurchaseSection kind="electronics" title="Electronics" one="electronics" bonuses />
      <PurchaseSection kind="programs" title="Programs and autosofts" one="a program" />
      <PurchaseSection kind="gear" title="Other gear" one="other gear" bonuses />
      <Modal open={custom} onClose={close} title="Custom item"
        actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" disabled={!name.trim()} onClick={add}>Add item</button></>}>
        <p className="muted">Something the catalog doesn’t have, at your own price (the GM checks it).</p>
        <div className="grid2">
          <label>Name <input value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Kind <select value={kind} onChange={e => setKind(e.target.value as PurchaseKind)}>
            {CUSTOM_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label>Cost <input type="number" min={0} value={cost} onChange={e => setCost(e.target.value)} /></label>
          <label>Availability <input type="number" min={0} value={avail} onChange={e => setAvail(e.target.value)} /></label>
        </div>
      </Modal>
    </div>
  )
}

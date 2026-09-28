import { useState } from 'react'
import { currentBuild, itemCost, makeAmpAdd, makeBuy, makeSell } from '../../engine'
import type { ItemEntry, ItemKind } from '../../model/types'
import { newId } from '../../model/types'
import { fmt, Modal, Picker } from '../bits'
import { SourceLabel } from '../SourceLabel'
import { useEditor } from '../editor'

const SECTIONS: [ItemKind, string, string][] = [
  ['armor', 'Armor', '2,500¥ per Armor point. Ratings don’t stack; wear one main and one alternate.'],
  ['weapon', 'Weapons', '2,500¥ each; specialist weapons (sniper rifles, machine guns, launchers) 5,000¥.'],
  ['gear', 'Equipment', '2,500¥ each unless the GM sets a higher price. Commlink and fake SIN are free.'],
  ['spell', 'Spells', '5,000¥ each. Casting needs the Sorcery option on the Awakened amp.'],
  ['complex-form', 'Complex forms', '5,000¥ each. Technomancers only: threading needs the Emerged amp (Conversion Guide p.9).'],
]

export function GearTab() {
  const { c, ch, d, edit, update, record, career } = useEditor()
  const b = career ? currentBuild(ch) : ch.build
  const [adding, setAdding] = useState<ItemKind | null>(null)
  const [custom, setCustom] = useState<ItemEntry | null>(null)

  const add = async (item: ItemEntry) => {
    setAdding(null); setCustom(null)
    if (!career) return edit(x => {
      x.build.items.push(item)
      if (item.kind === 'armor' && !x.build.mainArmor) x.build.mainArmor = item.uid
    })
    await record(makeBuy(c, item), `Buy ${item.name}`)
  }
  const pick = (id: string) => {
    const it = c.items.get(id)!
    add({ uid: newId(), catalogId: it.id, kind: it.kind, name: it.name, specialist: it.specialist, armor: it.armor, snapshot: it })
  }
  const remove = async (item: ItemEntry) => {
    const linked = b.amps.filter(a => a.linkedItem === item.uid)
    if (linked.length && !confirm(`${linked.map(a => a.name).join(', ')} depends on this item. Remove it anyway?`)) return
    if (!career) return edit(x => {
      x.build.items = x.build.items.filter(i => i.uid !== item.uid)
      if (x.build.mainArmor === item.uid) x.build.mainArmor = undefined
      if (x.build.altArmor === item.uid) x.build.altArmor = undefined
    })
    await record(makeSell(item.uid), `Sell or discard ${item.name} (no refund)`)
  }
  const toAmp = async (item: ItemEntry) => {
    const amp = { uid: newId(), type: 'equipment', name: item.name, narrative: '', effects: [], linkedItem: item.uid }
    sessionStorage.setItem('ca2.editAmp', amp.uid)
    if (!career) edit(x => { x.build.amps.push(amp) })
    else if (!(await record(makeAmpAdd(c, ch, amp), `Turn ${item.name} into an Equipment amp`))) return
    location.hash = `#/c/${ch.id}/amps`
  }

  return (
    <div className="stack">
      <h2>Gear & spells</h2>
      <p className="muted">Named gear with extra features, like an Ares Predator with a smartgun, is an Equipment Shadow Amp: add it on the Shadow Amps tab and it brings its base item along.</p>
      {SECTIONS.filter(([kind]) => kind !== 'complex-form' || d.emerged || b.items.some(i => i.kind === kind)).map(([kind, title, hint]) => {
        const items = b.items.filter(i => i.kind === kind)
        return (
          <section key={kind} className="stack">
            <div className="row"><h3 style={{ margin: 0 }}>{title}</h3><span className="spacer" />
              <button className="btn small" onClick={() => setAdding(kind)}>Add from the book</button>
              <button className="btn small quiet" onClick={() => setCustom({ uid: newId(), kind, name: '', price: undefined })}>Custom</button>
            </div>
            <p className="muted" style={{ margin: 0 }}>{hint}</p>
            {kind === 'weapon' && <p style={{ margin: 0 }}>Unarmed: DV {d.weapons[0].dv} [{d.weapons[0].ranges}] <span className="muted">(Strength{d.weapons[0].dv !== String(ch.build.attributes.str) ? ' plus implant or adept bonuses' : ''})</span></p>}
            {items.length > 0 && (
              <div className="scroll-x"><table className="data">
                <tbody>
                  {items.map(i => {
                    const cat = i.catalogId ? c.items.get(i.catalogId) ?? i.snapshot : undefined
                    const amp = b.amps.find(a => a.linkedItem === i.uid)
                    // a book amp's base item has no catalog id of its own: it comes from the amp's book
                    const src = cat ?? (amp?.catalogId ? c.amps.get(amp.catalogId) ?? amp.snapshot : undefined)
                    return (
                      <tr key={i.uid}>
                        <td><b>{i.name}</b>{cat && cat.name !== i.name && <span className="muted"> ({cat.name})</span>}{' '}{src ? <SourceLabel c={c} source={src.source} page={src.page} id={src.id} /> : <SourceLabel builtByYou />}
                          <div className="muted" style={{ fontSize: '0.88rem' }}>
                            {i.kind === 'armor' && `Armor ${i.armor ?? 0}`}
                            {i.kind === 'weapon' && (() => { const w = d.weapons.find(x => x.uid === i.uid); return w && `DV ${w.dv} [${w.ranges}]${i.specialist ? ', specialist' : ''}${w.note ? `, ${w.note}` : ''}` })()}
                            {(i.kind === 'spell' || i.kind === 'complex-form') && cat?.category}
                            {amp && ` Shadow Amp: ${amp.name}`}
                          </div>
                        </td>
                        {kind === 'armor' && <td>
                          <select value={b.mainArmor === i.uid ? 'main' : b.altArmor === i.uid ? 'alt' : ''} aria-label={`Wear ${i.name}`}
                            onChange={e => update(x => {
                              if (x.build.mainArmor === i.uid) x.build.mainArmor = undefined
                              if (x.build.altArmor === i.uid) x.build.altArmor = undefined
                              if (e.target.value === 'main') x.build.mainArmor = i.uid
                              if (e.target.value === 'alt') x.build.altArmor = i.uid
                            })}>
                            <option value="">Carried</option><option value="main">Main armor</option><option value="alt">Alternate</option>
                          </select>
                        </td>}
                        <td className="num">{fmt(itemCost(c.pricing, i))}</td>
                        <td className="num">
                          {kind !== 'spell' && kind !== 'complex-form' && !amp && <button className="btn small quiet" onClick={() => toAmp(i)}>Make it an amp</button>}
                          <button className="btn small quiet" onClick={() => remove(i)}>{career ? 'Sell' : 'Remove'}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table></div>
            )}
          </section>
        )
      })}

      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add ${SECTIONS.find(s => s[0] === adding)?.[1].toLowerCase() ?? ''}`}>
        {adding && <Picker onPick={pick}
          groups={[...new Set([...c.items.values()].filter(i => i.kind === adding).map(i => i.category ?? ''))].filter(Boolean)}
          items={[...c.items.values()].filter(i => i.kind === adding).map(i => ({
            id: i.id, name: i.name, group: i.category, meta: [i.category, i.dv && `DV ${i.dv}`, i.armor && `Armor ${i.armor}`].filter(Boolean).join(', '),
            label: <SourceLabel c={c} source={i.source} page={i.page} id={i.id} />,
            text: i.text, price: fmt(itemCost(c.pricing, { uid: '', kind: i.kind, name: i.name, specialist: i.specialist, armor: i.armor })),
          }))} />}
      </Modal>

      <Modal open={!!custom} onClose={() => setCustom(null)} title="Custom item"
        actions={<><button className="btn" onClick={() => setCustom(null)}>Cancel</button>
          <button className="btn primary" disabled={!custom?.name.trim()} onClick={() => custom && add({ ...custom, name: custom.name.trim() })}>Add item</button></>}>
        {custom && <div className="grid2">
          <label>Name<input autoFocus value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} /></label>
          {custom.kind === 'armor' && <label>Armor rating<input type="number" min={1} max={6} value={custom.armor ?? 1} onChange={e => setCustom({ ...custom, armor: Number(e.target.value) })} /></label>}
          {custom.kind === 'weapon' && <label className="row" style={{ display: 'flex' }}><input type="checkbox" checked={!!custom.specialist} onChange={e => setCustom({ ...custom, specialist: e.target.checked })} /> Specialist weapon</label>}
          <label>Price set by the GM (blank = standard)
            <input type="number" min={0} step={2500} value={custom.price ?? ''} onChange={e => setCustom({ ...custom, price: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </label>
          <p className="muted">Standard price: {fmt(itemCost(c.pricing, { ...custom, price: undefined }))}</p>
        </div>}
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import { itemCost, itemPrice } from '../../engine/price'
import { formulaText } from '../../shared/formula'
import { IssueBadges } from '../Issues'
import type { ItemEntry, ItemKind, Pricing } from '../../model/types'
import { newId } from '../../model/types'
import { fmt, Modal, Picker } from '../bits'
import { SourceLabel } from '../SourceLabel'
import { EditButton } from '../editTrigger'
import { editHref, useEditor } from '../editor'
import { anarchyCard, AnarchyRef } from '../AnarchyRef'
import { NameField } from '../../shared/ui'
import { ItemEffects } from '../EffectHow'

// prices from the core data (pricing.xml)
const SECTIONS: [ItemKind, string, (p: Pricing) => string][] = [
  ['armor', 'Armor', p => `${fmt(p.armorPoint)} per Armor point. Ratings don’t stack; wear one main and one alternate.`],
  ['weapon', 'Weapons', p => `${fmt(p.weaponStandard)} each; specialist weapons (sniper rifles, machine guns, launchers) ${fmt(p.weaponSpecialist)}.`],
  [
    'gear',
    'Equipment',
    p =>
      `${fmt(p.equipment)} each unless the GM sets a higher price. Every runner starts with a commlink (with trodes) and a fake SIN, free: rename them or describe them, but they can’t be removed or sold.`,
  ],
  ['spell', 'Spells', p => `${fmt(p.spell)} each. Casting needs the Sorcery option on the Awakened amp.`],
  ['complex-form', 'Complex forms', p => `${fmt(p.complexForm)} each. Technomancers only: threading needs the Emerged amp.`],
]

export function GearTab() {
  const { c, ch, d, edit, update } = useEditor()
  const b = ch.build
  const [adding, setAdding] = useState<ItemKind | null>(null)
  const [custom, setCustom] = useState<ItemEntry | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null) // the starting gear row whose name and description are open

  const add = (item: ItemEntry) => {
    setAdding(null)
    setCustom(null)
    edit(x => {
      x.build.items.push(item)
      if (item.kind === 'armor' && !x.build.mainArmor) x.build.mainArmor = item.uid
    })
  }
  const pick = (id: string) => {
    const it = c.items.get(id)!
    add({ uid: newId(), catalogId: it.id, kind: it.kind, name: it.name, specialist: it.specialist, armor: it.armor, snapshot: it })
  }
  const remove = (item: ItemEntry) => {
    const linked = b.amps.filter(a => a.linkedItem === item.uid)
    if (linked.length && !confirm(`${linked.map(a => a.name).join(', ')} depends on this item. Remove it anyway?`)) return
    edit(x => {
      x.build.items = x.build.items.filter(i => i.uid !== item.uid)
      if (x.build.mainArmor === item.uid) x.build.mainArmor = undefined
      if (x.build.altArmor === item.uid) x.build.altArmor = undefined
    })
  }
  const toAmp = (item: ItemEntry) => {
    const amp = { uid: newId(), type: 'equipment', name: item.name, narrative: '', effects: [], linkedItem: item.uid }
    sessionStorage.setItem('ca2.editAmp', amp.uid)
    edit(x => {
      x.build.amps.push(amp)
    })
    location.hash = editHref(ch, 'amps')
  }

  return (
    <div className="stack">
      <h2>Gear & spells</h2>
      <p className="muted">
        Named gear with extra features, like an Ares Predator with a smartgun, is an Equipment Shadow Amp: add it on the Shadow Amps tab and it brings its base
        item along.
      </p>
      {/* complex forms too without the Emerged amp: Review's complexForm.noEmerged */}
      {SECTIONS.map(([kind, title, hint]) => {
        const items = b.items.filter(i => i.kind === kind)
        return (
          <section key={kind} className="stack">
            <div className="row">
              <h3 style={{ margin: 0 }}>{title}</h3>
              <span className="spacer" />
              <button className="btn small" onClick={() => setAdding(kind)}>
                Add from the book
              </button>
              <button className="btn small quiet" onClick={() => setCustom({ uid: newId(), kind, name: '', price: undefined })}>
                Custom
              </button>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              {hint(c.pricing)}
            </p>
            {kind === 'weapon' && (
              <p style={{ margin: 0 }}>
                Unarmed: DV {d.weapons[0].dv} [{d.weapons[0].ranges}]{' '}
                <span className="muted">(Strength{d.weapons[0].dv !== String(ch.build.attributes.str) ? ' plus implant or adept bonuses' : ''})</span>
              </p>
            )}
            {items.length > 0 && (
              <div className="scroll-x">
                <table className="data">
                  <tbody>
                    {items.map(i => {
                      const cat = i.catalogId ? (c.items.get(i.catalogId) ?? i.snapshot) : undefined
                      const amp = b.amps.find(a => a.linkedItem === i.uid)
                      // a book amp's base item has no catalog id of its own: it comes from the amp's book
                      const src = cat ?? (amp?.catalogId ? (c.amps.get(amp.catalogId) ?? amp.snapshot) : undefined)
                      if (i.starting)
                        return (
                          <tr key={i.uid} className="starting">
                            <td>
                              <div className="row">
                                {renaming === i.uid ? (
                                  <NameField
                                    value={i.name}
                                    label={`Name of ${i.name}`}
                                    onCommit={name =>
                                      update(x => {
                                        x.build.items.find(y => y.uid === i.uid)!.name = name
                                      })
                                    }
                                  />
                                ) : (
                                  <b>{i.name}</b>
                                )}
                                <span className="chip free">{i.starting === 'real-sin' ? 'Free (real SIN)' : 'Free (starting gear)'}</span>
                                {i.starting !== 'real-sin' && <SourceLabel c={c} source="CRB" page={85} />}
                                {renaming === i.uid ? (
                                  <button className="btn small quiet" onClick={() => setRenaming(null)}>
                                    Done
                                  </button>
                                ) : (
                                  <button className="btn small quiet" aria-label={`Rename ${i.name}`} onClick={() => setRenaming(i.uid)}>
                                    Rename
                                  </button>
                                )}
                              </div>
                              {renaming === i.uid ? (
                                <input
                                  className="note"
                                  value={i.note ?? ''}
                                  aria-label={`Description of ${i.name}`}
                                  placeholder={i.starting === 'commlink' ? 'e.g. model, color, stickers' : 'e.g. the name and nationality on it'}
                                  onChange={e =>
                                    update(x => {
                                      const y = x.build.items.find(y => y.uid === i.uid)!
                                      if (e.target.value) y.note = e.target.value
                                      else delete y.note
                                    })
                                  }
                                />
                              ) : (
                                i.note && (
                                  <div className="muted" style={{ fontSize: '0.88rem' }}>
                                    {i.note}
                                  </div>
                                )
                              )}
                              {amp && (
                                <div className="muted" style={{ fontSize: '0.88rem' }}>
                                  Shadow Amp: {amp.name}
                                </div>
                              )}
                            </td>
                            <td className="num">Free</td>
                            <td className="num">
                              {!amp && i.starting === 'commlink' && (
                                <button className="btn small quiet" onClick={() => toAmp(i)}>
                                  Make it an amp
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      return (
                        <tr key={i.uid}>
                          <td>
                            <AnarchyRef kind={i.kind} id={i.catalogId}>
                              <b>{i.name}</b>
                            </AnarchyRef>
                            {cat && cat.name !== i.name && <span className="muted"> ({cat.name})</span>}{' '}
                            {src ? <SourceLabel c={c} source={src.source} page={src.page} id={src.id} /> : <SourceLabel builtByYou />}
                            <div className="muted" style={{ fontSize: '0.88rem' }}>
                              {i.kind === 'armor' &&
                                (i.over
                                  ? `Armor +${i.armor ?? 0} over ${b.items.find(x => x.uid === i.over)?.name ?? 'other armor'}`
                                  : `Armor ${i.armor ?? 0}`)}
                              {i.kind === 'weapon' &&
                                (() => {
                                  const w = d.weapons.find(x => x.uid === i.uid)
                                  return w && `DV ${w.dv} [${w.ranges}]${i.specialist ? ', specialist' : ''}${w.note ? `, ${w.note}` : ''}`
                                })()}
                              {(i.kind === 'spell' || i.kind === 'complex-form') && cat?.category}
                              {amp && ` Shadow Amp: ${amp.name}`}
                            </div>
                            <ItemEffects
                              c={c}
                              catalog={cat?.effects}
                              entered={i.effects}
                              onChange={fx =>
                                update(x => {
                                  x.build.items.find(y => y.uid === i.uid)!.effects = fx
                                })
                              }
                            />
                          </td>
                          {kind === 'armor' && (
                            <td>
                              <select
                                value={b.mainArmor === i.uid ? 'main' : b.altArmor === i.uid ? 'alt' : ''}
                                aria-label={`Wear ${i.name}`}
                                onChange={e =>
                                  update(x => {
                                    if (x.build.mainArmor === i.uid) x.build.mainArmor = undefined
                                    if (x.build.altArmor === i.uid) x.build.altArmor = undefined
                                    if (e.target.value === 'main') x.build.mainArmor = i.uid
                                    if (e.target.value === 'alt') x.build.altArmor = i.uid
                                  })
                                }
                              >
                                <option value="">Carried</option>
                                <option value="main">Main armor</option>
                                <option value="alt">Alternate</option>
                              </select>
                            </td>
                          )}
                          <td className="num">
                            {(() => {
                              // a formula's price shows the formula on hover (and what it had to assume)
                              const pr = itemPrice(c.pricing, i, cat)
                              return pr.formula ? (
                                <span
                                  className="has-formula"
                                  title={[
                                    formulaText(pr.formula, pr.base.toLocaleString('en-US')),
                                    ...pr.notes,
                                    ...(pr.error ? [`Can’t be worked out (${pr.error}): the standard price counts.`] : []),
                                  ].join('\n')}
                                >
                                  {fmt(pr.n)}
                                  {pr.error && <span className="warn"> ?</span>}
                                </span>
                              ) : (
                                fmt(pr.n)
                              )
                            })()}
                          </td>
                          <td className="num">
                            {kind !== 'spell' && kind !== 'complex-form' && !amp && (
                              <button className="btn small quiet" onClick={() => toAmp(i)}>
                                Make it an amp
                              </button>
                            )}
                            <button className="btn small quiet" aria-label={`Remove ${i.name}`} onClick={() => remove(i)}>
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
          </section>
        )
      })}

      <Modal open={!!adding} onClose={() => setAdding(null)} title={`Add ${SECTIONS.find(s => s[0] === adding)?.[1].toLowerCase() ?? ''}`}>
        {adding && (
          <Picker
            onPick={pick}
            groups={[...new Set([...c.items.values()].filter(i => i.kind === adding).map(i => i.category ?? ''))].filter(Boolean)}
            items={[...c.items.values()]
              .filter(i => i.kind === adding)
              .map(i => ({
                id: i.id,
                name: i.name,
                group: i.category,
                ...anarchyCard(c, i.kind, i.id),
                meta: [i.category, i.dv && `DV ${i.dv}`, i.armor && `Armor ${i.armor}`].filter(Boolean).join(', '),
                label: (
                  <>
                    <SourceLabel c={c} source={i.source} page={i.page} id={i.id} /> <IssueBadges issues={i.issues} source={i.source} />
                  </>
                ),
                search: `${i.source} ${c.sources.get(i.source)?.name ?? ''} p.${i.page}`,
                text: i.text,
                price: (() => {
                  const pr = itemPrice(c.pricing, { uid: '', kind: i.kind, name: i.name, specialist: i.specialist, armor: i.armor }, i)
                  return pr.formula ? `${formulaText(pr.formula, pr.base.toLocaleString('en-US'))} (${pr.error ? 'unpriced' : fmt(pr.n)})` : fmt(pr.n)
                })(),
                action: <EditButton kind="items" id={i.id} name={i.name} />,
              }))}
          />
        )}
      </Modal>

      <Modal
        open={!!custom}
        onClose={() => setCustom(null)}
        title="Custom item"
        actions={
          <>
            <button className="btn" onClick={() => setCustom(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!custom?.name.trim()} onClick={() => custom && add({ ...custom, name: custom.name.trim() })}>
              Add item
            </button>
          </>
        }
      >
        {custom && (
          <div className="grid2">
            <label>
              Name
              <input autoFocus value={custom.name} onChange={e => setCustom({ ...custom, name: e.target.value })} />
            </label>
            {custom.kind === 'armor' && (
              <label>
                Armor rating
                <input type="number" min={1} max={6} value={custom.armor ?? 1} onChange={e => setCustom({ ...custom, armor: Number(e.target.value) })} />
              </label>
            )}
            {custom.kind === 'weapon' && (
              <label className="row" style={{ display: 'flex' }}>
                <input type="checkbox" checked={!!custom.specialist} onChange={e => setCustom({ ...custom, specialist: e.target.checked })} /> Specialist weapon
              </label>
            )}
            <label>
              Price set by the GM (blank = standard)
              <input
                type="number"
                min={0}
                step={c.pricing.equipment}
                value={custom.price ?? ''}
                onChange={e => setCustom({ ...custom, price: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            <p className="muted">Standard price: {fmt(itemCost(c.pricing, { ...custom, price: undefined }))}</p>
          </div>
        )}
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { ampCtx, ampEssence, ampFromTemplate, ampRating, levelLabel, ruleText, vehicleStats } from '../../engine'
import type { AmpEntry, ItemEntry } from '../../model/types'
import { newId } from '../../model/types'
import { fmt, Modal, Picker } from '../bits'
import { SourceLabel } from '../SourceLabel'
import { IssueBadges } from '../Issues'
import { EditButton } from '../EditEntry'
import { useEditor } from '../editor'
import { anarchyCard, AnarchyRef } from '../AnarchyRef'
import { AmpBuilder } from './AmpBuilder'

type Editing = { amp: AmpEntry; item?: ItemEntry; before?: AmpEntry }

export function AmpsTab() {
  const { c, ch, v, edit } = useEditor()
  const b = ch.build
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)

  useEffect(() => { // "Make it an amp" on the Gear tab lands here with that amp open
    const uid = sessionStorage.getItem('ca2.editAmp')
    if (!uid) return
    sessionStorage.removeItem('ca2.editAmp')
    const a = b.amps.find(x => x.uid === uid)
    if (a) setEditing({ amp: a, before: a })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const describe = (a: AmpEntry) => [...a.effects.reduce((m, e) => m.set(JSON.stringify([e.ref, e.param, e.value]), [e, (m.get(JSON.stringify([e.ref, e.param, e.value]))?.[1] ?? 0) + 1]), new Map<string, [AmpEntry['effects'][number], number]>()).values()].map(([e, n]) => {
    const def = c.ampEffects.get(e.ref), line = ruleText(c, e)
    if (line) return `${line}${n > 1 ? ` ×${n}` : ''}`
    const p = e.param ? c.skills.get(e.param)?.name ?? c.skills.get(e.param.split('.')[0])?.specs.find(s => s.id === e.param)?.name ?? c.attributes.get(e.param as never)?.name ?? e.param.replace(/^custom:/, '') : ''
    return `${def?.name.replace(/ for an? (specialization|Skill|Attribute)/, '') ?? e.ref}${p ? `: ${p}` : ''}${e.ref === 'negative' ? ` −${e.value ?? 1}` : ''}${n > 1 ? ` ×${n}` : ''}`
  }).join('; ')

  const startFromCatalog = (id: string) => {
    const t = c.amps.get(id)!
    const { amp, item } = ampFromTemplate(t, newId)
    setChoosing(false)
    setEditing({ amp, item })
  }
  const startBlank = (type: string) => {
    setChoosing(false)
    setEditing({ amp: { uid: newId(), type, name: '', narrative: '', effects: [], vehicle: type === 'vehicle' ? 'small-drone' : undefined } })
  }

  const save = (amp: AmpEntry) => {
    const e = editing!
    setEditing(null)
    edit(x => {
      if (e.item && !x.build.items.some(i => i.uid === e.item!.uid)) x.build.items.push(e.item)
      const at = x.build.amps.findIndex(a => a.uid === amp.uid)
      if (at >= 0) x.build.amps[at] = amp
      else x.build.amps.push(amp)
    })
  }

  const types = [...c.ampTypes.values()]
  const problems = (a: AmpEntry) => v.filter(x => x.path.startsWith(`amps.${a.uid}`) && !x.approved)

  return (
    <div className="stack">
      <div className="row"><h2 style={{ margin: 0 }}>Shadow Amps</h2><span className="spacer" />
        <button className="btn primary" onClick={() => setChoosing(true)}>Add an amp</button></div>
      <p className="muted">Everything special about a runner is a Shadow Amp: Qualities, magic, implants, signature gear, vehicles and contacts. Rating = base + effects, and each point costs {fmt(c.pricing.ampPoint)}.</p>
      {b.amps.length === 0 && <p>No amps yet. Add one from the book, or build your own from an amp type and effects.</p>}
      {types.map(t => {
        const list = b.amps.filter(a => a.type === t.id)
        if (!list.length) return null
        return (
          <section key={t.id}>
            <h3>{t.id === 'contact' ? 'Contacts' : t.name}</h3>
            <div className="scroll-x"><table className="data fixed"><colgroup><col /><col style={{ width: '6.5rem' }} /><col style={{ width: '7rem' }} /><col style={{ width: '5.5rem' }} /><col style={{ width: '9.5rem' }} /></colgroup><tbody>
              {list.map(a => {
                const r = ampRating(c, a, ampCtx(b, a, c))
                const probs = problems(a)
                const tpl = a.catalogId ? c.amps.get(a.catalogId) ?? a.snapshot : undefined
                return (
                  <tr key={a.uid}>
                    <td><AnarchyRef kind="amps" id={a.catalogId}><b>{a.name}</b></AnarchyRef> {tpl ? <SourceLabel c={c} source={tpl.source} page={tpl.page} id={tpl.id} /> : <SourceLabel builtByYou />}
                      {a.type === 'vehicle' && (() => { const s = vehicleStats(c, a); return s && <div style={{ fontSize: '0.88rem' }}>{s.count > 1 ? `${s.count}× ` : ''}{s.chassis}: Pilot {s.pilot}, Body {s.body}, Handling {s.handling}, Speed {s.speed}{s.flying ? ' (flying)' : ''}, Armor {s.armor}</div> })()}
                      <div className="muted" style={{ fontSize: '0.88rem' }}>{describe(a) || a.narrative || 'Narrative effect only'}</div>
                      {probs.map((p, i) => <div key={i} className={p.severity === 'error' ? 'err' : 'warn'} style={{ fontSize: '0.88rem' }}>{p.message}</div>)}
                    </td>
                    <td className="num">Rating {r}</td>
                    <td className="num">{fmt(r * c.pricing.ampPoint)}</td>
                    <td className="num">{ampEssence(c, a) ? `Ess −${ampEssence(c, a)}` : ''}</td>
                    <td className="num">
                      <button className="btn small quiet" onClick={() => setEditing({ amp: a, before: a })}>Edit</button>
                      <button className="btn small quiet" onClick={() => edit(x => { x.build.amps = x.build.amps.filter(z => z.uid !== a.uid) })}>Remove</button>
                    </td>
                  </tr>
                )
              })}
            </tbody></table></div>
          </section>
        )
      })}

      <Modal open={choosing} onClose={() => setChoosing(false)} title="Add a Shadow Amp">
        <div className="stack">
          <div className="row"><span className="muted">Build your own:</span>
            {types.map(t => <button key={t.id} className="btn small" onClick={() => startBlank(t.id)}>{t.name}</button>)}
          </div>
          <Picker onPick={startFromCatalog} placeholder="Search the book’s amps"
            groups={[...types.map(t => t.name), 'Add-ons']}
            items={[...c.amps.values()].map(a => ({ // add-ons (mod) are applied in the Amp Builder; listed here to be edited
              id: a.id, name: a.name, group: a.mod ? 'Add-ons' : c.ampTypes.get(a.type)?.name, disabled: a.mod, ...anarchyCard(c, 'amps', a.id),
              meta: [a.mod ? `Add-on for ${c.ampTypes.get(a.type)?.name ?? a.type} (apply it in the Amp Builder)` : c.ampTypes.get(a.type)?.name, levelLabel(c, a)].filter(Boolean).join(' · '), label: <><SourceLabel c={c} source={a.source} page={a.page} id={a.id} /> <IssueBadges issues={a.issues} source={a.source} /></>, search: `${a.source} ${c.sources.get(a.source)?.name ?? ''} p.${a.page}`,
              price: `Rating ${a.printedRating ?? '?'}`, text: a.narrative, action: <EditButton kind="amps" id={a.id} name={a.name} />,
            }))} />
          <p className="muted">Source DHSA is Daegann’s Holostreets expanded amp list; its page numbers are that document’s.</p>
        </div>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.before ? `Change ${editing.before.name}` : 'New Shadow Amp'} actions={<></>}>
        {editing && <AmpBuilder initial={editing.amp} before={editing.before} build={editing.item ? { ...b, items: [...b.items, editing.item] } : b}
          onSave={save} onCancel={() => setEditing(null)} />}
      </Modal>
    </div>
  )
}

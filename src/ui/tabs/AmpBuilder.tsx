// Build or change a Shadow Amp: type + effects -> rating, cost, Essence (CRB p.58-63).
import { useState } from 'react'
import { ampChangeCost, ampCtx, ampEssence, ampRating, effectRating, legalEffects } from '../../engine'
import type { AmpEntry, Build, EffectPick } from '../../model/types'
import { ATTRS } from '../../model/types'
import { fmt, signed } from '../bits'
import { useEditor } from '../editor'

export function AmpBuilder({ initial, before, build, onSave, onCancel }: {
  initial: AmpEntry; before?: AmpEntry; build: Build; onSave: (a: AmpEntry) => void; onCancel: () => void
}) {
  const { c, career } = useEditor()
  const [amp, setAmp] = useState<AmpEntry>(initial)
  const [pickFx, setPickFx] = useState('')
  const inBuild: Build = { ...build, amps: build.amps.some(a => a.uid === amp.uid) ? build.amps.map(a => (a.uid === amp.uid ? amp : a)) : [...build.amps, amp] }
  const ctx = ampCtx(inBuild, amp)
  const rating = ampRating(c, amp, ctx)
  const type = c.ampTypes.get(amp.type)
  const legal = legalEffects(c, amp)
  const set = (patch: Partial<AmpEntry>) => setAmp(a => ({ ...a, ...patch }))
  const setFx = (i: number, patch: Partial<EffectPick>) => set({ effects: amp.effects.map((e, j) => (j === i ? { ...e, ...patch } : e)) })
  const addFx = (ref: string) => { if (ref) set({ effects: [...amp.effects, { ref }] }); setPickFx('') }
  const change = before ? ampChangeCost(c, before, amp, ctx) : 0

  const paramInput = (e: EffectPick, i: number) => {
    const def = c.ampEffects.get(e.ref)
    switch (def?.param) {
      case 'skill': return (
        <select value={e.param ?? ''} onChange={x => setFx(i, { param: x.target.value })} aria-label="Skill">
          <option value="">Choose a skill…</option>
          {[...c.skills.values()].map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>)
      case 'spec': return (
        <select value={e.param ?? ''} onChange={x => setFx(i, { param: x.target.value })} aria-label="Specialization">
          <option value="">Choose a specialization…</option>
          {[...c.skills.values()].map(s => (
            <optgroup key={s.id} label={s.name}>{s.specs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}</optgroup>
          ))}
          {build.skills.flatMap(s => s.specs).filter(s => s.startsWith('custom:')).map(s => <option key={s} value={s}>{s.slice(7)} (custom)</option>)}
        </select>)
      case 'attribute': return (
        <select value={e.param ?? ''} onChange={x => setFx(i, { param: x.target.value })} aria-label="Attribute">
          <option value="">Choose…</option>{ATTRS.map(a => <option key={a} value={a}>{c.attributes.get(a)?.name}</option>)}
        </select>)
      case 'realm': return (
        <select value={e.param ?? ''} onChange={x => setFx(i, { param: x.target.value })} aria-label="Realm">
          <option value="">Choose…</option><option value="physical">Physical</option><option value="astral">Astral</option><option value="vr">Virtual reality</option>
        </select>)
      case 'value': return <input type="number" min={1} max={5} value={e.value ?? 1} onChange={x => setFx(i, { value: Math.max(1, Math.min(5, Number(x.target.value))) })} aria-label="Points" style={{ width: '4rem' }} />
      case 'text': return <input value={e.param ?? ''} onChange={x => setFx(i, { param: x.target.value })} placeholder="Describe it" aria-label="Description" />
      default: return e.note ? <span className="muted">{e.note}</span> : null
    }
  }
  const rccValue = (e: EffectPick, i: number) => e.ref === 'rcc' &&
    <input type="number" min={1} max={9} value={e.value ?? 1} onChange={x => setFx(i, { value: Number(x.target.value) })} aria-label="Drones controlled" style={{ width: '4rem' }} />

  return (
    <div className="stack">
      <div className="grid2">
        <label>Name<input autoFocus value={amp.name} onChange={e => set({ name: e.target.value })} /></label>
        <label>Type<input value={type?.name ?? amp.type} disabled /></label>
        {amp.type === 'vehicle' && (
          <label>Chassis
            <select value={amp.vehicle ?? ''} onChange={e => set({ vehicle: e.target.value })}>
              {[...c.vehicles.values()].map(v => <option key={v.id} value={v.id}>{v.name}: Body {v.body}, Handling {v.handling}, Speed {v.speed}</option>)}
            </select>
          </label>
        )}
        {amp.type === 'equipment' && (
          <label>Item it upgrades
            <select value={amp.linkedItem ?? ''} onChange={e => set({ linkedItem: e.target.value || undefined })}>
              <option value="">Choose an item you own…</option>
              {build.items.filter(i => i.kind !== 'spell').map(i => <option key={i.uid} value={i.uid}>{i.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <label>What it looks like and does in the story<textarea value={amp.narrative} onChange={e => set({ narrative: e.target.value })} /></label>

      <h3>Effects</h3>
      <div className="fxlist">
        <div className="fx"><span>Base: {type?.name}{amp.type === 'quality' && !ctx.isFirstQuality && ' (not your first Quality)'}</span><span /><span className="r">{rating - amp.effects.reduce((s, e) => s + effectRating(c, e), 0)}</span></div>
        {amp.effects.map((e, i) => {
          const def = c.ampEffects.get(e.ref)
          return (
            <div className="fx" key={i}>
              <span>{def?.name ?? e.ref} {e.note === 'book drawback' && <span className="muted">(book drawback)</span>}</span>
              <span className="row">{paramInput(e, i)}{rccValue(e, i)}<button className="btn small quiet" onClick={() => set({ effects: amp.effects.filter((_, j) => j !== i) })} aria-label={`Remove ${def?.name}`}>Remove</button></span>
              <span className="r">{signed(effectRating(c, e)).replace('¥', '')}</span>
            </div>
          )
        })}
      </div>
      <select value={pickFx} onChange={e => addFx(e.target.value)} aria-label="Add an effect">
        <option value="">+ Add an effect…</option>
        {[...new Set(legal.map(l => l.effect.category))].map(cat => (
          <optgroup key={cat} label={cat[0].toUpperCase() + cat.slice(1)}>
            {legal.filter(l => l.effect.category === cat).map(l => (
              <option key={l.effect.id} value={l.effect.id} disabled={!l.allowed}>
                {l.effect.name} ({l.effect.id === 'negative' ? '−1 to −5, GM approval' : signed(l.effect.rating).replace('¥', '')}){l.reason ? `: ${l.reason}` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="ampfoot">
        <span>Rating <b>{rating}</b></span>
        <span>Cost <b>{fmt(rating * c.pricing.ampPoint)}</b></span>
        {ampEssence(c, amp) > 0 && <span>Essence <b>−{ampEssence(c, amp)}</b></span>}
        {career && before && <span>This change <b>{fmt(change)}</b></span>}
      </div>
      <div className="actions" style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={!amp.name.trim()} onClick={() => onSave({ ...amp, name: amp.name.trim() })}>{before ? 'Save changes' : 'Add amp'}</button>
      </div>
    </div>
  )
}

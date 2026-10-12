// An effect's own controls (Amp Builder, Gear): how it is turned on and whether it counts (src/shared/effects.ts), and
// the Test an Advantage or Disadvantage is on. What the player or GM sets here is theirs: it overrides the book's.
import { applies, EFFECT_SWITCHES, effectName, own, ruleText, type EffectState } from '../engine'
import type { Build, Catalog, EffectPick } from '../model/types'
import { ATTRS } from '../model/types'

const SWITCH_LABELS: Record<string, string> = {
  '': 'Always on',
  activated: 'Activated',
  sustained: 'Sustained',
  wireless: 'Wireless',
  conditional: 'Only sometimes',
}

export function EffectHow({ e, onChange }: { e: EffectState; onChange: (patch: EffectState) => void }) {
  return (
    <>
      <select
        value={e.switch ?? ''}
        aria-label="How it is turned on"
        onChange={x => onChange({ switch: (x.target.value || undefined) as EffectState['switch'] })}
      >
        {['', ...EFFECT_SWITCHES].map(s => (
          <option key={s} value={s}>
            {SWITCH_LABELS[s]}
          </option>
        ))}
      </select>
      {e.affects && (
        <select value={e.affects} aria-label="Who it affects" onChange={x => onChange({ affects: x.target.value as EffectState['affects'] })}>
          <option value="caster">Affects the caster</option>
          <option value="target">Affects target(s)</option>
        </select>
      )}
      <label className="check" title={e.confidence === 'low' ? 'The importer wasn’t sure of it' : e.when ? `In brackets: only when ${e.when}` : undefined}>
        <input type="checkbox" checked={applies(e)} onChange={x => onChange(x.target.checked ? { confidence: undefined } : { confidence: 'low' })} />
        Counts
      </label>
    </>
  )
}

/** A Test: every Test, an attribute-based one, a skill or a specialization (the build's custom ones too). */
export function TestSelect({ c, build, value, onChange }: { c: Catalog; build: Build; value?: string; onChange: (v: string) => void }) {
  const custom = value?.startsWith('custom:') && !build.skills.some(s => s.specs.includes(value)) ? [value] : []
  return (
    <select value={value ?? ''} onChange={x => onChange(x.target.value)} aria-label="Test">
      <option value="">All Tests</option>
      <optgroup label="Attribute-based">
        {ATTRS.map(a => (
          <option key={a} value={a}>
            {c.attributes.get(a)?.name ?? a}
          </option>
        ))}
      </optgroup>
      {[...c.skills.values()].map(s => (
        <optgroup key={s.id} label={s.name}>
          <option value={s.id}>{s.name}</option>
          {s.specs.map(sp => (
            <option key={sp.id} value={sp.id}>
              {s.name} ({sp.name})
            </option>
          ))}
        </optgroup>
      ))}
      {[...build.skills.flatMap(s => s.specs).filter(s => s.startsWith('custom:')), ...custom].map(s => (
        <option key={s} value={s}>
          {s.slice(7)}
        </option>
      ))}
    </select>
  )
}

/** An item's effects (its own, else its catalog entry's), each with its controls; a change makes the list the item's own. */
export function ItemEffects({
  c,
  catalog,
  entered,
  onChange,
}: {
  c: Catalog
  catalog?: EffectPick[]
  entered?: EffectPick[]
  onChange: (fx: EffectPick[]) => void
}) {
  const fx = own(entered, catalog)
  if (!fx.length) return null
  return (
    <ul className="item-effects">
      {fx.map((e, k) => (
        <li key={k} className={applies(e) ? undefined : 'muted'}>
          {ruleText(c, e) ?? effectName(c, e)}
          {e.when ? <span className="muted"> (when {e.when})</span> : null}{' '}
          <EffectHow e={e} onChange={patch => onChange(fx.map((x, j) => (j === k ? { ...x, ...patch } : x)))} />
        </li>
      ))}
    </ul>
  )
}

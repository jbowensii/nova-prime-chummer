import { ATTRS } from '../../model/types'
import { useState } from 'react'
import { useEditor } from '../editor'
import { BACKDROP_NAMES, Face, PortraitEditor } from '../Portrait'

const HINTS = {
  keywords: ['Metatype / social status', 'Origins / home', 'Role / occupation', 'Lifestyle', 'Anything else that defines them'],
  dispositions: ['A motive', 'A shortcoming', 'A habit or addiction', 'How they react under pressure'],
  cues: ['What they say under stress', 'When they win big', 'When they show off', 'Their catchphrase'],
}

export function ConceptTab() {
  const { c, ch, update, edit, career } = useEditor()
  const meta = c.metatypes.get(ch.identity.metatype)
  const [pe, setPe] = useState(false)
  const packages = [...c.packages.values()].filter(p => p.level === ch.level)
  const list = (k: keyof typeof HINTS) => (
    <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend><h3>{k[0].toUpperCase() + k.slice(1)}</h3></legend>
      {HINTS[k].map((hint, i) => (
        <input key={i} value={ch.narrative[k][i] ?? ''} placeholder={hint} aria-label={`${k} ${i + 1}`}
          onChange={e => update(d => { d.narrative[k][i] = e.target.value })} />
      ))}
    </fieldset>
  )

  return (
    <div className="stack">
      <h2>Concept</h2>
      <p className="muted">Who are they, what do they do on a run, and what makes them fun to play? Pick 5 Keywords, 4 Dispositions and 4 Cues that fit (CRB p.50, 84).</p>
      <div className="grid2">
        <label>Street name<input value={ch.identity.streetName} onChange={e => update(d => { d.identity.streetName = e.target.value })} /></label>
        <label>Real name<input value={ch.identity.name} onChange={e => update(d => { d.identity.name = e.target.value })} /></label>
        <label>Metatype
          <select value={ch.identity.metatype} disabled={career} onChange={e => edit(d => { d.identity.metatype = e.target.value })}>
            {[...c.metatypes.values()].map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label>Level of play
          <select value={ch.level} disabled={career} onChange={e => edit(d => { d.level = e.target.value; d.package = 'free' })}>
            {[...c.levels.values()].map(l => <option key={l.id} value={l.id}>{l.name}: {l.nuyen.toLocaleString('en-US')}¥</option>)}
          </select>
        </label>
        <label>Package guide
          <select value={ch.package} disabled={career} onChange={e => edit(d => { d.package = e.target.value })}>
            <option value="free">Free allocation</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>Lifestyle
          <select value={ch.identity.lifestyle ?? 'low'} onChange={e => update(d => { d.identity.lifestyle = e.target.value })}>
            {[...c.lifestyles.values()].map(l => <option key={l.id} value={l.id}>{l.name}{l.perRun ? ` (${l.perRun > 0 ? '+' : '−'}${Math.abs(l.perRun).toLocaleString('en-US')}¥ per run)` : ''}</option>)}
          </select>
        </label>
      </div>
      <div className="portrait-row">
        <Face ch={ch} />
        <div className="stack">
          <button className="btn" onClick={() => setPe(true)}>{ch.identity.portrait ? 'Change portrait…' : 'Add a portrait…'}</button>
          <span className="muted">Backdrop: {ch.identity.backdrop ? BACKDROP_NAMES[ch.identity.backdrop] : 'none'}</span>
        </div>
        <PortraitEditor ch={ch} open={pe} onClose={() => setPe(false)} onSave={(portrait, backdrop) => {
          setPe(false)
          update(d => {
            if (portrait) d.identity.portrait = portrait; else delete d.identity.portrait
            if (backdrop) d.identity.backdrop = backdrop; else delete d.identity.backdrop
          })
        }} />
      </div>
      {meta && <p className="muted">
        {meta.name}: {ATTRS.map(a => `${a.toUpperCase()} ${meta.ranges[a][0]}–${meta.ranges[a][1]}`).join(', ')}; Edge {meta.edge}{meta.racialQuality ? `; ${meta.racialQuality}` : ''}.
        {ch.package !== 'free' && ' The package only guides spending: nuyen can move between categories.'}
        {' '}{c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.text}
      </p>}
      <hr className="sep" />
      <div className="grid2">{list('keywords')}{list('dispositions')}{list('cues')}</div>
      <hr className="sep" />
      <label>Background<textarea value={ch.identity.background} onChange={e => update(d => { d.identity.background = e.target.value })} /></label>
      <label>Notes<textarea value={ch.identity.notes} onChange={e => update(d => { d.identity.notes = e.target.value })} /></label>
    </div>
  )
}

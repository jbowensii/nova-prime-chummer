import { ATTRS } from '../../model/types'
import { currentBuild, handAddedSinner, hasRealSin, setRealSin, sinnerTemplate } from '../../engine'
import { useEditor } from '../editor'
import { NonCanon } from '../bits'

const HINTS = {
  keywords: ['Metatype / social status', 'Origins / home', 'Role / occupation', 'Lifestyle', 'Anything else that defines them'],
  dispositions: ['A motive', 'A shortcoming', 'A habit or addiction', 'How they react under pressure'],
  cues: ['What they say under stress', 'When they win big', 'When they show off', 'Their catchphrase'],
}

/** Downscale an image file to a 256px JPEG data URL so the library stays small. */
async function portrait(file: File): Promise<string> {
  const img = await createImageBitmap(file)
  const s = 256 / Math.max(img.width, img.height)
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * Math.min(1, s)), height: Math.round(img.height * Math.min(1, s)) })
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.85)
}

export function ConceptTab() {
  const { c, ch, update, edit, career } = useEditor()
  const meta = c.metatypes.get(ch.identity.metatype)
  const sinner = sinnerTemplate(c)
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
        <label>Portrait
          <input type="file" accept="image/*" onChange={async e => { const f = e.target.files?.[0]; if (f) { const url = await portrait(f); update(d => { d.identity.portrait = url }) } }} />
        </label>
      </div>
      {meta && <p className="muted">
        {meta.name}: {ATTRS.map(a => `${a.toUpperCase()} ${meta.ranges[a][0]}–${meta.ranges[a][1]}`).join(', ')}; Edge {meta.edge}{meta.racialQuality ? `; ${meta.racialQuality}` : ''}.
        {ch.package !== 'free' && ' The package only guides spending: nuyen can move between categories.'}
        {' '}{c.lifestyles.get(ch.identity.lifestyle ?? 'low')?.text}
      </p>}
      <label className="check">
        <input type="checkbox" checked={ch.allowNonCanon !== false}
          onChange={e => update(d => { if (e.target.checked) delete d.allowNonCanon; else d.allowNonCanon = false })} />
        <span>Allow non-canon content <span className="muted">(published material that isn’t the official rules, marked <NonCanon />). When off, the Review tab flags any on this runner.</span></span>
      </label>
      <label className="check">
        {/* ponytail: disabled once finalized (a ledger event could carry it later) */}
        <input type="checkbox" disabled={career} checked={hasRealSin(career ? currentBuild(ch) : ch.build, c)} onChange={e => {
          const on = e.target.checked, mine = handAddedSinner(ch.build, c)
          if (!on && mine.length && !confirm(`This also removes the ${mine.map(a => a.name).join(', ')} quality you added on the Shadow Amps tab. Remove the real SIN?`)) return
          update(d => setRealSin(c, d.build, on))
        }} />
        <span>Has a real SIN <span className="muted">(not a core rule: every runner already has a fake SIN. Adds a free Real SIN entry on the Gear tab to name, e.g. national or corporate{sinner ? <>, and the {sinner.name} quality from {c.sources.get(sinner.source)?.name ?? sinner.source}</> : ''}.)
          {!sinner && ' No imported book has a SINner quality, so only the gear entry is added.'}
          {career && ' Set this before finalizing, or ask your GM.'}</span></span>
      </label>
      <hr className="sep" />
      <div className="grid2">{list('keywords')}{list('dispositions')}{list('cues')}</div>
      <hr className="sep" />
      <label>Background<textarea value={ch.identity.background} onChange={e => update(d => { d.identity.background = e.target.value })} /></label>
      <label>Notes<textarea value={ch.identity.notes} onChange={e => update(d => { d.identity.notes = e.target.value })} /></label>
    </div>
  )
}

// Concept: who the runner is. Names, portrait and token (the Anarchy dialog), backdrop, background and notes; the metatype
// is shown here and picked on Creation method (an NPC has none). Still editable once finalized.
import { useState } from 'react'
import { GENDER_LIST, GenderList } from '../../../ui/bits'
import { BACKDROP_NAMES, Face, PortraitEditor } from '../../../ui/Portrait'
import { sr6EditHref, useSr6Editor } from '../editor'

export function ConceptTab() {
  const { ch, data, update } = useSr6Editor()
  const [pe, setPe] = useState(false), [te, setTe] = useState(false)
  const meta = data.metatypes[ch.build.metatype]
  return (
    <div className="stack">
      <h2>Concept</h2>
      <p className="muted">{ch.npc ? 'Who are they, and what are they doing in your story?' : 'Who are they, what do they do on a run, and what makes them fun to play?'}</p>
      <div className="grid2">
        <label>Street name<input value={ch.identity.streetName} onChange={e => update(d => { d.identity.streetName = e.target.value })} /></label>
        <label>Real name<input value={ch.identity.name} onChange={e => update(d => { d.identity.name = e.target.value })} /></label>
        <label>Gender<input value={ch.identity.gender ?? ''} placeholder="optional" list={GENDER_LIST}
          onChange={e => update(d => { if (e.target.value.trim()) d.identity.gender = e.target.value; else delete d.identity.gender })} /><GenderList /></label>
      </div>
      {!ch.npc && <p>Metatype: <b>{meta?.name ?? (ch.build.metatype || 'none yet')}</b>. <a href={sr6EditHref(ch.id, 'method')}>Pick it on Creation method</a>.</p>}
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
        <Face ch={ch} token />
        <div className="stack">
          <button className="btn" onClick={() => setTe(true)}>{ch.identity.token ? 'Change token…' : 'Set a token…'}</button>
          <span className="muted">Token: {ch.identity.token ? 'its own picture' : 'same as portrait'}</span>
        </div>
        <PortraitEditor token ch={ch} open={te} onClose={() => setTe(false)} onSave={token => {
          setTe(false)
          update(d => { if (token) d.identity.token = token; else delete d.identity.token })
        }} />
      </div>
      <hr className="sep" />
      <label>Background<textarea value={ch.identity.background} onChange={e => update(d => { d.identity.background = e.target.value })} /></label>
      <label>Notes<textarea value={ch.identity.notes} onChange={e => update(d => { d.identity.notes = e.target.value })} /></label>
    </div>
  )
}

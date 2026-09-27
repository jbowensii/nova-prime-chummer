import { useRef, useState } from 'react'
import { blankCharacter, parseCharacterFile, serialize, snapshotEntries } from '../engine'
import type { Catalog, Character } from '../model/types'
import { newId } from '../model/types'
import { Modal } from './bits'
import { deleteCharacter, listCharacters, needsExportReminder, saveCharacter } from './storage'

export function exportCharacter(c: Catalog, ch: Character) {
  const out = { ...snapshotEntries(c, ch), lastExportedAt: new Date().toISOString() }
  const url = URL.createObjectURL(new Blob([serialize(out)], { type: 'application/json' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.ca2.json` })
  a.click()
  URL.revokeObjectURL(url)
  saveCharacter(out)
  return out
}

export function Library({ c }: { c: Catalog }) {
  const [list, setList] = useState(listCharacters)
  const [msg, setMsg] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [level, setLevel] = useState('runner')
  const [meta, setMeta] = useState('human')
  const [toDelete, setToDelete] = useState<Character | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => setList(listCharacters())
  const store = (ch: Character) => { if (!saveCharacter(ch).ok) setMsg('This browser refused to store the character. Export it now so it isn’t lost.') }

  const create = () => {
    const ch = blankCharacter(level, meta)
    store(ch)
    location.hash = `#/c/${ch.id}/concept`
  }

  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const done: string[] = [], bad: string[] = []
    for (const f of files) {
      const r = parseCharacterFile(await f.text())
      if (!r.ok) { bad.push(`${f.name}: ${r.reason}`); continue }
      const clash = listCharacters().some(x => x.id === r.character.id)
      const ch = { ...r.character, id: clash ? newId() : r.character.id, lastExportedAt: new Date().toISOString() }
      store(ch)
      done.push(ch.identity.streetName || ch.identity.name)
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    refresh()
  }

  const loadSamples = async () => {
    try {
      const index: { file: string }[] = await (await fetch('./samples/index.json')).json()
      const have = new Set(listCharacters().map(x => x.id))
      let n = 0
      for (const { file } of index) {
        const r = parseCharacterFile(await (await fetch(`./samples/${file}`)).text())
        if (r.ok && !have.has(r.character.id)) { store({ ...r.character, lastExportedAt: r.character.updatedAt }); n++ }
      }
      setMsg(n ? `Added ${n} characters from the rulebook.` : 'The rulebook characters are already in your library.')
      refresh()
    } catch (e) {
      setMsg(`Couldn’t load the samples: ${e}`)
    }
  }

  const duplicate = (ch: Character) => {
    store({ ...structuredClone(ch), id: newId(), identity: { ...ch.identity, streetName: `${ch.identity.streetName || ch.identity.name} (copy)` }, lastExportedAt: undefined, updatedAt: new Date().toISOString() })
    refresh()
  }

  return (
    <main className="lib">
      <header>
        <div style={{ flex: 1 }}>
          <a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a>
          <h1>Your runners</h1>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => setCreating(true)}>New runner</button>
          <button className="btn" onClick={() => file.current?.click()}>Import file</button>
          <input ref={file} type="file" accept=".json,.ca2.json,application/json" multiple hidden onChange={e => { importFiles(e.target.files); e.target.value = '' }} />
          <button className="btn quiet" onClick={loadSamples}>Load rulebook characters</button>
          <a className="btn quiet" href="#/data">Game data</a>
        </div>
      </header>
      {msg && <p className="banner" role="status">{msg}</p>}

      {list.length === 0 ? (
        <div className="empty">
          <p>No runners yet. Start a new one, import a <code>.ca2.json</code> file, or load the 13 characters from the rulebook to look around.</p>
        </div>
      ) : list.map(ch => (
        <div className="dossier" key={ch.id}>
          {ch.identity.portrait ? <img className="face" src={ch.identity.portrait} alt="" /> : <span className="face" aria-hidden>{(ch.identity.streetName || ch.identity.name || '?')[0]}</span>}
          <div>
            <a className="title" href={`#/c/${ch.id}/concept`}>{ch.identity.streetName || ch.identity.name || 'Unnamed runner'}</a>
            <div className="meta">
              {c.metatypes.get(ch.identity.metatype)?.name ?? ch.identity.metatype}, {c.levels.get(ch.level)?.name ?? ch.level}
              {' '}<span className={`mode ${ch.finalizedAt ? 'career' : 'creation'}`}>{ch.finalizedAt ? 'Career' : 'Creation'}</span>
              {needsExportReminder(ch) && <span className="warn"> Not exported since it changed</span>}
            </div>
          </div>
          <div className="row">
            <button className="btn small" onClick={() => { exportCharacter(c, ch); refresh() }}>Export</button>
            <button className="btn small quiet" onClick={() => duplicate(ch)}>Duplicate</button>
            <button className="btn small quiet" onClick={() => setToDelete(ch)}>Delete</button>
          </div>
        </div>
      ))}

      <Modal open={creating} onClose={() => setCreating(false)} title="New runner"
        actions={<><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" onClick={create}>Create runner</button></>}>
        <div className="grid2">
          <label>Level of play
            <select value={level} onChange={e => setLevel(e.target.value)}>
              {[...c.levels.values()].map(l => <option key={l.id} value={l.id}>{l.name}: {l.nuyen.toLocaleString('en-US')}¥</option>)}
            </select>
          </label>
          <label>Metatype
            <select value={meta} onChange={e => setMeta(e.target.value)}>
              {[...c.metatypes.values()].map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: '0.8rem' }}>Both can be changed later on the Concept tab.</p>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.identity.streetName || toDelete?.identity.name || 'this runner'}?`}
        actions={<><button className="btn" onClick={() => setToDelete(null)}>Keep</button>
          <button className="btn danger" onClick={() => { deleteCharacter(toDelete!.id); setToDelete(null); refresh() }}>Delete from this browser</button></>}>
        <p>This removes the runner from this browser. Exported <code>.ca2.json</code> files are not affected.</p>
      </Modal>
    </main>
  )
}

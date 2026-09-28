import { useEffect, useRef, useState } from 'react'
import { blankCharacter, characterToXml, isCanonSource, parseCharacterFile, rescope, snapshotEntries, xmlToCharacter } from '../engine'
import type { Catalog, Character } from '../model/types'
import { newId } from '../model/types'
import { Modal, NonCanon } from './bits'
import { useRepo, type Stored } from './repo'
import { SettingsButton } from './settings'
import { needsExportReminder } from './storage'

/** Download the runner as an XML file (same format as the files on tower04). Returns it stamped as exported. */
export function exportCharacter(c: Catalog, ch: Character): Character {
  const out = { ...snapshotEntries(c, ch), lastExportedAt: new Date().toISOString() }
  const url = URL.createObjectURL(new Blob([characterToXml(out)], { type: 'application/xml' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: `${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.xml` })
  a.click()
  URL.revokeObjectURL(url)
  return out
}

/** A character file: our XML, or the older .ca2.json. */
export const readCharacterFile = (text: string) => (text.trimStart().startsWith('<') ? xmlToCharacter(text) : parseCharacterFile(text))

export function Library({ c }: { c: Catalog }) {
  const repo = useRepo()
  const [list, setList] = useState<Stored[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [level, setLevel] = useState('runner')
  const [meta, setMeta] = useState('human')
  const [toDelete, setToDelete] = useState<Character | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => repo.list().then(setList, e => { setMsg(`Couldn’t load your runners: ${e}`); setList([]) })
  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const where = repo.mode === 'server' ? 'tower04' : 'this browser'

  const store = async (ch: Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    if (!r.ok) setMsg(r.error ?? `${ch.identity.streetName || 'That runner'} changed elsewhere; open it to sort it out.`)
    return r.ok
  }

  const create = async () => {
    const ch = blankCharacter(level, meta)
    if (await store(ch)) location.hash = `#/c/${ch.id}/concept`
  }

  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [], bad: string[] = []
    for (const f of files) {
      const r = readCharacterFile(await f.text())
      if (!r.ok) { bad.push(`${f.name}: ${r.reason}`); continue }
      const ch = { ...r.character, id: have.has(r.character.id) ? newId() : r.character.id, lastExportedAt: new Date().toISOString() }
      if (await store(ch)) done.push(ch.identity.streetName || ch.identity.name)
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }

  const loadSamples = async () => {
    try {
      const index: { file: string }[] = await (await fetch('./samples/index.json')).json()
      const have = new Set((list ?? []).map(s => s.ch.id))
      let n = 0
      for (const { file } of index) {
        const r = parseCharacterFile(await (await fetch(`./samples/${file}`)).text())
        if (r.ok && !have.has(r.character.id) && await store({ ...r.character, lastExportedAt: r.character.updatedAt })) n++
      }
      setMsg(n ? `Added ${n} sample characters.` : 'The sample characters are already in your library.')
      void refresh()
    } catch (e) {
      setMsg(`Couldn’t load the samples: ${e}`)
    }
  }

  const duplicate = async (ch: Character) => {
    await store({ ...structuredClone(ch), id: newId(), identity: { ...ch.identity, streetName: `${ch.identity.streetName || ch.identity.name} (copy)` }, lastExportedAt: undefined, updatedAt: new Date().toISOString() })
    void refresh()
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
          <input ref={file} type="file" accept=".xml,.json,application/xml,application/json" multiple hidden onChange={e => { void importFiles(e.target.files); e.target.value = '' }} />
          <button className="btn quiet" onClick={loadSamples}>Load sample characters</button>
          <a className="btn quiet" href="#/rules">Rules</a>
          <a className="btn quiet" href="#/data">Game data</a>
          <SettingsButton />
        </div>
      </header>
      <p className="muted">Saved on {where}{repo.mode === 'server' ? ' (appdata/chummer-anarchy2/characters)' : '. Export files to keep them safe.'}</p>
      {msg && <p className="banner" role="status">{msg}</p>}

      {list === null ? <p className="muted">Loading runners…</p> : list.length === 0 ? (
        <div className="empty">
          <p>No runners yet. Start a new one, import a character file, or load the 28 sample characters from the rulebook and Daegann’s pregen booklet to look around.</p>
        </div>
      ) : list.map(({ ch, rev }) => {
        // only for badges below (e.g. duplicate/canon labels keyed off catalog ids); never saved from here
        const rch = rescope(c, ch)
        return (
        <div className="dossier" key={ch.id}>
          {ch.identity.portrait ? <img className="face" src={ch.identity.portrait} alt="" /> : <span className="face" aria-hidden>{(ch.identity.streetName || ch.identity.name || '?')[0]}</span>}
          <div>
            <a className="title" href={`#/c/${ch.id}/concept`}>{ch.identity.streetName || ch.identity.name || 'Unnamed runner'}</a>
            <div className="meta">
              {c.metatypes.get(rch.identity.metatype)?.name ?? rch.identity.metatype}, {c.levels.get(rch.level)?.name ?? rch.level}
              {' '}<span className={`mode ${rch.finalizedAt ? 'career' : 'creation'}`}>{rch.finalizedAt ? 'Career' : 'Creation'}</span>
              {rch.origin && !isCanonSource(c, rch.origin) && <> <NonCanon source={c.sources.get(rch.origin)?.name ?? rch.origin} /></>}
              {repo.mode === 'browser' && needsExportReminder(ch) && <span className="warn"> Not exported since it changed</span>}
            </div>
          </div>
          <div className="row">
            <button className="btn small" onClick={async () => { await store(exportCharacter(c, ch), rev); void refresh() }}>Export</button>
            <button className="btn small quiet" onClick={() => void duplicate(ch)}>Duplicate</button>
            <button className="btn small quiet" onClick={() => setToDelete(ch)}>Delete</button>
          </div>
        </div>
      )})}

      <Modal open={creating} onClose={() => setCreating(false)} title="New runner"
        actions={<><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" onClick={() => void create()}>Create runner</button></>}>
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
          <button className="btn danger" onClick={async () => { await repo.remove(toDelete!.id); setToDelete(null); void refresh() }}>Delete runner</button></>}>
        <p>{repo.mode === 'server'
          ? 'The file moves to the characters/.trash folder on tower04, so it can still be recovered there.'
          : 'This removes the runner from this browser. Exported files are not affected.'}</p>
      </Modal>
    </main>
  )
}

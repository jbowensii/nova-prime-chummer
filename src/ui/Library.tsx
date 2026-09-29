import { useEffect, useRef, useState } from 'react'
import { blankCharacter, characterToXml, isCanonSource, parseCharacterFile, snapshotEntries, xmlToCharacter } from '../engine'
import type { Catalog, Character } from '../model/types'
import { newId } from '../model/types'
import { AccountMenu, because, canEdit, isAdmin, useMe } from './auth'
import { Modal, NonCanon } from './bits'
import { useRepo, type Stored } from './repo'
import { SettingsButton } from './settings'
import { loadTrash } from './Trash'
import { needsExportReminder } from './storage'
import { chooseExamples, extraCopies, keyOf, type Example, type Sources } from './samples'

/** Download the runner as an XML file (same format as the files on the server). Returns it stamped as exported. */
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

/** Every example character there is: the imported books' sample runners (custom/imported/samples.xml; none before any
 *  import) and, on the server, its example sets (GET /api/samples). Canon: the book's source, or the set's flag. The
 *  books' rows still come when the sets can't be read (`error`: why). */
async function exampleList(sources: Sources, server: boolean): Promise<{ rows: Example[]; error?: string }> {
  const res = await fetch('./custom/imported/samples.xml', { cache: 'no-cache' }).catch(() => null)
  const xml = res?.ok ? new DOMParser().parseFromString(await res.text(), 'text/xml') : null
  const books = xml?.documentElement.localName === 'samples' ? [...xml.documentElement.getElementsByTagName('sample')].map(s => {
    const source = s.getAttribute('source') ?? ''
    return { url: `./custom/imported/${s.getAttribute('href')}`, name: s.getAttribute('name') ?? '', source, canon: !!sources(source)?.canon }
  }) : []
  if (!server) return { rows: books }
  try {
    const r = await fetch('./api/samples', { cache: 'no-store' })
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
    const { sets }: { sets: { name: string; canon: boolean; samples: { name: string; href: string }[] }[] } = await r.json()
    return { rows: [...books, ...sets.flatMap(set => set.samples.map(s => ({ url: `./custom/${s.href}`, name: s.name, set: set.name, canon: set.canon })))] }
  } catch (e) {
    return { rows: books, error: because('Couldn’t read the server’s example sets', (e as Error).message ?? String(e)) }
  }
}

export function Library({ c }: { c: Catalog }) {
  const repo = useRepo()
  const me = useMe(), admin = isAdmin(me)
  const [list, setList] = useState<Stored[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [level, setLevel] = useState('runner')
  const [meta, setMeta] = useState('human')
  const [toDelete, setToDelete] = useState<Character | null>(null)
  const [tidying, setTidying] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [noBooks, setNoBooks] = useState(false)
  // a fresh install: no book uploaded (server), or no amps at all (a static host has no Books page)
  useEffect(() => {
    if (repo.mode !== 'server') { setNoBooks(c.amps.size === 0); return }
    if (!admin) return // only the admin uploads books
    fetch('./api/books', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(b => setNoBooks(Array.isArray(b) && b.length === 0), () => {})
  }, [repo.mode, c, admin])
  const [trashed, setTrashed] = useState<number | null>(null) // server only: the browser's storage has no trash
  const refresh = () => {
    if (repo.mode === 'server') loadTrash().then(t => setTrashed(t.items.length), () => setTrashed(null))
    return repo.list().then(setList, e => { setMsg(because('Couldn’t load your runners', (e as Error).message ?? String(e))); setList([]) })
  }
  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const where = repo.mode === 'server' ? 'the server' : 'this browser'
  // admin and editors also get everyone else's runners (read-only): theirs first, then one group per owner
  const mine = (list ?? []).filter(s => !me || !s.owner || s.owner === me.username)
  const sources: Sources = id => { const k = id.toLowerCase(); return [...c.sources.values()].find(s => s.id.toLowerCase() === k) }

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

  // each account gets copies of its own (new ids): one per character and canon-ness, whatever ids a re-import gave
  const loadExamples = async () => {
    try {
      const have = new Set(mine.map(s => keyOf(s.ch, sources)))
      let n = 0
      const bad: string[] = []
      const { rows, error } = await exampleList(sources, repo.mode === 'server')
      const examples = chooseExamples(rows, sources)
      if (error) bad.push(error)
      if (!examples.length) return setMsg(error ?? 'No example characters yet: they come with imported books (the core rulebook and Daegann’s pregen booklet) and the server’s example sets.')
      for (const { url, key } of examples.filter(s => !have.has(s.key))) {
        const file = url.split('/').pop()
        const res = await fetch(url).catch(() => null)
        if (!res?.ok) { bad.push(`${file}: couldn’t be fetched.`); continue }
        const r = readCharacterFile(await res.text())
        if (!r.ok) { bad.push(`${file}: ${r.reason}`); continue }
        if (await store({ ...r.character, id: newId(), sampleKey: key, lastExportedAt: r.character.updatedAt })) { n++; have.add(key) }
      }
      setMsg([n ? `Added ${n} example character${n === 1 ? '' : 's'}.` : bad.length ? '' : 'The example characters are already in your library.', ...bad].filter(Boolean).join(' '))
      void refresh()
    } catch (e) {
      setMsg(because('Couldn’t load the example characters', (e as Error).message ?? String(e)))
    }
  }

  // extra copies of an example character in your own library (loaded twice, or both a book's and a set's version): to your trash
  const dupes = extraCopies(mine, sources)
  const from = (ch: Character) => ch.origin ? c.sources.get(ch.origin)?.name ?? ch.origin : ch.sampleKey?.includes('.') ? ch.sampleKey.split('.')[0].toUpperCase()
    : ch.id.startsWith('sample-') ? 'built-in, first release' : 'example set'
  const tidy = async () => {
    const moved: string[] = [], name = (ch: Character) => ch.identity.streetName || ch.identity.name
    const done = () => moved.length ? `${repo.mode === 'server' ? 'Moved to your trash' : 'Removed'}: ${moved.join(', ')}.` : ''
    try {
      for (const ch of dupes) { await repo.remove(ch.id); moved.push(name(ch)) } // stops at the first that fails
      setMsg(done())
    } catch (e) {
      const left = dupes.length - moved.length
      setMsg([done(), because(`Couldn’t move ${left === 1 ? 'the last copy' : `the other ${left} copies`}`, (e as Error).message ?? String(e)),
        'Try Tidy up again in a moment.'].filter(Boolean).join(' '))
    } finally {
      setTidying(false)
      void refresh()
    }
  }

  const duplicate = async (ch: Character) => {
    await store({ ...structuredClone(ch), id: newId(), sampleKey: undefined, identity: { ...ch.identity, streetName: `${ch.identity.streetName || ch.identity.name} (copy)` }, lastExportedAt: undefined, updatedAt: new Date().toISOString() })
    void refresh()
  }

  const byOwner = new Map<string, Stored[]>()
  for (const s of list ?? []) if (!mine.includes(s)) byOwner.set(s.owner!, [...byOwner.get(s.owner!) ?? [], s])
  const others = [...byOwner].map(([owner, rows]) => [owner, rows[0].ownerName ?? owner, rows] as const)
  const dossier = ({ ch, rev }: Stored, own: boolean) => (
    <div className="dossier" key={ch.id}>
      {ch.identity.portrait ? <img className="face" src={ch.identity.portrait} alt="" /> : <span className="face" aria-hidden>{(ch.identity.streetName || ch.identity.name || '?')[0]}</span>}
      <div>
        <a className="title" href={`#/c/${ch.id}/concept`}>{ch.identity.streetName || ch.identity.name || 'Unnamed runner'}</a>
        <div className="meta">
          {c.metatypes.get(ch.identity.metatype)?.name ?? ch.identity.metatype}, {c.levels.get(ch.level)?.name ?? ch.level}
          {' '}<span className={`mode ${ch.finalizedAt ? 'career' : 'creation'}`}>{ch.finalizedAt ? 'Career' : 'Creation'}</span>
          {ch.origin && !isCanonSource(c, ch.origin) && <> <NonCanon source={c.sources.get(ch.origin)?.name ?? ch.origin} /></>}
          {repo.mode === 'browser' && needsExportReminder(ch) && <span className="warn"> Not exported since it changed</span>}
        </div>
      </div>
      {own ? <div className="row">
        <button className="btn small" onClick={async () => { await store(exportCharacter(c, ch), rev); void refresh() }}>Export</button>
        <button className="btn small quiet" onClick={() => void duplicate(ch)}>Duplicate</button>
        <button className="btn small quiet" onClick={() => setToDelete(ch)}>Delete</button>
      </div> : <div className="row">
        <button className="btn small" onClick={() => exportCharacter(c, ch)}>Export</button>
      </div>}
    </div>
  )

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
          <button className="btn quiet" onClick={loadExamples}>Load example characters</button>
          {admin && <a className="btn quiet" href="#/books">Books</a>}
          {canEdit(me) ? <a className="btn quiet" href="#/rules">Rules</a> : <a className="btn quiet" href="#/table-rules">Table rules</a>}
          <a className="btn quiet" href="#/data">Game data</a>
          {trashed !== null && <a className="btn quiet" href="#/trash">Trash ({trashed})</a>}
          <SettingsButton />
          <AccountMenu />
        </div>
      </header>
      <p className="muted">Saved on {where}{repo.mode === 'server' ? ' (appdata/chummer-anarchy2/characters)' : '. Export files to keep them safe.'}</p>
      {noBooks && <p className="banner">Upload your books to add amps, spells and gear. <a href="#/books">Open the Books page</a></p>}
      {msg && <p className="banner" role="status">{msg}</p>}
      {dupes.length > 0 && <p className="banner">
        {dupes.length === 1 ? 'An example character is in your library twice' : `${dupes.length} example characters are extra copies`}, unchanged since they were loaded.{' '}
        <button className="btn small" onClick={() => setTidying(true)}>Tidy up</button></p>}

      {list === null ? <p className="muted">Loading runners…</p> : <>
        {others.length > 0 && <h2>My runners</h2>}
        {mine.length === 0 ? (
          <div className="empty">
            <p>No runners yet. Start a new one, import a character file, or load the example characters to look around.</p>
          </div>
        ) : mine.map(s => dossier(s, true))}
        {others.map(([owner, name, rows]) => <section key={owner} aria-label={`${name}’s runners`}>
          <h2>{name}’s runners</h2>
          {rows.map(s => dossier(s, false))}
        </section>)}
      </>}

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

      <Modal open={tidying} onClose={() => setTidying(false)} title="Tidy up the example characters"
        actions={<><button className="btn" onClick={() => setTidying(false)}>Keep them</button>
          <button className="btn primary" onClick={() => void tidy()}>{repo.mode === 'server' ? 'Move to trash' : 'Remove copies'}</button></>}>
        <p>Your library keeps one copy of each example character (one canon, one non-canon). These extra copies are unchanged since they were loaded:</p>
        <ul>{dupes.map(ch => <li key={ch.id}>{ch.identity.streetName || ch.identity.name} ({from(ch)})</li>)}</ul>
        <p className="muted">{repo.mode === 'server'
          ? 'They move to your trash, so they can still be restored from there. Copies you changed stay.'
          : 'They’re removed from this browser. Copies you changed stay.'}</p>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.identity.streetName || toDelete?.identity.name || 'this runner'}?`}
        actions={<><button className="btn" onClick={() => setToDelete(null)}>Keep</button>
          <button className="btn danger" onClick={async () => {
            try { await repo.remove(toDelete!.id) } catch (e) { setMsg(because('Couldn’t delete the runner', (e as Error).message ?? String(e))) }
            setToDelete(null); void refresh() }}>Delete runner</button></>}>
        <p>{repo.mode === 'server'
          ? 'It moves to your trash, where you can restore it or delete it for good.'
          : 'This removes the runner from this browser. Exported files are not affected.'}</p>
      </Modal>
    </main>
  )
}

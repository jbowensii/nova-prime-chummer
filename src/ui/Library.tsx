import { useEffect, useRef, useState } from 'react'
import { blankCharacter, characterToXml, isCanonSource, parseCharacterFile, snapshotEntries, xmlToCharacter } from '../engine'
import type { Catalog, Character } from '../model/types'
import { newId } from '../model/types'
import { AccountMenu, because, canEdit, isAdmin, savesSettled, send, useMe } from './auth'
import { Brand, Modal, NonCanon, StateBadge } from './bits'
import { useRepo, type Stored, type Unreadable } from './repo'
import { SettingsButton } from './settings'
import { loadTrash } from './Trash'
import { needsExportReminder } from './storage'
import { joined, loadCampaigns, type Campaign } from './Campaigns'
import { chooseExamples, extraCopies, keyOf, type Example, type Sources } from './samples'
import { AskButton } from './AskRules'
import { Face } from './Portrait'

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

export type SortBy = 'az' | 'za' | 'recent'
const SORT_KEY = 'ca2.library.sort'
const shownName = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'
/** The A–Z key: street name, else real name; accents, case and punctuation (O'Neil, "Doc") don't count. */
export const sortKey = (ch: Character) => (ch.identity.streetName || ch.identity.name).normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, '').trim().toLowerCase()
/** The runner list's order: A–Z (the default), Z–A or newest edit first; unnamed runners last. `q` keeps those whose
 *  street name or real name contains it. */
export function arrange(rows: Stored[], sort: SortBy, q: string): Stored[] {
  const want = q.trim().toLowerCase()
  const hit = (s: Stored) => !want || [s.ch.identity.streetName, s.ch.identity.name].some(n => n.toLowerCase().includes(want))
  const az = (a: Stored, b: Stored) => { const x = sortKey(a.ch), y = sortKey(b.ch)
    return !x !== !y ? (x ? -1 : 1) : x.localeCompare(y) }
  const by = sort === 'recent' ? (a: Stored, b: Stored) => b.ch.updatedAt.localeCompare(a.ch.updatedAt) || az(a, b)
    : sort === 'za' ? (a: Stored, b: Stored) => (!sortKey(a.ch) !== !sortKey(b.ch) ? az(a, b) : az(b, a)) : az
  return rows.filter(hit).sort(by)
}
/** Other accounts' runners (the admin's view, an editor's campaigns), one group per owner: every owner with a runner
 *  or with a file that couldn't be read, so nothing is hidden. Rows sorted as the list is. */
export function ownerGroups(others: Stored[], unreadable: Unreadable[], sort: SortBy, q: string) {
  const groups = new Map<string, { name: string; rows: Stored[]; broken: Unreadable[] }>()
  const group = (owner: string, name?: string) => groups.get(owner) ?? groups.set(owner, { name: name ?? owner, rows: [], broken: [] }).get(owner)!
  for (const s of others) group(s.owner!, s.ownerName).rows.push(s)
  for (const u of unreadable) group(u.owner!, u.ownerName).broken.push(u)
  return [...groups].map(([owner, g]) => ({ owner, ...g, rows: arrange(g.rows, sort, q) }))
}

export { initial } from './Portrait'

export function Library({ c }: { c: Catalog }) {
  const repo = useRepo()
  const me = useMe(), admin = isAdmin(me)
  const [list, setList] = useState<Stored[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [repairing, setRepairing] = useState<{ u: Unreadable; ch: Character; changes: string[] } | null>(null)
  const [sort, setSortState] = useState<SortBy>(() => { try { const v = localStorage.getItem(SORT_KEY); return v === 'za' || v === 'recent' ? v : 'az' } catch { return 'az' } })
  const setSort = (v: SortBy) => { setSortState(v); try { localStorage.setItem(SORT_KEY, v) } catch { /* this browser won't remember it */ } }
  const [q, setQ] = useState('')
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
  // server only: the caller's campaigns (the admin: all), for each runner's tag, Add to campaign… and the filter
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [only, setOnly] = useState('') // the filter: '' every runner, '-' none in a campaign, else a campaign's id
  const [joining, setJoining] = useState<Character | null>(null)
  const [target, setTarget] = useState('')
  const refresh = () => {
    if (repo.mode === 'server') {
      loadTrash().then(t => setTrashed(t.items.length), () => setTrashed(null))
      loadCampaigns().then(setCampaigns, () => setCampaigns([]))
    }
    // a runner just left in the editor may still be sending its last change: list it as saved
    return savesSettled().then(() => repo.listAll()).then(r => { setList(r.stored); setUnreadable(r.unreadable) }, e => { setMsg(because('Couldn’t load your runners', (e as Error).message ?? String(e))); setList([]) })
  }
  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const where = repo.mode === 'server' ? 'the server' : 'this browser'
  // the admin also gets everyone else's runners, an editor those in the campaigns they GM (read-only): theirs first, then one group per owner
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
    await store({ ...structuredClone(ch), id: newId(), sampleKey: undefined, campaign: undefined, identity: { ...ch.identity, streetName: `${ch.identity.streetName || ch.identity.name} (copy)` }, lastExportedAt: undefined, updatedAt: new Date().toISOString() })
    void refresh()
  }

  const campaignOf = (ch: Character) => campaigns.find(x => x.id === ch.campaign)
  const open = campaigns.filter(x => !x.archived && joined(x, me)) // the ones a runner of yours can join
  const shown = (s: Stored) => !only || (only === '-' ? !campaignOf(s.ch) : s.ch.campaign === only)
  const assign = async (ch: Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch), name = ch.identity.streetName || ch.identity.name || 'The runner'
      await send(cid ? `campaigns/${cid}/runners` : `campaigns/${ch.campaign}/runners/${encodeURIComponent(ch.id)}`, cid ? { id: ch.id } : undefined, cid ? 'POST' : 'DELETE')
      setMsg(cid ? `${name} is in ${x?.name} now.` : `${name} left ${x?.name ?? 'its campaign'}.`)
    } catch (e) { setMsg((e as Error).message) }
    setJoining(null)
    void refresh()
  }

  // a file that couldn't be read: listed with why; its owner or the admin can download it, its owner can try to repair it
  const download = (u: Unreadable) => {
    const url = URL.createObjectURL(new Blob([u.xml], { type: 'application/xml' }))
    Object.assign(document.createElement('a'), { href: url, download: u.file }).click()
    URL.revokeObjectURL(url)
  }
  const tryRepair = (u: Unreadable) => {
    const changes: string[] = []
    const r = xmlToCharacter(u.xml, { repair: changes })
    if (!r.ok) return setMsg(`${u.name} can’t be repaired here: ${r.reason} Download the file to keep it.`)
    setRepairing({ u, ch: r.character, changes })
  }
  const saveRepaired = async () => {
    if (!repairing) return
    if (await store(repairing.ch, repairing.u.rev)) setMsg(`Repaired ${repairing.u.name}.`)
    setRepairing(null)
    void refresh()
  }
  const brokenRow = (u: Unreadable) => {
    const own = !u.owner || u.owner === me?.username
    return (
      <div className="dossier unreadable" key={`${u.owner}/${u.file}`}>
        <span className="face" aria-hidden>!</span>
        <div>
          <span className="title">Couldn’t open {u.name}</span>
          <div className="meta err">{u.error}</div>
        </div>
        <div className="row">
          {(own || admin) && <button className="btn small" onClick={() => download(u)}>Download file</button>}
          {own && <button className="btn small quiet" onClick={() => tryRepair(u)}>Try to repair</button>}
        </div>
      </div>
    )
  }
  const rows = arrange(mine.filter(shown), sort, q)

  const others = ownerGroups((list ?? []).filter(s => shown(s) && !mine.includes(s)), unreadable.filter(u => u.owner && u.owner !== me?.username), sort, q)
  const dossier = ({ ch, rev }: Stored, own: boolean) => (
    <div className="dossier" key={ch.id}>
      <Face ch={ch} />
      <div>
        <a className="title" href={`#/c/${ch.id}/concept`}>{shownName(ch)}</a>
        <div className="meta">
          {[c.metatypes.get(ch.identity.metatype)?.name ?? ch.identity.metatype, c.levels.get(ch.level)?.name ?? ch.level].filter(Boolean).join(', ')}
          {' '}<StateBadge finalized={!!ch.finalizedAt} />
          {ch.origin && !isCanonSource(c, ch.origin) && <> <NonCanon source={c.sources.get(ch.origin)?.name ?? ch.origin} /></>}
          {repo.mode === 'browser' && needsExportReminder(ch) && <span className="warn"> Not exported since it changed</span>}
          {campaignOf(ch) && <> <a className="ctag" href={`#/campaigns/${ch.campaign}`} title="Campaign">{campaignOf(ch)!.name}</a></>}
        </div>
      </div>
      {own ? <div className="row">
        <button className="btn small" onClick={async () => { await store(exportCharacter(c, ch), rev); void refresh() }}>Export</button>
        <button className="btn small quiet" onClick={() => void duplicate(ch)}>Duplicate</button>
        {campaignOf(ch) ? <button className="btn small quiet" onClick={() => void assign(ch, null)}>Remove from campaign</button>
          : open.length > 0 && <button className="btn small quiet" onClick={() => { setTarget(open[0].id); setJoining(ch) }}>Add to campaign…</button>}
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
          <Brand />
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
          {repo.mode === 'server' && <a className="btn quiet" href="#/campaigns">Campaigns</a>}
          {trashed !== null && <a className="btn quiet" href="#/trash">Trash ({trashed})</a>}
          <AskButton /><SettingsButton />
          <AccountMenu />
        </div>
      </header>
      <p className="muted">Saved on {where}{repo.mode === 'server' ? ' (appdata/chummer-anarchy2/characters)' : '. Export files to keep them safe.'}</p>
      {noBooks && <p className="banner">Upload your books to add amps, spells and gear. <a href="#/books">Open the Books page</a></p>}
      {msg && <p className="banner" role="status">{msg}</p>}
      {dupes.length > 0 && <p className="banner">
        {dupes.length === 1 ? 'An example character is in your library twice' : `${dupes.length} example characters are extra copies`}, unchanged since they were loaded.{' '}
        <button className="btn small" onClick={() => setTidying(true)}>Tidy up</button></p>}

      {campaigns.length > 0 && <label className="filter">Show
        <select value={only} onChange={e => setOnly(e.target.value)}>
          <option value="">Every runner</option>
          <option value="-">Not in a campaign</option>
          {campaigns.map(x => <option key={x.id} value={x.id}>{x.name}{x.archived ? ' (archived)' : ''}</option>)}
        </select></label>}
      {list !== null && (list.length > 0 || unreadable.length > 0) && <div className="row listtools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Street name or real name" aria-label="Search runners" />
        <label className="inline">Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortBy)}>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
            <option value="recent">Recently edited</option>
          </select></label>
      </div>}
      {list === null ? <p className="muted">Loading runners…</p> : <>
        {others.length > 0 && <h2>My runners</h2>}
        {unreadable.filter(u => !u.owner || u.owner === me?.username).map(brokenRow)}
        {only && mine.length > 0 && !mine.some(shown) ? <p className="muted">None of your runners is {only === '-' ? 'outside a campaign' : 'in that campaign'}.</p>
        : mine.length === 0 ? (
          <div className="empty">
            <p>No runners yet. Start a new one, import a character file, or load the example characters to look around.</p>
          </div>
        ) : <>
          {rows.map(s => dossier(s, true))}
          {q && rows.length === 0 && <p className="muted">No runner’s name contains “{q.trim()}”.</p>}
        </>}
        {others.map(({ owner, name, rows, broken }) => <section key={owner} aria-label={`${name}’s runners`}>
          <h2>{name}’s runners</h2>
          {broken.map(brokenRow)}
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

      <Modal open={!!joining} onClose={() => setJoining(null)} title={`Add ${joining?.identity.streetName || joining?.identity.name || 'this runner'} to a campaign`}
        actions={<><button className="btn" onClick={() => setJoining(null)}>Cancel</button>
          <button className="btn primary" disabled={!target} onClick={() => void assign(joining!, target)}>Add to campaign</button></>}>
        <label>Campaign<select value={target} onChange={e => setTarget(e.target.value)}>
          {open.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>A runner plays in one campaign at a time; its GM can read and print it. To play it in another one too, duplicate it.</p>
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

      <Modal open={!!repairing} onClose={() => setRepairing(null)} title={`Repair ${repairing?.u.name ?? 'this runner'}?`}
        actions={<><button className="btn" onClick={() => setRepairing(null)}>Cancel</button>
          <button className="btn primary" onClick={() => void saveRepaired()}>Save repaired runner</button></>}>
        <p>It reads with these changes:</p>
        <ul>{repairing?.changes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p className="muted">Saving replaces the file with the repaired runner. Download the file first to keep the original.</p>
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

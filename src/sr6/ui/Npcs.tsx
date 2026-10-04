// Shadowrun 6 NPCs & Critters (#/sr6/npcs): the GMs' own area (admin and editors), as Anarchy's NpcsScreen. An SR6 NPC
// is an SR6 runner file with an <npc> block (server: /api/sr6/npcs, which refuses players and runner files). New NPC copies
// a catalog grunt, critter, spirit or sprite (src/sr6/engine/npc.ts) or starts blank; Load book NPCs copies the catalog's
// npcs entries not loaded yet; Import file takes SR6 NPC files only; a GM shares one with an SR6 campaign they run.
// Left out (R): Foundry export (F1), Move to compendium (S4), the duplicates finder.
import { useEffect, useMemo, useRef, useState } from 'react'
import { because, savesSettled, send, useMe } from '../../ui/auth'
import { Modal } from '../../ui/bits'
import { loadCampaigns, type Campaign } from '../../ui/Campaigns'
import { IconButton, IconLink } from '../../ui/icons'
import { arrange, ownerGroups, type SortBy } from '../../ui/Library'
import { PageHeader } from '../../ui/nav'
import { Face } from '../../ui/Portrait'
import type { Stored, Unreadable } from '../../ui/repo'
import { loadTrash } from '../../ui/Trash'
import { blankSr6Npc, bookNpcKey, NPC_KINDS, npcFromEntry } from '../engine/npc'
import { SR6_NPC_KINDS, type Sr6Character, type Sr6Npc, type Sr6NpcKind } from '../model/character'
import type { Sr6Catalog, Sr6Entry } from '../model/types'
import { sr6NpcHref } from './editor'
import { exportSr6, readSr6NpcImport, sr6NpcRepo } from './repo'

const SORT_KEY = 'ca2.sr6.npcs.sort'
const nameOf = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed NPC'

/** The book NPCs Load book NPCs adds: those whose book key isn't the sampleKey of one of `mine` (a renamed copy counts). */
export function bookNpcsToLoad(entries: Sr6Entry[], mine: Sr6Character[]): Sr6Entry[] {
  const have = new Set(mine.map(ch => ch.sampleKey))
  return entries.filter(e => !have.has(bookNpcKey(e)))
}

/** Grunts by Professional Rating, lowest first; null (none printed) last. */
export function byRating(entries: Sr6Entry[]): [number | null, Sr6Entry[]][] {
  const groups = new Map<number | null, Sr6Entry[]>()
  for (const e of entries) { const r = Number(e.attrs.rating) || null; groups.set(r, [...groups.get(r) ?? [], e]) }
  return [...groups].sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
}

/** The row chip: "Grunt PR 2", "Spirit F 4", "Sprite L 3", "Critter". */
export function npcChip(npc: Sr6Npc): string {
  const k = NPC_KINDS[npc.kind], short = k.rating?.letter ?? (k.rating ? 'PR' : '')
  return npc.rating != null && short ? `${k.label} ${short} ${npc.rating}` : k.label
}

export function Sr6Npcs({ c }: { c: Sr6Catalog }) {
  const repo = useMemo(() => sr6NpcRepo(), [])
  const me = useMe()
  const [list, setList] = useState<Stored<Sr6Character>[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSortState] = useState<SortBy>(() => { try { const v = localStorage.getItem(SORT_KEY); return v === 'za' || v === 'recent' ? v : 'az' } catch { return 'az' } })
  const setSort = (v: SortBy) => { setSortState(v); try { localStorage.setItem(SORT_KEY, v) } catch { /* not remembered */ } }
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<Sr6NpcKind>('grunt')
  const [from, setFrom] = useState('')
  const [rating, setRating] = useState('1')
  const [sharing, setSharing] = useState<Sr6Character | null>(null)
  const [target, setTarget] = useState('')
  const [toDelete, setToDelete] = useState<Sr6Character | null>(null)
  const [trashed, setTrashed] = useState<number | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const refresh = () => {
    loadCampaigns('sr6').then(setCampaigns, () => setCampaigns([]))
    loadTrash(undefined, true, 'sr6').then(t => setTrashed(t.items.length), () => setTrashed(null))
    return savesSettled().then(() => repo.listAll()).then(r => { setList(r.stored); setUnreadable(r.unreadable) },
      e => { setMsg(because('Couldn’t load your NPCs', (e as Error).message ?? String(e))); setList([]) })
  }
  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const own = (s: { owner?: string }) => !me || !s.owner || s.owner === me.username
  const mine = (list ?? []).filter(own)
  const others = ownerGroups((list ?? []).filter(s => !own(s)), unreadable.filter(u => !own(u)), sort, q)
  const rows = arrange(mine, sort, q)
  const gmOf = campaigns.filter(x => x.you === 'gm' && !x.archived)
  const campaignOf = (ch: Sr6Character) => campaigns.find(x => x.id === ch.campaign)
  const entriesOf = (k: Sr6NpcKind) => [...c.entries[NPC_KINDS[k].kind].values()].sort((a, b) => a.name.localeCompare(b.name))
  const rated = !!NPC_KINDS[kind].rating?.letter

  const store = async (ch: Sr6Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    if (!r.ok) setMsg(r.error ?? `${nameOf(ch)} changed elsewhere; open it to sort it out.`)
    return r.ok
  }
  const pickKind = (k: Sr6NpcKind) => { setKind(k); setFrom(entriesOf(k)[0]?.id ?? '') }
  const openNew = () => { pickKind('grunt'); setRating('1'); setCreating(true) }
  const level = Math.max(1, Math.floor(Number(rating)) || 1)
  const create = async () => {
    const e = from ? c.entries[NPC_KINDS[kind].kind].get(from) : undefined
    const ch = e ? npcFromEntry(e, rated ? level : undefined) : blankSr6Npc(kind, rated ? level : undefined)
    if (await store(ch)) { setCreating(false); location.hash = sr6NpcHref(ch.id) }
  }

  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = [...files], have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [], bad: string[] = []
    for (const f of picked) {
      const r = readSr6NpcImport(await f.text(), have)
      if (!r.ok) { bad.push(`${f.name}: ${r.reason}`); continue }
      if (await store(r.ch)) { done.push(nameOf(r.ch)); have.add(r.ch.id) }
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }

  // the catalog's npcs entries (R: grunts and named NPCs; critters, spirits and sprites are made one at a time), each
  // under its book key so a renamed copy still counts as loaded
  const loadBook = async () => {
    const all = [...c.entries.npcs.values()]
    if (!all.length) return setMsg('No book NPCs yet: they come with an imported core rulebook.')
    let n = 0
    for (const e of bookNpcsToLoad(all, mine.map(s => s.ch))) if (await store({ ...npcFromEntry(e), sampleKey: bookNpcKey(e) })) n++
    setMsg(n ? `Added ${n} book NPC${n === 1 ? '' : 's'}.` : 'The book NPCs are already in your NPCs.')
    void refresh()
  }

  const share = async (ch: Sr6Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch)
      await send(cid ? `sr6/campaigns/${cid}/npcs` : `sr6/campaigns/${ch.campaign}/npcs/${encodeURIComponent(ch.id)}`, cid ? { id: ch.id } : undefined, cid ? 'POST' : 'DELETE')
      setMsg(cid ? `${nameOf(ch)} is shared with ${x?.name}.` : `${nameOf(ch)} is no longer shared with ${x?.name ?? 'its campaign'}.`)
    } catch (e) { setMsg((e as Error).message) }
    setSharing(null)
    void refresh()
  }

  const row = ({ ch, rev }: Stored<Sr6Character>, mineToo: boolean) => (
    <div className="dossier" key={ch.id}>
      <Face ch={ch} />
      <div>
        <a className="title" href={sr6NpcHref(ch.id)}>{nameOf(ch)}</a>
        <div className="meta">
          {ch.npc && <span className="noncanon npckind">{npcChip(ch.npc)}</span>}
          {ch.npc?.group && <> {ch.npc.group}</>}
          {campaignOf(ch) && <> <a className="ctag" href={`#/sr6/campaigns/${ch.campaign}`} title="Shared with this campaign">{campaignOf(ch)!.name}</a></>}
        </div>
      </div>
      <div className="row">
        {!mineToo && <a className="btn small" href={sr6NpcHref(ch.id, 'print')} aria-label={`Print ${nameOf(ch)}`}>Print</a>}
        <button className="btn small" aria-label={`Export ${nameOf(ch)}`}
          onClick={async () => { const out = exportSr6(c, ch); if (mineToo) { await store(out, rev); void refresh() } }}>Export</button>
        {mineToo && (ch.campaign
          ? <button className="btn small quiet" aria-label={`Unshare ${nameOf(ch)}`} onClick={() => void share(ch, null)}>Unshare</button>
          : gmOf.length > 0 && <button className="btn small quiet" aria-label={`Share ${nameOf(ch)}…`} onClick={() => { setTarget(gmOf[0].id); setSharing(ch) }}>Share with campaign…</button>)}
        {mineToo && <button className="btn small quiet" aria-label={`Delete ${nameOf(ch)}`} onClick={() => setToDelete(ch)}>Delete</button>}
      </div>
    </div>
  )
  const broken = (u: Unreadable) => (
    <div className="dossier unreadable" key={`${u.owner}/${u.file}`}>
      <span className="face" aria-hidden>!</span>
      <div><span className="title">Couldn’t open {u.name}</span><div className="meta err">{u.error}</div></div>
    </div>
  )
  const entries = entriesOf(kind), plural = `${NPC_KINDS[kind].label.toLowerCase()}s`

  return (
    <main className="lib">
      <PageHeader title="NPCs & Critters">
        <IconButton className="primary" icon="npc-add" label="New NPC" onClick={openNew} />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} />
        <IconButton icon="book" label="Load book NPCs" onClick={() => void loadBook()} />
        <input ref={file} type="file" accept=".xml,application/xml" multiple hidden onChange={e => { void importFiles(e.target.files); e.target.value = '' }} />
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/sr6/npcs/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">Your NPCs, critters, spirits and sprites, for GMs only: players never see them. Share one with a campaign you run and its other GMs can read and print it.</p>
      {msg && <p className="banner" role="status">{msg}</p>}
      {list !== null && list.length > 0 && <div className="row listtools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search NPCs" />
        <label className="inline">Sort
          <select value={sort} onChange={e => setSort(e.target.value as SortBy)}>
            <option value="az">A–Z</option><option value="za">Z–A</option><option value="recent">Recently edited</option>
          </select></label>
      </div>}
      {list === null ? <p className="muted">Loading NPCs…</p> : <>
        {others.length > 0 && <h2>My NPCs</h2>}
        {unreadable.filter(own).map(broken)}
        {mine.length === 0 ? <div className="empty"><p>No NPCs yet. Make one, import an NPC file, or load the book’s NPCs.</p></div> : <>
          {rows.map(s => row(s, true))}
          {q && rows.length === 0 && <p className="muted">No NPC’s name contains “{q.trim()}”.</p>}
        </>}
        {others.map(({ owner, name, rows, broken: bad }) => <section key={owner} aria-label={`${name}’s NPCs`}>
          <h2>{name}’s NPCs</h2>
          {bad.map(broken)}
          {rows.map(s => row(s, false))}
        </section>)}
      </>}

      <Modal open={creating} onClose={() => setCreating(false)} title="New NPC"
        actions={<><button className="btn" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" onClick={() => void create()}>Create NPC</button></>}>
        <div className="grid2">
          <label>Kind<select value={kind} onChange={e => pickKind(e.target.value as Sr6NpcKind)}>
            {SR6_NPC_KINDS.map(k => <option key={k} value={k}>{NPC_KINDS[k].label}</option>)}</select></label>
          <label>From the catalog<select value={from} onChange={e => setFrom(e.target.value)}>
            {kind === 'grunt'
              ? byRating(entries).map(([r, es]) => <optgroup key={r ?? ''} label={r == null ? 'No Professional Rating' : `Professional Rating ${r}`}>
                {es.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</optgroup>)
              : entries.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            <option value="">Blank</option></select></label>
          {rated && <label>{NPC_KINDS[kind].rating!.label}<input type="number" min={1} step={1} value={rating} onChange={e => setRating(e.target.value)} /></label>}
        </div>
        {!entries.length && <p className="muted" style={{ marginTop: '0.8rem' }}>No {plural} in the imported books yet.</p>}
        <p className="muted" style={{ marginTop: '0.8rem' }}>The stat block is a copy: change it on the NPC’s Stat block tab.</p>
      </Modal>

      <Modal open={!!sharing} onClose={() => setSharing(null)} title={`Share ${sharing ? nameOf(sharing) : 'this NPC'} with a campaign`}
        actions={<><button className="btn" onClick={() => setSharing(null)}>Cancel</button>
          <button className="btn primary" disabled={!target} onClick={() => void share(sharing!, target)}>Share</button></>}>
        <label>Campaign<select value={target} onChange={e => setTarget(e.target.value)}>
          {gmOf.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>The campaign’s other GMs can read and print it; its players can’t see it. An NPC is shared with one campaign at a time.</p>
      </Modal>

      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete ? nameOf(toDelete) : 'this NPC'}?`}
        actions={<><button className="btn" onClick={() => setToDelete(null)}>Keep</button>
          <button className="btn danger" onClick={async () => {
            try { await repo.remove(toDelete!.id) } catch (e) { setMsg(because('Couldn’t delete the NPC', (e as Error).message ?? String(e))) }
            setToDelete(null); void refresh() }}>Delete NPC</button></>}>
        <p>It moves to your Shadowrun 6 NPC trash, where you can restore it or delete it for good.</p>
      </Modal>
    </main>
  )
}

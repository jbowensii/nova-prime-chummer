// The compendium pages both games share (#/compendiums, #/sr6/compendiums): the list (yours, shared with you, the books),
// New compendium / Details, the id routing, the entry table and Copy to…. A game hands in one adapter (CompGame: its
// store, its catalog's sources, its citation) plus its own compendium and book pages; the entry rows and forms stay the
// game's (Compendiums.tsx for Anarchy, src/sr6/ui/Compendiums.tsx for SR6). Never mixed: each adapter lists, saves and
// checks only its own game's compendiums, campaigns and sources.
import { useEffect, useState, type ReactNode } from 'react'
import { SOURCE_ID } from '../engine'
import { because, useMe } from './auth'
import { Modal } from './bits'
import { loadCampaigns, type Campaign } from './Campaigns'
import type { Stored } from './compendiumStore'
import type { Game } from './game'
import { IconButton } from './icons'
import { PageHeader } from './nav'
import type { SaveResult } from './repo'

export type Sharing = 'private' | 'campaign' | 'table'
/** What every game's compendium has. */
export interface CompBase { id: string; name: string; source: string; sharing: Sharing; campaign?: string; npcs: unknown[] }
export type CompMeta = Pick<CompBase, 'id' | 'name' | 'source' | 'sharing' | 'campaign'>
export interface BookRef { id: string; name: string; publisher: string; canon: boolean }

/** One game's compendiums. books: its catalog's sources minus the compendiums' own; taken: a source id its catalog
 *  already has; loaded: the compendium's entries are in the catalog (else its page is a banner); count: its entries
 *  (not NPCs); cite: a source and page as the game shows them. */
export interface CompGame<C extends CompBase> {
  game: Game
  href: '#/compendiums' | '#/sr6/compendiums'
  intro: ReactNode
  list(): Promise<{ comps: Stored<C>[]; bad: string[] }>
  blank(meta: CompMeta): C
  save(comp: C, rev?: number): Promise<SaveResult>
  remove(id: string): Promise<void>
  books: BookRef[]
  taken(source: string): boolean
  loaded(comp: C): boolean
  count(comp: C): number
  cite(source: string, page: number): ReactNode
}

/** One listed entry: the game's rows extend it with what their own actions need. */
export interface ShellRow { key: string; name: string; detail: string; text: string; chips?: ReactNode; source?: string; page?: number }

export const SHARING: Record<Sharing, string> = { private: 'Private', campaign: 'Shared with a campaign’s GMs', table: 'Shared with the table' }
const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
export const entries = (n: number) => n === 1 ? '1 entry' : `${n} entries`
/** "Private", "Shared with <campaign>’s GMs", "Shared with the table". */
export const sharingOf = (x: CompBase, campaigns: Campaign[]) =>
  x.sharing === 'campaign' ? `Shared with ${campaigns.find(k => k.id === x.campaign)?.name ?? 'a campaign'}’s GMs` : SHARING[x.sharing]
/** The books the list shows: none a listed compendium cites, by name. */
export const shelf = (books: BookRef[], comps: CompBase[]) =>
  books.filter(s => !comps.some(x => x.source === s.id)).sort((a, b) => a.name.localeCompare(b.name))

export interface PageProps<C extends CompBase> { comp: Stored<C>; own: boolean; campaigns: Campaign[]; targets: Stored<C>[]; changed: () => Promise<void> }
export interface BookProps<C extends CompBase> { id: string; targets: Stored<C>[]; changed: () => Promise<void> }

/** <href> and <href>/<id or book source id>. page/book: the game's own pages. reload: the catalog again (after a save). */
export function CompendiumShell<C extends CompBase>({ g, id, reload, page, book }: { g: CompGame<C>; id?: string; reload: () => Promise<void>
  page: (p: PageProps<C>) => ReactNode; book: (p: BookProps<C>) => ReactNode }) {
  const me = useMe()
  const [comps, setComps] = useState<Stored<C>[] | null>(null)
  const [bad, setBad] = useState<string[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const refresh = () => g.list().then(p => { setComps(p.comps); setBad(p.bad) },
    e => { setMsg(because('Couldn’t load the compendiums', (e as Error).message)); setComps([]) })
  useEffect(() => { void refresh(); loadCampaigns(g.game).then(setCampaigns, () => setCampaigns([])) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  /** after a save: the list and the catalog (the pickers) both */
  const changed = async () => { await refresh(); await reload() }

  if (!comps) return <main className="lib"><PageHeader title="Compendiums" /><p className="muted">Loading compendiums…</p></main>
  const mine = (x: Stored<C>) => x.owner === me?.username
  if (id) {
    const comp = comps.find(x => x.id === id)
    const targets = comps.filter(mine)
    // not in this catalog (its source id clashes, or the catalog loaded without it): read only, so a new entry's id can't
    // overwrite one of its own and Export can't pick up another source's entries
    if (comp && !g.loaded(comp)) return <main className="lib"><PageHeader title={comp.name} /><p className="banner">{comp.name}’s entries didn’t load into the catalog
      (Game data lists why). Reload the page; if its source id {comp.source} is now a book’s, ask the admin. <a href={g.href}>All compendiums</a></p></main>
    if (comp) return page({ comp, own: mine(comp), campaigns, targets, changed })
    if (shelf(g.books, comps).some(b => b.id === id)) return book({ id, targets, changed })
    return <main className="lib"><PageHeader title="Compendiums" /><p className="banner">No such compendium. <a href={g.href}>All compendiums</a></p></main>
  }
  return <ListPage g={g} comps={comps} bad={bad} mine={mine} campaigns={campaigns} msg={msg} setMsg={setMsg} changed={changed} />
}

function ListPage<C extends CompBase>({ g, comps, bad, mine, campaigns, msg, setMsg, changed }: { g: CompGame<C>; comps: Stored<C>[]; bad: string[]
  mine: (x: Stored<C>) => boolean; campaigns: Campaign[]; msg: string | null; setMsg: (m: string | null) => void; changed: () => Promise<void> }) {
  const [details, setDetails] = useState<Stored<C> | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Stored<C> | null>(null)
  const own = comps.filter(mine), shared = comps.filter(x => !mine(x))
  const books = shelf(g.books, comps)
  const count = (x: C) => entries(g.count(x) + x.npcs.length)

  return (
    <main className="lib">
      <PageHeader title="Compendiums"><IconButton className="primary" icon="compendium-add" label="New compendium" onClick={() => setDetails('new')} /></PageHeader>
      <p className="muted">{g.intro}</p>
      {msg && <p className="banner" role="status">{msg}</p>}
      {bad.map(b => <p className="err" key={b}>Couldn’t open {b}</p>)}
      <section aria-label="Your compendiums">
        <h2>Your compendiums</h2>
        {own.length === 0 ? <p className="muted">None yet. Make one with New compendium.</p> : <div className="scroll-x"><table className="data"><tbody>
          {own.map(x => <tr key={x.id}>
            <td><a href={`${g.href}/${x.id}`}>{x.name}</a> <span className="muted">{x.source}</span></td>
            <td>{sharingOf(x, campaigns)}</td><td className="muted">{count(x)}</td>
            <td><div className="row">
              <button className="btn small quiet" aria-label={`Details of ${x.name}`} onClick={() => setDetails(x)}>Details…</button>
              <button className="btn small quiet" aria-label={`Delete ${x.name}`} onClick={() => setToDelete(x)}>Delete</button>
            </div></td>
          </tr>)}
        </tbody></table></div>}
      </section>
      {shared.length > 0 && <section aria-label="Shared with you">
        <h2>Shared with you</h2>
        <div className="scroll-x"><table className="data"><tbody>
          {shared.map(x => <tr key={x.id}>
            <td><a href={`${g.href}/${x.id}`}>{x.name}</a> <span className="muted">{x.source}</span></td>
            <td>{x.ownerName}</td><td>{sharingOf(x, campaigns)}</td><td className="muted">{count(x)}</td>
          </tr>)}
        </tbody></table></div>
      </section>}
      <section aria-label="Books">
        <h2>Books</h2>
        <div className="scroll-x"><table className="data"><tbody>
          {books.map(s => <tr key={s.id}>
            <td><a href={`${g.href}/${s.id}`}>{s.name}</a> <span className="muted">{s.id}</span></td>
            <td>{s.publisher}</td><td>{s.canon ? 'Canon' : 'Non-canon'}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      {details && <DetailsDialog g={g} comp={details === 'new' ? null : details} campaigns={campaigns} onClose={() => setDetails(null)}
        onSaved={async (x, made) => { setDetails(null); await changed(); if (made) location.hash = `${g.href}/${x.id}`; else setMsg(`Saved ${x.name}.`) }} />}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name ?? 'this compendium'}?`}
        actions={<><button className="btn" onClick={() => setToDelete(null)}>Keep</button>
          <button className="btn danger" onClick={async () => {
            try { await g.remove(toDelete!.id); setMsg(`Deleted ${toDelete!.name}.`) } catch (e) { setMsg(because('Couldn’t delete it', (e as Error).message)) }
            setToDelete(null); await changed() }}>Delete compendium</button></>}>
        <p>It moves to the server’s compendium trash, where only the admin can bring it back. Its entries leave the pickers; runners and NPCs that use one keep their copy.</p>
      </Modal>
    </main>
  )
}

/** New compendium (comp null), or an existing one's name and sharing (its source id is fixed). */
export function DetailsDialog<C extends CompBase>({ g, comp, campaigns, onClose, onSaved }: { g: CompGame<C>; comp: Stored<C> | null; campaigns: Campaign[]
  onClose: () => void; onSaved: (x: C, made: boolean) => Promise<void> }) {
  const gmOf = campaigns.filter(x => x.you === 'gm' && !x.archived)
  const [name, setName] = useState(comp?.name ?? '')
  const [source, setSource] = useState(comp?.source ?? '')
  const [sharing, setSharing] = useState<Sharing>(comp?.sharing ?? 'private')
  const [campaign, setCampaign] = useState(comp?.campaign ?? gmOf[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  // ids the server refused as taken: another GM's private compendium isn't in this catalog, so taken() can't know them
  const [refused, setRefused] = useState<string[]>([])
  const clash = g.taken(source) || refused.includes(source)
  const idOk = !!comp || (SOURCE_ID.test(source) && !clash)
  const ok = !busy && !!name.trim() && idOk && (sharing !== 'campaign' || !!campaign)
  const save = async () => {
    setBusy(true); setErr('')
    const meta = { name: name.trim(), sharing, campaign: sharing === 'campaign' ? campaign : undefined }
    const next: C = comp ? { ...comp, ...meta } : g.blank({ id: hex12(), source, ...meta })
    const r = await g.save(next, comp?.rev)
    if (r.ok) return onSaved(next, !comp)
    if (!comp && /source id .* is taken/.test(r.error ?? '')) { setRefused([...refused, source]); setBusy(false); return }
    setErr(r.conflict ? 'It changed elsewhere since this page loaded. Reload the page and try again.' : because('Couldn’t save', r.error ?? ''))
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title={comp ? comp.name : 'New compendium'}
      actions={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ok} onClick={() => void save()}>{comp ? 'Save' : 'Create compendium'}</button></>}>
      <div className="grid2">
        <label>Name<input autoFocus value={name} maxLength={120} onChange={e => setName(e.target.value)} /></label>
        <label>Source id<input value={source} maxLength={20} placeholder="STREET" disabled={!!comp} aria-invalid={!idOk}
          aria-describedby={!idOk && source ? 'comp-src-err' : undefined} onChange={e => setSource(e.target.value.toUpperCase())} /></label>
        <label>Sharing<select value={sharing} onChange={e => setSharing(e.target.value as Sharing)}>
          <option value="private">Private</option>
          {(gmOf.length > 0 || sharing === 'campaign') && <option value="campaign">A campaign’s GMs</option>}
          <option value="table">The whole table</option></select></label>
        {sharing === 'campaign' && <label>Campaign<select value={campaign} onChange={e => setCampaign(e.target.value)}>
          {gmOf.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      </div>
      {!idOk && source && <p className="err" id="comp-src-err">{g.taken(source) ? `${source} is already a source; choose another id.`
        : clash ? `${source} is taken (another GM’s compendium may use it); choose another id.`
        : 'A source id starts with a letter and uses only A–Z, 0–9 and hyphens.'}</p>}
      <p className="muted">{comp ? `Its entries cite ${comp.source}; that can’t change.` : 'Its entries cite this id (like a book’s), and it can’t be changed later.'}
        {' '}A campaign’s GMs or the whole table can read a shared compendium; only you can change it.</p>
      <div role="alert">{err && <p className="err">{err}</p>}</div>
    </Modal>
  )
}

/** The entries, one table per group (fixed columns, so the groups line up), filtered by name. */
export function Entries<R extends ShellRow>({ rows, q, cite, actions }: { rows: Map<string, R[]>; q: string; cite: (source: string, page: number) => ReactNode
  actions?: (r: R) => ReactNode }) {
  const t = q.trim().toLowerCase()
  const shown = [...rows].map(([g, list]) => [g, list.filter(r => !t || r.name.toLowerCase().includes(t))] as const).filter(([, list]) => list.length)
  if (!shown.length) return <p className="muted">{t ? `No entry’s name contains “${q.trim()}”.` : 'No entries yet.'}</p>
  return <>{shown.map(([g, list]) => <section key={g} aria-label={g}>
    <h2>{g}</h2>
    {/* fixed columns: every group's table lines up with the others */}
    <div className="scroll-x"><table className="data fixed" style={{ minWidth: actions ? '44rem' : '35rem' }}><colgroup><col style={{ width: '32%' }} /><col /><col style={{ width: '11rem' }} />{actions && <col style={{ width: '9rem' }} />}</colgroup><tbody>
      {list.map(r => <tr key={r.key}>
        <td><b>{r.name}</b>{r.chips && <> {r.chips}</>}{r.detail && <div className="muted">{r.detail}</div>}</td>
        <td className="muted">{r.text}</td>
        <td>{r.source && cite(r.source, r.page ?? 1)}</td>
        {actions && <td>{actions(r)}</td>}
      </tr>)}
    </tbody></table></div>
  </section>)}</>
}

/** "Copy to…" on a book's or a shared compendium's rows: into one of yours. into: the compendium with the row's copy added. */
export function CopyDialog<C extends CompBase, R extends ShellRow>({ g, row, targets, into, onClose, done }: { g: CompGame<C>; row: R; targets: Stored<C>[]
  into: (comp: Stored<C>, row: R) => C; onClose: () => void; done: (msg: string) => Promise<void> }) {
  const [to, setTo] = useState(targets[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    const comp = targets.find(x => x.id === to)!
    setBusy(true); setErr('')
    const r = await g.save(into(comp, row), comp.rev)
    if (r.ok) return done(`Copied ${row.name} to ${comp.name}.`)
    setErr(r.conflict ? 'It changed elsewhere since this page loaded. Reload the page and try again.' : because('Couldn’t copy it', r.error ?? ''))
    setBusy(false)
  }
  return (
    <Modal open onClose={onClose} title={`Copy ${row.name}`}
      actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy || !to} onClick={() => void copy()}>Copy</button></>}>
      <label>Compendium<select value={to} onChange={e => setTo(e.target.value)}>
        {targets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <p className="muted">The copy cites your compendium (page 1) and has no description: write your own on its Edit form.</p>
      <div role="alert">{err && <p className="err">{err}</p>}</div>
    </Modal>
  )
}

export const CopyButton = <R extends ShellRow>({ r, copy }: { r: R; copy: (r: R) => void }) =>
  <button className="btn small quiet" aria-label={`Copy ${r.name} to…`} onClick={() => copy(r)}>Copy to…</button>

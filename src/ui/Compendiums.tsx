// Compendiums (#/compendiums): the GMs' own collections of amps, gear, spells, vehicles and NPCs (spec 2026-10-02 §1,
// plan phase 2). Yours (edit, share, delete), the ones shared with you (read only), and the books as read-only
// compendiums. A compendium's entries are saved into its file (compendiumStore.ts) with the catalog's own entry form.
import { useEffect, useState } from 'react'
import { compendiumSource, SOURCE_ID } from '../engine'
import type { AmpTemplate, Catalog, Character, Compendium, Item, VehicleBase } from '../model/types'
import { newId } from '../model/types'
import { AccountMenu, because, useMe } from './auth'
import { AskButton } from './AskRules'
import { Brand, Modal, NpcChips } from './bits'
import { loadCampaigns, type Campaign } from './Campaigns'
import { deleteCompendium, listCompendiums, parseRows, saveCompendium, type StoredCompendium } from './compendiumStore'
import { EntryForm, NOUN, nameOf, slug, type Entry, type FormKind } from './EditEntry'
import { npcRepoFor, useRepo } from './repo'
import { SettingsButton } from './settings'
import { SourceLabel } from './SourceLabel'

const SHARING: Record<Compendium['sharing'], string> = { private: 'Private', campaign: 'Shared with a campaign’s GMs', table: 'Shared with the table' }
const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('')
const entries = (n: number) => n === 1 ? '1 entry' : `${n} entries`

/** One listed entry; `kind` and `entry` only for what the form edits (not NPCs). */
interface Row { key: string; name: string; detail: string; text: string; kind?: FormKind; entry?: Entry; npc?: Character; source?: string; page?: number }
const GROUPS = ['Amps', 'Weapons', 'Armor', 'Gear', 'Spells', 'Complex forms', 'Vehicles', 'NPCs'] as const
const ITEM_GROUP: Record<Item['kind'], typeof GROUPS[number]> = { weapon: 'Weapons', armor: 'Armor', gear: 'Gear', spell: 'Spells', 'complex-form': 'Complex forms' }

function groupRows(c: Catalog, amps: AmpTemplate[], items: Item[], vehicles: VehicleBase[], npcs: Character[]) {
  const out = new Map<string, Row[]>(GROUPS.map(g => [g, []]))
  const ref = (e: Entry) => ({ key: e.id, entry: e, source: e.source, page: e.page })
  for (const a of amps) out.get('Amps')!.push({ ...ref(a), kind: 'amps', name: a.name, text: a.narrative,
    detail: [c.ampTypes.get(a.type)?.name ?? a.type, a.printedRating ? `rating ${a.printedRating}` : ''].filter(Boolean).join(', ') })
  for (const i of items) out.get(ITEM_GROUP[i.kind])!.push({ ...ref(i), kind: 'items', name: i.name, text: i.text,
    detail: [i.dv && `DV ${i.dv}${i.ranges ? ` [${i.ranges}]` : ''}`, i.specialist && 'specialist', i.armor && `Armor ${i.armor}`, i.category].filter(Boolean).join(', ') })
  for (const v of vehicles) out.get('Vehicles')!.push({ ...ref(v), kind: 'vehicles', name: v.name, text: '',
    detail: `Body ${v.body}, Handling ${v.handling}, Speed ${v.speed}${v.flyingSpeed != null ? `, Flying ${v.flyingSpeed}` : ''}, Pilot ${v.pilot}, Armor ${v.armor}, mount ${v.mount}` })
  for (const n of npcs) out.get('NPCs')!.push({ key: n.id, npc: n, name: n.identity.streetName || n.identity.name || 'Unnamed NPC', text: '', detail: '' })
  for (const rows of out.values()) rows.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

type ListKey = 'amps' | 'items' | 'vehicles'
const listOf = (k: FormKind): ListKey => k === 'amps' ? 'amps' : k === 'items' ? 'items' : 'vehicles'

/** A book's (or another compendium's) entry as a new entry of `to`: a new id and its source, page 1, and no description:
 *  book text never enters a compendium (the GM writes their own). */
export function copyEntry(c: Catalog, kind: FormKind, e: Entry, to: Compendium): Entry {
  const l = listOf(kind), base = `${to.source.toLowerCase()}.${slug(nameOf(e))}`
  const taken = (id: string) => c[l].has(id) || (to[l] as Entry[]).some(x => x.id === id)
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  const { edited: _, ...rest } = e as Entry & { edited?: boolean }
  const out = { ...rest, id, source: to.source, page: 1 }
  return kind === 'amps' ? { ...out, narrative: '' } as AmpTemplate : kind === 'items' ? { ...out, text: '' } as Item : out as VehicleBase
}

/** "Copy to…" on a book's or a shared compendium's rows: into one of yours. */
function CopyDialog({ c, row, targets, onClose, done }: { c: Catalog; row: Row; targets: StoredCompendium[]; onClose: () => void; done: (msg: string) => Promise<void> }) {
  const [to, setTo] = useState(targets[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const copy = async () => {
    const comp = targets.find(x => x.id === to)!, l = listOf(row.kind!)
    setBusy(true); setErr('')
    const r = await saveCompendium({ ...comp, [l]: [...comp[l], copyEntry(c, row.kind!, row.entry!, comp)] }, comp.rev)
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

const CopyButton = ({ r, copy }: { r: Row; copy: (r: Row) => void }) =>
  <button className="btn small quiet" aria-label={`Copy ${r.name} to…`} onClick={() => copy(r)}>Copy to…</button>

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return <header><div style={{ flex: 1 }}><Brand /><h1>{title}</h1></div>
    <div className="row">{children}<a className="btn quiet" href="#/npcs">NPCs</a><a className="btn quiet" href="#/">Your runners</a>
      <AskButton /><SettingsButton /><AccountMenu /></div></header>
}

/** #/compendiums and #/compendiums/<id or book source id>[/<entry id>: its form open (a picker's Edit)]. reload: the catalog again (after a save). */
export function CompendiumsScreen({ c, id, edit, reload }: { c: Catalog; id?: string; edit?: string; reload: () => Promise<void> }) {
  const me = useMe()
  const [comps, setComps] = useState<StoredCompendium[] | null>(null)
  const [bad, setBad] = useState<string[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const refresh = () => listCompendiums().then(rows => { const p = parseRows(rows); setComps(p.comps); setBad(p.bad.map(b => `${b.row.ownerName}’s ${b.row.file}: ${b.error}`)) },
    e => { setMsg(because('Couldn’t load the compendiums', (e as Error).message)); setComps([]) })
  useEffect(() => { void refresh(); loadCampaigns().then(setCampaigns, () => setCampaigns([])) }, [])
  /** after a save: the list and the catalog (the pickers) both */
  const changed = async () => { await refresh(); await reload() }

  if (!comps) return <main className="lib"><Header title="Compendiums" /><p className="muted">Loading compendiums…</p></main>
  const mine = (x: StoredCompendium) => x.owner === me?.username
  if (id) {
    const comp = comps.find(x => x.id === id)
    const targets = comps.filter(mine)
    if (comp) return <CompendiumPage key={comp.id} c={c} comp={comp} own={mine(comp)} campaigns={campaigns} changed={changed} edit={edit} targets={targets} />
    const book = c.sources.get(id)
    if (book && !comps.some(x => x.source === id)) return <BookPage c={c} id={id} targets={targets} changed={changed} />
    return <main className="lib"><Header title="Compendiums" /><p className="banner">No such compendium. <a href="#/compendiums">All compendiums</a></p></main>
  }
  return <ListPage c={c} comps={comps} bad={bad} mine={mine} campaigns={campaigns} msg={msg} setMsg={setMsg} changed={changed} />
}

function ListPage({ c, comps, bad, mine, campaigns, msg, setMsg, changed }: { c: Catalog; comps: StoredCompendium[]; bad: string[]; mine: (x: StoredCompendium) => boolean
  campaigns: Campaign[]; msg: string | null; setMsg: (m: string | null) => void; changed: () => Promise<void> }) {
  const [details, setDetails] = useState<StoredCompendium | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<StoredCompendium | null>(null)
  const own = comps.filter(mine), shared = comps.filter(x => !mine(x))
  const compSources = new Set(comps.map(x => x.source))
  const books = [...c.sources.values()].filter(s => !compSources.has(s.id)).sort((a, b) => a.name.localeCompare(b.name))
  const count = (x: Compendium) => entries(x.amps.length + x.items.length + x.vehicles.length + x.npcs.length)
  const sharing = (x: Compendium) => x.sharing === 'campaign' ? `Shared with ${campaigns.find(k => k.id === x.campaign)?.name ?? 'a campaign'}’s GMs` : SHARING[x.sharing]

  return (
    <main className="lib">
      <Header title="Compendiums"><button className="btn primary" onClick={() => setDetails('new')}>New compendium</button></Header>
      <p className="muted">Your own amps, gear, spells, vehicles and NPCs, in collections you can share with a campaign’s GMs or the whole table. Their entries are house content (Non-canon) and show in your pickers. Books are listed as read-only compendiums.</p>
      {msg && <p className="banner" role="status">{msg}</p>}
      {bad.map(b => <p className="err" key={b}>Couldn’t open {b}</p>)}
      <section aria-label="Your compendiums">
        <h2>Your compendiums</h2>
        {own.length === 0 ? <p className="muted">None yet. Make one with New compendium.</p> : <div className="scroll-x"><table className="data"><tbody>
          {own.map(x => <tr key={x.id}>
            <td><a href={`#/compendiums/${x.id}`}>{x.name}</a> <span className="muted">{x.source}</span></td>
            <td>{sharing(x)}</td><td className="muted">{count(x)}</td>
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
            <td><a href={`#/compendiums/${x.id}`}>{x.name}</a> <span className="muted">{x.source}</span></td>
            <td>{x.ownerName}</td><td>{sharing(x)}</td><td className="muted">{count(x)}</td>
          </tr>)}
        </tbody></table></div>
      </section>}
      <section aria-label="Books">
        <h2>Books</h2>
        <div className="scroll-x"><table className="data"><tbody>
          {books.map(s => <tr key={s.id}>
            <td><a href={`#/compendiums/${s.id}`}>{s.name}</a> <span className="muted">{s.id}</span></td>
            <td>{s.publisher}</td><td>{s.canon ? 'Canon' : 'Non-canon'}</td>
          </tr>)}
        </tbody></table></div>
      </section>

      {details && <DetailsDialog c={c} comp={details === 'new' ? null : details} campaigns={campaigns} onClose={() => setDetails(null)}
        onSaved={async (x, made) => { setDetails(null); await changed(); if (made) location.hash = `#/compendiums/${x.id}`; else setMsg(`Saved ${x.name}.`) }} />}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title={`Delete ${toDelete?.name ?? 'this compendium'}?`}
        actions={<><button className="btn" onClick={() => setToDelete(null)}>Keep</button>
          <button className="btn danger" onClick={async () => {
            try { await deleteCompendium(toDelete!.id); setMsg(`Deleted ${toDelete!.name}.`) } catch (e) { setMsg(because('Couldn’t delete it', (e as Error).message)) }
            setToDelete(null); await changed() }}>Delete compendium</button></>}>
        <p>It moves to the server’s compendium trash, where only the admin can bring it back. Its entries leave the pickers; runners and NPCs that use one keep their copy.</p>
      </Modal>
    </main>
  )
}

/** New compendium (comp null), or an existing one's name and sharing (its source id is fixed). */
function DetailsDialog({ c, comp, campaigns, onClose, onSaved }: { c: Catalog; comp: StoredCompendium | null; campaigns: Campaign[]
  onClose: () => void; onSaved: (x: Compendium, made: boolean) => Promise<void> }) {
  const gmOf = campaigns.filter(x => x.you === 'gm' && !x.archived)
  const [name, setName] = useState(comp?.name ?? '')
  const [source, setSource] = useState(comp?.source ?? '')
  const [sharing, setSharing] = useState<Compendium['sharing']>(comp?.sharing ?? 'private')
  const [campaign, setCampaign] = useState(comp?.campaign ?? gmOf[0]?.id ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const idOk = !!comp || (SOURCE_ID.test(source) && !c.sources.has(source))
  const ok = !busy && !!name.trim() && idOk && (sharing !== 'campaign' || !!campaign)
  const save = async () => {
    setBusy(true); setErr('')
    const next: Compendium = comp ? { ...comp, name: name.trim(), sharing, campaign: sharing === 'campaign' ? campaign : undefined }
      : { id: hex12(), name: name.trim(), source, sharing, campaign: sharing === 'campaign' ? campaign : undefined, updatedAt: '', amps: [], items: [], vehicles: [], npcs: [] }
    const r = await saveCompendium(next, comp?.rev)
    if (r.ok) return onSaved(next, !comp)
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
        <label>Sharing<select value={sharing} onChange={e => setSharing(e.target.value as Compendium['sharing'])}>
          <option value="private">Private</option>
          {(gmOf.length > 0 || sharing === 'campaign') && <option value="campaign">A campaign’s GMs</option>}
          <option value="table">The whole table</option></select></label>
        {sharing === 'campaign' && <label>Campaign<select value={campaign} onChange={e => setCampaign(e.target.value)}>
          {gmOf.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
      </div>
      {!idOk && source && <p className="err" id="comp-src-err">{c.sources.has(source) ? `${source} is already a source; choose another id.`
        : 'A source id starts with a letter and uses only A–Z, 0–9 and hyphens.'}</p>}
      <p className="muted">{comp ? `Its entries cite ${comp.source}; that can’t change.` : 'Its entries cite this id (like a book’s), and it can’t be changed later.'}
        {' '}A campaign’s GMs or the whole table can read a shared compendium; only you can change it.</p>
      <div role="alert">{err && <p className="err">{err}</p>}</div>
    </Modal>
  )
}

function Entries({ c, rows, q, actions }: { c: Catalog; rows: Map<string, Row[]>; q: string; actions?: (r: Row) => React.ReactNode }) {
  const t = q.trim().toLowerCase()
  const shown = [...rows].map(([g, list]) => [g, list.filter(r => !t || r.name.toLowerCase().includes(t))] as const).filter(([, list]) => list.length)
  if (!shown.length) return <p className="muted">{t ? `No entry’s name contains “${q.trim()}”.` : 'No entries yet.'}</p>
  return <>{shown.map(([g, list]) => <section key={g} aria-label={g}>
    <h2>{g}</h2>
    {/* fixed columns: every group's table lines up with the others */}
    <div className="scroll-x"><table className="data fixed" style={{ minWidth: actions ? '44rem' : '35rem' }}><colgroup><col style={{ width: '32%' }} /><col /><col style={{ width: '11rem' }} />{actions && <col style={{ width: '9rem' }} />}</colgroup><tbody>
      {list.map(r => <tr key={r.key}>
        <td><b>{r.name}</b>{r.npc?.npc && <> <NpcChips npc={r.npc.npc} /></>}{r.detail && <div className="muted">{r.detail}</div>}</td>
        <td className="muted">{r.text}</td>
        <td>{r.source && <SourceLabel c={c} source={r.source} page={r.page ?? 1} />}</td>
        {actions && <td>{actions(r)}</td>}
      </tr>)}
    </tbody></table></div>
  </section>)}</>
}

function CompendiumPage({ c, comp, own, campaigns, changed, edit, targets }: { c: Catalog; comp: StoredCompendium; own: boolean; campaigns: Campaign[]
  changed: () => Promise<void>; edit?: string; targets: StoredCompendium[] }) {
  const npcs = npcRepoFor(useRepo())
  const [copying, setCopying] = useState<Row | null>(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ kind: FormKind; entry?: Entry } | null>(() => {
    const a = comp.amps.find(x => x.id === edit), i = comp.items.find(x => x.id === edit), v = comp.vehicles.find(x => x.id === edit)
    return !own ? null : a ? { kind: 'amps', entry: a } : i ? { kind: 'items', entry: i } : v ? { kind: 'vehicles', entry: v } : null
  })
  const [msg, setMsg] = useState('')
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(t) } }, [msg])
  const rows = groupRows(c, comp.amps, comp.items, comp.vehicles, comp.npcs)
  /** the compendium with `e` put in (or, with no e, `drop` taken out), saved; throws why it couldn't */
  const store = async (k: FormKind, e: Entry | null, drop?: string) => {
    const l = listOf(k), have = comp[l] as Entry[], id = e?.id ?? drop
    const next = e ? (have.some(x => x.id === id) ? have.map(x => x.id === id ? e : x) : [...have, e]) : have.filter(x => x.id !== id)
    const r = await saveCompendium({ ...comp, [l]: next }, comp.rev)
    if (!r.ok) throw new Error(r.conflict ? 'it changed elsewhere since this page loaded (reload the page)' : r.error)
  }
  // the entry form's save: the Description is the entry's own text
  const put = (k: FormKind) => (e: Entry, desc: string) => store(k, k === 'amps' ? { ...e, narrative: desc } as AmpTemplate : k === 'items' ? { ...e, text: desc } as Item : e)
  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.name} from ${comp.name}? Runners and NPCs that use it keep their copy.`)) return
    try { await store(r.kind!, null, r.key); await changed(); setMsg(`Deleted ${r.name}.`) } catch (e) { setMsg(because('Couldn’t delete it', (e as Error).message)) }
  }
  // out to the NPC area under a new id (the old one may still be in the NPC trash), then out of the compendium; a failed
  // compendium save takes the new NPC back out
  const moveOut = async (r: Row) => {
    const ch = { ...r.npc!, id: newId(), campaign: undefined }
    try {
      const put = await npcs.save(ch)
      if (!put.ok) throw new Error(put.error ?? 'the NPC area refused it')
      const s = await saveCompendium({ ...comp, npcs: comp.npcs.filter(n => n.id !== r.key) }, comp.rev)
      if (!s.ok) { await npcs.remove(ch.id).catch(() => {}); throw new Error(s.conflict ? 'it changed elsewhere since this page loaded (reload the page)' : s.error) }
      await changed(); setMsg(`Moved ${r.name} to your NPCs.`)
    } catch (e) { setMsg(because('Couldn’t move it', (e as Error).message)) }
  }
  const sharing = comp.sharing === 'campaign' ? `shared with ${campaigns.find(k => k.id === comp.campaign)?.name ?? 'a campaign'}’s GMs` : SHARING[comp.sharing].toLowerCase()
  const count = comp.amps.length + comp.items.length + comp.vehicles.length

  return (
    <main className="lib">
      <Header title={comp.name}><a className="btn quiet" href="#/compendiums">All compendiums</a></Header>
      <p className="muted">Source {comp.source} · {own ? 'yours' : `${comp.ownerName}’s, read only`} · {sharing} · {entries(count)}{comp.npcs.length ? `, ${comp.npcs.length} NPC${comp.npcs.length === 1 ? '' : 's'}` : ''}</p>
      {own && <div className="row">
        <button className="btn" onClick={() => setForm({ kind: 'amps' })}>Add an amp</button>
        <button className="btn" onClick={() => setForm({ kind: 'items' })}>Add an item</button>
        <button className="btn" onClick={() => setForm({ kind: 'vehicles' })}>Add a vehicle</button>
      </div>}
      <div className="row listtools"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search entries" /></div>
      <Entries c={c} rows={rows} q={q} actions={own ? r => r.kind ? <div className="row">
        <button className="btn small quiet" aria-label={`Edit ${r.name}`} onClick={() => setForm({ kind: r.kind!, entry: r.entry })}>Edit</button>
        <button className="btn small quiet" aria-label={`Delete ${r.name}`} onClick={() => void remove(r)}>Delete</button></div>
        : <button className="btn small quiet" aria-label={`Move ${r.name} to my NPCs`} onClick={() => void moveOut(r)}>Move to my NPCs</button>
        : targets.length ? r => r.kind && <CopyButton r={r} copy={setCopying} /> : undefined} />
      {copying && <CopyDialog c={c} row={copying} targets={targets} onClose={() => setCopying(null)} done={async m => { setCopying(null); await changed(); setMsg(m) }} />}
      <Modal open={!!form} onClose={() => setForm(null)} actions={<></>}
        title={form?.entry ? `Edit ${nameOf(form.entry)}` : form ? `Add ${form.kind === 'items' ? 'an' : 'a'} ${NOUN[form.kind]}` : ''}>
        {form && <EntryForm key={`${form.kind} ${form.entry?.id}`} c={c} kind={form.kind} entry={form.entry} sources={[compendiumSource(comp)]} save={put(form.kind)}
          onDone={async text => { await changed(); setForm(null); setMsg(text) }} onCancel={() => setForm(null)} />}
      </Modal>
      {msg && <p className="toast" role="status">{msg}</p>}
    </main>
  )
}

function BookPage({ c, id, targets, changed }: { c: Catalog; id: string; targets: StoredCompendium[]; changed: () => Promise<void> }) {
  const [q, setQ] = useState('')
  const [copying, setCopying] = useState<Row | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(t) } }, [msg])
  const s = c.sources.get(id)!
  const of = <T extends { source: string }>(m: Map<string, T>) => [...m.values()].filter(e => e.source === id)
  const rows = groupRows(c, of(c.amps), of(c.items), of(c.vehicles), [])
  return (
    <main className="lib">
      <Header title={s.name}><a className="btn quiet" href="#/compendiums">All compendiums</a></Header>
      <p className="muted">Book {id}{s.publisher ? ` · ${s.publisher}` : ''} · {s.canon ? 'canon' : 'non-canon'} · read only</p>
      <div className="row listtools"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search entries" /></div>
      <Entries c={c} rows={rows} q={q} actions={targets.length ? r => <CopyButton r={r} copy={setCopying} /> : undefined} />
      {copying && <CopyDialog c={c} row={copying} targets={targets} onClose={() => setCopying(null)} done={async m => { setCopying(null); await changed(); setMsg(m) }} />}
      {msg && <p className="toast" role="status">{msg}</p>}
    </main>
  )
}

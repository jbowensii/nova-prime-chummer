// NPCs & Critters (#/npcs): the GMs' own area (admin and editors; spec 2026-10-02 §1, §3). NPCs are characters with an
// npc block, kept apart from runners (server: /api/npcs; browser: their own localStorage key). A GM shares one with a
// campaign they run, so its other GMs can read and print it; players never see any. The server enforces all of it.
import { PageHeader } from './nav'
import { IconButton, IconLink } from './icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { blankNpc } from '../engine'
import type { Catalog, Character, Npc } from '../model/types'
import { newId } from '../model/types'
import { because, savesSettled, send, useMe } from './auth'
import { Modal, NPC_KINDS, NPC_TIERS, NpcChips } from './bits'
import { loadCampaigns, type Campaign } from './Campaigns'
import { listCompendiums, parseRows, saveCompendium, type StoredCompendium } from './compendiumStore'
import { editHref } from './editor'
import { downloadRunners, ExportRunnersDialog } from './Foundry'
import { arrange, exportCharacter, FindDuplicates, ownerGroups, type SortBy } from './Library'
import { Face } from './Portrait'
import { npcRepoFor, useRepo, type Stored, type Unreadable } from './repo'
import { bookNpcs, readCharacterFile, readSample } from './samples'
import { loadTrash } from './Trash'

const nameOf = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed NPC'

export function NpcsScreen({ c }: { c: Catalog }) {
  const runners = useRepo()
  const repo = useMemo(() => npcRepoFor(runners), [runners])
  const me = useMe()
  const [list, setList] = useState<Stored[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortBy>('az')
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<Npc['kind']>('npc')
  const [tier, setTier] = useState<Npc['tier']>('regular')
  const [meta, setMeta] = useState('human')
  const [sharing, setSharing] = useState<Character | null>(null)
  const [target, setTarget] = useState('')
  const [toDelete, setToDelete] = useState<Character | null>(null)
  const [foundry, setFoundry] = useState(false)
  const [trashed, setTrashed] = useState<number | null>(null) // server only
  const [comps, setComps] = useState<StoredCompendium[]>([]) // yours, where NPCs can move (server only)
  const [moving, setMoving] = useState<Set<string> | null>(null)
  const [into, setInto] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const refresh = () => {
    if (repo.mode === 'server') {
      loadCampaigns().then(setCampaigns, () => setCampaigns([]))
      loadTrash(undefined, true).then(t => setTrashed(t.items.length), () => setTrashed(null))
      listCompendiums().then(rows => setComps(parseRows(rows).comps.filter(x => x.owner === me?.username)), () => setComps([]))
    }
    // an NPC just left in the editor may still be sending its last change: list it as saved
    return savesSettled().then(() => repo.listAll()).then(r => { setList(r.stored); setUnreadable(r.unreadable) },
      e => { setMsg(because('Couldn’t load your NPCs', (e as Error).message ?? String(e))); setList([]) })
  }
  useEffect(() => { void refresh() }, [repo]) // eslint-disable-line react-hooks/exhaustive-deps

  const own = (s: { owner?: string }) => !me || !s.owner || s.owner === me.username
  const mine = (list ?? []).filter(own)
  const others = ownerGroups((list ?? []).filter(s => !own(s)), unreadable.filter(u => !own(u)), sort, q)
  const rows = arrange(mine, sort, q)
  const gmOf = campaigns.filter(x => x.you === 'gm' && !x.archived) // where an NPC of yours can be shared
  const campaignOf = (ch: Character) => campaigns.find(x => x.id === ch.campaign)

  const store = async (ch: Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    if (!r.ok) setMsg(r.error ?? `${nameOf(ch)} changed elsewhere; open it to sort it out.`)
    return r.ok
  }
  const create = async () => {
    const ch = blankNpc(kind, tier, meta)
    if (await store(ch)) location.hash = editHref(ch, 'concept')
  }
  // into one of your compendiums: saved there first (unshared), then deleted here (to the NPC trash); a failed save moves nothing
  const moveIn = async () => {
    const comp = comps.find(x => x.id === into)!, chs = mine.filter(s => moving!.has(s.ch.id)).map(s => ({ ...s.ch, campaign: undefined }))
    setMoving(null)
    const r = await saveCompendium({ ...comp, npcs: [...comp.npcs.filter(n => !moving!.has(n.id)), ...chs] }, comp.rev)
    if (!r.ok) { setMsg(because('Couldn’t move them', r.conflict ? `${comp.name} changed elsewhere; reload the page` : r.error ?? '')); return }
    const left: string[] = []
    for (const ch of chs) await repo.remove(ch.id).catch(() => left.push(nameOf(ch)))
    setMsg(`Moved ${chs.map(nameOf).join(', ')} to ${comp.name}.${left.length ? ` Couldn’t take ${left.join(', ')} out of your NPCs: delete ${left.length === 1 ? 'it' : 'them'} here.` : ''}`)
    void refresh()
  }
  const pickMove = (ids: string[]) => { setInto(comps[0]?.id ?? ''); setMoving(new Set(ids)) }
  const pickKind = (k: Npc['kind']) => { setKind(k); setMeta(k === 'npc' ? 'human' : '') }

  // an NPC file joins the area; a runner file (no npc block) is refused: it belongs on the runner list
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = [...files] // before the first await: the input is cleared right after this call, and its FileList with it
    const have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [], bad: string[] = []
    for (const f of picked) {
      const r = readCharacterFile(await f.text())
      if (!r.ok) { bad.push(`${f.name}: ${r.reason}`); continue }
      if (!r.character.npc) { bad.push(`${f.name}: this is a runner, not an NPC (it has no NPC block). Import it on Your runners.`); continue }
      // an NPC has no career: a finalized runner's ledger never comes along
      const ch = { ...r.character, id: have.has(r.character.id) ? newId() : r.character.id, campaign: undefined, finalizedAt: undefined,
        finalRemaining: undefined, carry: undefined, career: [], lastExportedAt: new Date().toISOString() }
      if (await store(ch)) { done.push(nameOf(ch)); have.add(ch.id) }
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }

  // the imported books' NPCs, copied (new ids) as example characters are; one already loaded (its book and name, kept on
  // the copy as sampleKey, so a renamed copy still counts) isn't loaded again
  const loadBook = async () => {
    try {
      const rows = await bookNpcs()
      if (!rows.length) return setMsg('No book NPCs yet: they come with an imported core rulebook.')
      const key = (source: string, name: string) => `${source}|${name}`
      const have = new Set(mine.map(s => s.ch.sampleKey ?? key(s.ch.origin ?? '', nameOf(s.ch))))
      let n = 0
      const bad: string[] = []
      for (const r of rows.filter(r => !have.has(key(r.source, r.name)))) {
        const got = await readSample(r.url)
        if (!got.ok) { bad.push(`${r.name || r.url.split('/').pop()}: ${got.reason}`); continue }
        const k = key(r.source, r.name)
        if (await store({ ...got.character, id: newId(), sampleKey: k, lastExportedAt: got.character.updatedAt })) { n++; have.add(k) }
      }
      setMsg([n ? `Added ${n} book NPC${n === 1 ? '' : 's'}.` : bad.length ? '' : 'The book NPCs are already in your NPCs.', ...bad].filter(Boolean).join(' '))
      void refresh()
    } catch (e) {
      setMsg(because('Couldn’t load the book NPCs', (e as Error).message ?? String(e)))
    }
  }

  const share = async (ch: Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch)
      await send(cid ? `campaigns/${cid}/npcs` : `campaigns/${ch.campaign}/npcs/${encodeURIComponent(ch.id)}`, cid ? { id: ch.id } : undefined, cid ? 'POST' : 'DELETE')
      setMsg(cid ? `${nameOf(ch)} is shared with ${x?.name}.` : `${nameOf(ch)} is no longer shared with ${x?.name ?? 'its campaign'}.`)
    } catch (e) { setMsg((e as Error).message) }
    setSharing(null)
    void refresh()
  }

  const row = ({ ch, rev }: Stored, mineToo: boolean) => (
    <div className="dossier" key={ch.id}>
      <Face ch={ch} />
      <div>
        <a className="title" href={editHref(ch, 'concept')}>{nameOf(ch)}</a>
        <div className="meta">
          {ch.npc && <NpcChips npc={ch.npc} />}
          {' '}{c.metatypes.get(ch.identity.metatype)?.name ?? (ch.identity.metatype || (ch.npc ? NPC_KINDS[ch.npc.kind] : ''))}
          {campaignOf(ch) && <> <a className="ctag" href={`#/campaigns/${ch.campaign}`} title="Shared with this campaign">{campaignOf(ch)!.name}</a></>}
        </div>
      </div>
      <div className="row">
        {!mineToo && <a className="btn small" href={editHref(ch, 'print')} aria-label={`Print ${nameOf(ch)}`}>Print</a>}
        <button className="btn small" aria-label={`Export ${nameOf(ch)}`}
          onClick={async () => { const out = exportCharacter(c, ch); if (mineToo) { await store(out, rev); void refresh() } }}>Export</button>
        <button className="btn small quiet" aria-label={`Export ${nameOf(ch)} for Foundry`} onClick={() => downloadRunners(c, [ch])}>Export for Foundry</button>
        {mineToo && repo.mode === 'server' && (ch.campaign
          ? <button className="btn small quiet" aria-label={`Unshare ${nameOf(ch)}`} onClick={() => void share(ch, null)}>Unshare</button>
          : gmOf.length > 0 && <button className="btn small quiet" aria-label={`Share ${nameOf(ch)}…`} onClick={() => { setTarget(gmOf[0].id); setSharing(ch) }}>Share with campaign…</button>)}
        {mineToo && comps.length > 0 && <button className="btn small quiet" aria-label={`Move ${nameOf(ch)} to a compendium…`} onClick={() => pickMove([ch.id])}>Move to compendium…</button>}
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

  return (
    <main className="lib">
      <PageHeader title="NPCs & Critters">
        <IconButton className="primary" icon="npc-add" label="New NPC" onClick={() => setCreating(true)} />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} />
        <IconButton icon="book" label="Load book NPCs" onClick={() => void loadBook()} />
        <input ref={file} type="file" accept=".xml,.json,application/xml,application/json" multiple hidden onChange={e => { void importFiles(e.target.files); e.target.value = '' }} />
        <IconButton icon="foundry" label="Export for Foundry…" onClick={() => setFoundry(true)} disabled={!list?.length} />
        {comps.length > 0 && <IconButton icon="move" label="Move to compendium…" onClick={() => pickMove([])} disabled={!mine.length} />}
        {repo.mode === 'server' && <FindDuplicates rows={mine} noun="NPCs" remove={repo.remove} done={m => { setMsg(m); void refresh() }}
          chips={ch => <>{ch.npc && <NpcChips npc={ch.npc} />}{campaignOf(ch) && <> <span className="ctag">{campaignOf(ch)!.name}</span></>}</>} />}
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/npcs/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">Your NPCs, critters and spirits, for GMs only: players never see them. Share one with a campaign you run and its other GMs can read and print it.
        {repo.mode === 'browser' && ' Saved on this browser. Export files to keep them safe.'}</p>
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
          <label>Kind<select value={kind} onChange={e => pickKind(e.target.value as Npc['kind'])}>
            {Object.entries(NPC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Tier<select value={tier} onChange={e => setTier(e.target.value as Npc['tier'])}>
            {Object.entries(NPC_TIERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Metatype<select value={meta} onChange={e => setMeta(e.target.value)}>
            {kind !== 'npc' && <option value="">— none ({kind}) —</option>}
            {[...c.metatypes.values()].map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        </div>
        <p className="muted" style={{ marginTop: '0.8rem' }}>A prime NPC is run like a runner, with Edge; a regular one rolls average hits (CRB p.81). All of it can be changed later on the Concept tab.</p>
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
        <p>{repo.mode === 'server' ? 'It moves to your NPC trash on the server.' : 'This removes the NPC from this browser. Exported files are not affected.'}</p>
      </Modal>

      <Modal open={!!moving} onClose={() => setMoving(null)} title="Move NPCs to a compendium"
        actions={<><button className="btn" onClick={() => setMoving(null)}>Cancel</button>
          <button className="btn primary" disabled={!moving?.size || !into} onClick={() => void moveIn()}>Move</button></>}>
        <label>Compendium<select value={into} onChange={e => setInto(e.target.value)}>
          {comps.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <fieldset><legend>NPCs</legend>{mine.map(({ ch }) => <label className="check" key={ch.id}><input type="checkbox" checked={!!moving?.has(ch.id)}
          onChange={e => { const s = new Set(moving); if (e.target.checked) s.add(ch.id); else s.delete(ch.id); setMoving(s) }} />{nameOf(ch)}</label>)}</fieldset>
        <p className="muted" style={{ marginTop: '0.8rem' }}>They leave your NPCs (to the NPC trash) and any campaign they’re shared with. Move one back out on the compendium’s page to edit it.</p>
      </Modal>

      <ExportRunnersDialog c={c} runners={(list ?? []).map(s => s.ch)} campaigns={campaigns} open={foundry} onClose={() => setFoundry(false)} noun="NPC" />
    </main>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { appendEvent, balance, derive, logChange, price, rescope, settle as settleLedger, syncRealSin, validate, type TableFlags } from '../engine'
import { loadTableRules, tableFlags } from './TableRules'
import type { CareerEvent, Catalog, Character } from '../model/types'
import { AccountMenu, session, track, useMe } from './auth'
import { Brand, fmt, Modal, NpcChips, StateBadge } from './bits'
import { Editor, editHref, homeHref, type EditorCtx } from './editor'
import { exportCharacter } from './Library'
import { downloadRunners } from './Foundry'
import { useRepo } from './repo'
import { newId } from '../model/types'
import { Receipt } from './Receipt'
import { loadSettings, SettingsButton } from './settings'
import { AmpsTab } from './tabs/Amps'
import { AttributesTab } from './tabs/Attributes'
import { ConceptTab } from './tabs/Concept'
import { GearTab } from './tabs/Gear'
import { LedgerTab } from './tabs/Ledger'
import { ReviewTab } from './tabs/Review'
import { SkillsTab } from './tabs/Skills'
import { Sheet } from '../print/Sheet'
import { BookSheet } from '../print/BookSheet'
import { AskButton, AskRules } from './AskRules'
import { Face } from './Portrait'

const TABS: [string, string][] = [['concept', 'Concept'], ['attributes', 'Attributes'], ['skills', 'Skills'], ['amps', 'Shadow Amps'],
  ['gear', 'Gear & spells'], ['review', 'Review'], ['ledger', 'Ledger'], ['print', 'Print']]

type SaveStatus = { state: 'saved'; at?: string } | { state: 'saving' } | { state: 'failed'; error: string } | { state: 'conflict' }

function SaveLine({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className={`save-status ${status.state}`} role="status" aria-label="Save status">
      {status.state === 'saving' && 'Saving…'}
      {status.state === 'saved' && `All changes saved${status.at ? ` · ${new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
      {status.state === 'conflict' && 'Not saved — changed in another browser; choose which version to keep.'}
      {status.state === 'failed' && <>Not saved — {status.error} <button className="btn small" onClick={onRetry}>Retry</button></>}
    </span>
  )
}

interface Pending { ev: CareerEvent; summary: string; cost: number; after: number; resolve: (ok: boolean) => void }

export function EditorView({ c, id, tab }: { c: Catalog; id: string; tab: string }) {
  const repo = useRepo()
  const me = useMe()
  // someone else's runner (admin and editors can open everyone's): read-only, their name on the bar
  const [owner, setOwner] = useState<string | null>(null)
  const [ch, setCh] = useState<Character | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const hist = useRef<{ past: Character[]; future: Character[] }>({ past: [], future: [] })
  const [, bump] = useState(0)
  // what the bar says: saved (when), saving, or failed (the server's reason, with Retry)
  const [status, setStatus] = useState<SaveStatus>({ state: 'saved' })
  const [pending, setPending] = useState<Pending | null>(null)
  const [conflict, setConflict] = useState<{ rev: number; file: string; updatedAt?: string } | null>(null)
  const [copyName, setCopyName] = useState('')
  // saving: one request at a time; the latest unsaved state follows when it finishes
  const sync = useRef({ rev: undefined as number | undefined, loaded: undefined as Character | undefined, saved: undefined as Character | undefined,
    latest: undefined as Character | undefined, busy: false, queued: undefined as Character | undefined, paused: false,
    run: Promise.resolve(), failed: false })
  /** changed since it was loaded or last saved, or the last save failed: worth a warning before the page goes */
  const unsaved = () => { const st = sync.current; return st.failed || (!!st.latest && st.latest !== st.loaded && st.latest !== st.saved) }

  // fetched once per runner: a catalog reload (a catalog edit saved) must not replace unsaved or conflicted state
  const cat = useRef(c)
  cat.current = c
  useEffect(() => {
    repo.get(id).then(s => {
      sync.current.rev = s?.rev
      sync.current.loaded = s?.ch
      const theirs = !!(me && s?.owner && s.owner !== me.username)
      sync.current.paused = theirs // never saved
      setOwner(theirs ? s!.ownerName ?? s!.owner! : null)
      // old runners can reference unscoped catalog ids; remap them, saved normally when they change. A runner finalized
      // before 0.5.5 gets its ledger settled (engine/career.ts settle), saved with the next change.
      setCh(s && settleLedger(cat.current, rescope(cat.current, s.ch)))
      if (s) setStatus({ state: 'saved', at: s.ch.updatedAt })
      setLoaded(true)
    }, e => { setLoadError((e as Error).message ?? String(e)); setLoaded(true) })
  }, [repo, id])
  useEffect(() => setCh(x => x && rescope(c, x)), [c]) // same object when nothing needs remapping

  // the returned promise covers the queued follow-up too; sign-out waits for it (auth.tsx track)
  const persist = (next: Character, keepalive = false): Promise<void> => {
    const st = sync.current
    if (st.paused || session.held || next === st.saved) return st.busy ? st.run : Promise.resolve()
    if (st.busy) { st.queued = next; return st.run }
    st.busy = true
    setStatus({ state: 'saving' })
    return st.run = track((async () => {
      const r = await repo.save(next, st.rev, { keepalive })
      st.busy = false
      st.failed = !r.ok && !r.conflict
      if (r.ok) { st.rev = r.rev; st.saved = next; setStatus({ state: 'saved', at: new Date().toISOString() }) }
      else if (r.conflict) { st.paused = true; setStatus({ state: 'conflict' }); setCopyName(`${next.identity.streetName || next.identity.name || 'runner'} copy`); setConflict(r.conflict) }
      else setStatus({ state: 'failed', error: session.held ? 'Signed out. Sign back in and it’s sent.' : r.error ?? 'Saving failed.' })
      const q = st.queued
      st.queued = undefined
      if (q && !st.paused) await persist(q)
    })())
  }
  /** Save now: the latest state, through the same path as the autosave. True when everything is saved. */
  const saveNow = async () => {
    const st = sync.current
    if (st.latest && st.latest !== st.loaded) await persist(st.latest)
    await st.run
    return !unsaved()
  }
  const saveAndClose = async () => { if (await saveNow()) location.hash = homeHref(sync.current.loaded) }

  useEffect(() => {
    sync.current.latest = ch
    if (!ch || ch === sync.current.loaded) return
    const t = setTimeout(() => void persist(ch), 400)
    return () => clearTimeout(t)
  }, [ch]) // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the editor (another runner, the library, closing the tab) must not drop the last change.
  useEffect(() => {
    const flush = () => {
      const st = sync.current
      if (st.latest && st.latest !== st.loaded && st.latest !== st.saved) void persist(st.latest, true)
    }
    addEventListener('pagehide', flush)
    addEventListener('ca2-signed-in', flush) // the same account signed back in after the session ended: send what didn't save
    addEventListener('ca2-leaving', flush) // signing out: send it before the session ends
    // closing or reloading the tab while a change is unsent or failed: the browser asks first
    const warn = (e: BeforeUnloadEvent) => { if (unsaved() && !sync.current.paused) e.preventDefault() }
    // a link out of this runner: send the change first; if it can't be saved, ask before leaving it behind
    const leave = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!a || e.defaultPrevented || /^#\/[cn]\//.test(a.getAttribute('href')!) && a.getAttribute('href')!.slice(4).startsWith(`${id}/`) || !unsaved() || sync.current.paused) return
      e.preventDefault()
      const to = a.getAttribute('href')!
      void saveNow().then(ok => {
        if (ok || confirm('This runner’s latest changes aren’t saved. Leave anyway and lose them?')) location.hash = to
      })
    }
    addEventListener('beforeunload', warn)
    document.addEventListener('click', leave, true)
    return () => {
      for (const e of ['pagehide', 'ca2-signed-in', 'ca2-leaving']) removeEventListener(e, flush)
      removeEventListener('beforeunload', warn)
      document.removeEventListener('click', leave, true)
      flush()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resolveConflict = async (how: 'overwrite' | 'copy' | 'reload') => {
    if (!ch) return
    if (how === 'overwrite') {
      const r = await repo.save(ch, undefined, { force: true })
      if (r.ok) { sync.current.rev = r.rev; sync.current.saved = ch; sync.current.failed = false; setStatus({ state: 'saved', at: new Date().toISOString() }) }
      else setStatus({ state: 'failed', error: r.error ?? 'Saving failed.' })
    } else if (how === 'copy') {
      const copy = { ...ch, id: newId(), campaign: undefined, identity: { ...ch.identity, streetName: copyName.trim() || `${ch.identity.streetName} copy` } }
      const r = await repo.save(copy, undefined, { filename: copyName.trim() })
      if (r.ok) location.hash = editHref(copy, tab)
    } else {
      const s = await repo.get(ch.id)
      sync.current.rev = s?.rev; sync.current.loaded = s?.ch
      setCh(s && settleLedger(c, rescope(c, s.ch)))
      setStatus({ state: 'saved', at: s?.ch.updatedAt })
    }
    sync.current.paused = false
    setConflict(null)
  }

  const [table, setTable] = useState<TableFlags>()
  useEffect(() => { void loadTableRules().then(r => setTable(tableFlags(r))) }, [])
  const calc = useMemo(() => ch && ({ d: derive(c, ch), v: validate(c, ch, table), p: price(c, ch), bal: ch.finalizedAt ? balance(c, ch) : price(c, ch).remaining }), [c, ch, table])

  const npcRoute = location.hash.startsWith('#/n/')
  const noun = npcRoute ? 'NPC' : 'runner', back = npcRoute ? <a href="#/npcs">Back to NPCs &amp; Critters</a> : <a href="#/">Back to your runners</a>
  if (!loaded) return <main className="lib"><p className="muted">Loading {noun}…</p></main>
  if (loadError) return <main className="lib"><h1>Couldn’t open this {noun}</h1><p className="err">{loadError}</p>
    <p>{back}, where you can download its file or try to repair it.</p></main>
  if (!ch || !calc) return <main className="lib"><h1>{npcRoute ? 'NPC' : 'Runner'} not found</h1><p>It may have been deleted{repo.mode === 'server' ? ' on the server' : ' from this browser'}. {back}</p></main>

  const career = !!ch.finalizedAt
  // a finalized runner's build changes go in the ledger by themselves (engine/career.ts logChange); undo takes them back
  // out, except past recorded earnings (not undoable: history before them is dropped)
  const commit = (next: Character, undoable: boolean) => {
    hist.current.past = undoable ? [...hist.current.past.slice(-99), ch] : []
    hist.current.future = []
    setCh({ ...logChange(c, ch, next), updatedAt: new Date().toISOString() })
  }
  const mutate = (fn: (d: Character) => void) => { const d = structuredClone(ch); fn(d); syncRealSin(c, d.build); return d }

  const ro = owner !== null
  const ctx: EditorCtx = {
    c, ch, d: calc.d, v: calc.v, p: calc.p, balance: calc.bal, career,
    edit: fn => { if (!ro) commit(mutate(fn), true) },
    update: fn => { if (!ro) commit(mutate(fn), true) },
    record: (ev, summary) => ro ? Promise.resolve(false) : new Promise<boolean>(resolve => {
      const cost = ev.type === 'earn' ? -ev.amount : 'cost' in ev ? ev.cost : 0
      setPending({ ev, summary, cost, after: calc.bal - cost, resolve })
    }),
    replace: next => { if (!ro) commit(next, true) },
    undo: () => { const prev = hist.current.past.pop(); if (prev) { hist.current.future.push(ch); setCh(prev); bump(n => n + 1) } },
    redo: () => { const next = hist.current.future.pop(); if (next) { hist.current.past.push(ch); setCh(next); bump(n => n + 1) } },
    canUndo: hist.current.past.length > 0,
    canRedo: hist.current.future.length > 0,
  }
  const settle = (ok: boolean) => {
    if (pending) {
      if (ok) commit(appendEvent(ch, pending.ev), false)
      pending.resolve(ok)
    }
    setPending(null)
  }

  const errors = calc.v.filter(x => x.severity === 'error' && !x.approved).length
  const npc = !!ch.npc
  const name = ch.identity.streetName || ch.identity.name || (npc ? 'Unnamed NPC' : 'Unnamed runner')
  // an NPC has no budget, Finalize or career: no ledger tab and no receipt
  const tabs = TABS.filter(([k]) => k !== 'ledger' || (career && !npc))

  if (tab === 'print') return <Editor.Provider value={ctx}>{loadSettings().print === 'book' ? <BookSheet /> : <Sheet />}</Editor.Provider>

  return (
    <Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">{ch.identity.portrait && <Face ch={ch} />}<span className="name">{name}</span>{ch.npc ? <NpcChips npc={ch.npc} /> : <StateBadge finalized={career} />}</div>
        {!ro && <div className="savebar">
          <SaveLine status={status} onRetry={() => void saveNow()} />
          <button className="btn quiet" onClick={() => void saveNow()} disabled={status.state === 'saving'}>Save</button>
          <button className="btn quiet" onClick={() => void saveAndClose()}>Save and close</button>
        </div>}
        <span className="spacer" />
        {!ro && <>
          <button className="btn quiet" disabled={!ctx.canUndo} onClick={ctx.undo}>Undo</button>
          <button className="btn quiet" disabled={!ctx.canRedo} onClick={ctx.redo}>Redo</button>
        </>}
        <AskButton />
        <SettingsButton />
        <AccountMenu />
        <button className="btn" onClick={() => ro ? exportCharacter(c, ch) : setCh(exportCharacter(c, ch))}>Export file</button>
        <button className="btn quiet" onClick={() => downloadRunners(c, [ch])}>Export for Foundry</button>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a key={k} href={editHref(ch, k)} aria-current={tab === k ? 'page' : undefined}>
            {label}{k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {ro && <p className="banner readonly" role="status">Read only — {owner}’s {npc ? 'NPC' : 'runner'}. Only they can change it; you can still
        {' '}<a href={editHref(ch, 'print')}>print it</a> or export a copy.</p>}
      <div className="layout">
        <div className="chapter-tab" aria-hidden>{TABS.find(([k]) => k === tab)?.[1]}</div>
        <main className="work"><AskRules /><fieldset className="bare" disabled={ro}>
          {tab === 'concept' && <ConceptTab />}
          {tab === 'attributes' && <AttributesTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'amps' && <AmpsTab />}
          {tab === 'gear' && <GearTab />}
          {tab === 'review' && <ReviewTab />}
          {tab === 'ledger' && <LedgerTab />}
        </fieldset></main>
        {!npc && <Receipt />}
      </div>
      <Modal open={!!conflict} onClose={() => void resolveConflict('reload')} title="Saved elsewhere"
        actions={<>
          <button className="btn" onClick={() => void resolveConflict('reload')}>Discard mine, load theirs</button>
          <button className="btn" onClick={() => void resolveConflict('copy')}>Save mine as a new file</button>
          <button className="btn primary" onClick={() => void resolveConflict('overwrite')}>Overwrite with mine</button>
        </>}>
        {conflict && <div className="stack">
          <p>{name} was saved on the server from another browser{conflict.updatedAt ? ` (${new Date(conflict.updatedAt).toLocaleString()})` : ''}, after you opened it. File: <code>{conflict.file}</code>.</p>
          <label>File name if you save yours as a new file<input value={copyName} onChange={e => setCopyName(e.target.value)} /></label>
        </div>}
      </Modal>
      <Modal open={!!pending} onClose={() => settle(false)} title="Confirm"
        actions={<><button className="btn" onClick={() => settle(false)}>Cancel</button><button className="btn primary" onClick={() => settle(true)}>Record it</button></>}>
        {pending && <div className="stack">
          <p>{pending.summary}</p>
          <div>
            <div className="line"><span className="lbl">{pending.cost < 0 ? 'Earned' : 'Cost'}</span><span className="lead" /><span className="amt num">{fmt(Math.abs(pending.cost))}</span></div>
            <div className={`line${pending.after < 0 ? ' neg' : ''}`}><span className="lbl">Balance after</span><span className="lead" /><span className="amt num">{fmt(pending.after)}</span></div>
          </div>
          {pending.after < 0 && <p className="err">That puts the balance below zero. You can still record it; it shows as a problem on Review.</p>}
        </div>}
      </Modal>
    </Editor.Provider>
  )
}

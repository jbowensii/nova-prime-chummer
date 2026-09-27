import { useEffect, useMemo, useRef, useState } from 'react'
import { appendEvent, balance, derive, price, validate } from '../engine'
import type { CareerEvent, Catalog, Character } from '../model/types'
import { fmt, Modal } from './bits'
import { Editor, type EditorCtx } from './editor'
import { exportCharacter } from './Library'
import { useRepo } from './repo'
import { newId } from '../model/types'
import { Receipt } from './Receipt'
import { SettingsButton } from './settings'
import { AmpsTab } from './tabs/Amps'
import { AttributesTab } from './tabs/Attributes'
import { ConceptTab } from './tabs/Concept'
import { GearTab } from './tabs/Gear'
import { LedgerTab } from './tabs/Ledger'
import { ReviewTab } from './tabs/Review'
import { SkillsTab } from './tabs/Skills'
import { Sheet } from '../print/Sheet'

const TABS: [string, string][] = [['concept', 'Concept'], ['attributes', 'Attributes'], ['skills', 'Skills'], ['amps', 'Shadow Amps'],
  ['gear', 'Gear & spells'], ['review', 'Review'], ['ledger', 'Ledger'], ['print', 'Print']]

interface Pending { ev: CareerEvent; summary: string; cost: number; after: number; resolve: (ok: boolean) => void }

export function EditorView({ c, id, tab }: { c: Catalog; id: string; tab: string }) {
  const repo = useRepo()
  const [ch, setCh] = useState<Character | undefined>()
  const [loaded, setLoaded] = useState(false)
  const hist = useRef<{ past: Character[]; future: Character[] }>({ past: [], future: [] })
  const [, bump] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [conflict, setConflict] = useState<{ rev: number; file: string; updatedAt?: string } | null>(null)
  const [copyName, setCopyName] = useState('')
  // saving: one request at a time; the latest unsaved state follows when it finishes
  const sync = useRef({ rev: undefined as number | undefined, loaded: undefined as Character | undefined, saved: undefined as Character | undefined,
    latest: undefined as Character | undefined, busy: false, queued: undefined as Character | undefined, paused: false })

  useEffect(() => {
    repo.get(id).then(s => { sync.current.rev = s?.rev; sync.current.loaded = s?.ch; setCh(s?.ch); setLoaded(true) },
      e => { setSaveError(String(e)); setLoaded(true) })
  }, [repo, id])

  const persist = async (next: Character, keepalive = false) => {
    const st = sync.current
    if (st.paused || next === st.saved) return
    if (st.busy) { st.queued = next; return }
    st.busy = true
    const r = await repo.save(next, st.rev, { keepalive })
    st.busy = false
    if (r.ok) { st.rev = r.rev; st.saved = next; setSaveError(null) }
    else if (r.conflict) { st.paused = true; setCopyName(`${next.identity.streetName || next.identity.name || 'runner'} copy`); setConflict(r.conflict) }
    else setSaveError(r.error ?? 'Saving failed.')
    const q = st.queued
    st.queued = undefined
    if (q && !st.paused) void persist(q)
  }

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
    return () => { removeEventListener('pagehide', flush); flush() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resolveConflict = async (how: 'overwrite' | 'copy' | 'reload') => {
    if (!ch) return
    if (how === 'overwrite') {
      const r = await repo.save(ch, undefined, { force: true })
      if (r.ok) sync.current.rev = r.rev
    } else if (how === 'copy') {
      const copy = { ...ch, id: newId(), identity: { ...ch.identity, streetName: copyName.trim() || `${ch.identity.streetName} copy` } }
      const r = await repo.save(copy, undefined, { filename: copyName.trim() })
      if (r.ok) location.hash = `#/c/${copy.id}/${tab}`
    } else {
      const s = await repo.get(ch.id)
      sync.current.rev = s?.rev; sync.current.loaded = s?.ch
      setCh(s?.ch)
    }
    sync.current.paused = false
    setConflict(null)
  }

  const calc = useMemo(() => ch && ({ d: derive(c, ch), v: validate(c, ch), p: price(c, ch), bal: ch.finalizedAt ? balance(c, ch) : price(c, ch).remaining }), [c, ch])

  if (!loaded) return <main className="lib"><p className="muted">Loading runner…</p></main>
  if (!ch || !calc) return <main className="lib"><h1>Runner not found</h1><p>It may have been deleted{repo.mode === 'server' ? ' on tower04' : ' from this browser'}. <a href="#/">Back to your runners</a></p></main>

  const career = !!ch.finalizedAt
  const commit = (next: Character, undoable: boolean) => {
    if (undoable) {
      hist.current.past = [...hist.current.past.slice(-99), ch]
      hist.current.future = []
    }
    setCh({ ...next, updatedAt: new Date().toISOString() })
  }
  const mutate = (fn: (d: Character) => void) => { const d = structuredClone(ch); fn(d); return d }

  const ctx: EditorCtx = {
    c, ch, d: calc.d, v: calc.v, p: calc.p, balance: calc.bal, career,
    edit: fn => { if (!career) commit(mutate(fn), true) },
    update: fn => commit(mutate(fn), !career),
    record: (ev, summary) => new Promise<boolean>(resolve => {
      const cost = ev.type === 'earn' ? -ev.amount : 'cost' in ev ? ev.cost : 0
      setPending({ ev, summary, cost, after: calc.bal - cost, resolve })
    }),
    replace: next => commit(next, true),
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
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed runner'
  const tabs = TABS.filter(([k]) => k !== 'ledger' || career)

  if (tab === 'print') return <Editor.Provider value={ctx}><Sheet /></Editor.Provider>

  return (
    <Editor.Provider value={ctx}>
      <header className="topbar">
        <a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a>
        <div className="who"><span className="name">{name}</span><span className={`mode ${career ? 'career' : 'creation'}`}>{career ? 'Career' : 'Creation'}</span></div>
        <span className="spacer" />
        {!career && <>
          <button className="btn quiet" disabled={!ctx.canUndo} onClick={ctx.undo}>Undo</button>
          <button className="btn quiet" disabled={!ctx.canRedo} onClick={ctx.redo}>Redo</button>
        </>}
        <SettingsButton />
        <button className="btn" onClick={() => setCh(exportCharacter(c, ch))}>Export file</button>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a key={k} href={`#/c/${ch.id}/${k}`} aria-current={tab === k ? 'page' : undefined}>
            {label}{k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {saveError && <p className="banner" style={{ margin: '1rem 1.25rem 0' }}>{saveError} Changes are kept in this tab; use Export file if you need to close it.</p>}
      <div className="layout">
        <div className="chapter-tab" aria-hidden>{TABS.find(([k]) => k === tab)?.[1]}</div>
        <main className="work">
          {tab === 'concept' && <ConceptTab />}
          {tab === 'attributes' && <AttributesTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'amps' && <AmpsTab />}
          {tab === 'gear' && <GearTab />}
          {tab === 'review' && <ReviewTab />}
          {tab === 'ledger' && <LedgerTab />}
        </main>
        <Receipt />
      </div>
      <Modal open={!!conflict} onClose={() => void resolveConflict('reload')} title="Saved elsewhere"
        actions={<>
          <button className="btn" onClick={() => void resolveConflict('reload')}>Discard mine, load theirs</button>
          <button className="btn" onClick={() => void resolveConflict('copy')}>Save mine as a new file</button>
          <button className="btn primary" onClick={() => void resolveConflict('overwrite')}>Overwrite with mine</button>
        </>}>
        {conflict && <div className="stack">
          <p>{name} was saved on tower04 from another browser{conflict.updatedAt ? ` (${new Date(conflict.updatedAt).toLocaleString()})` : ''}, after you opened it. File: <code>{conflict.file}</code>.</p>
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

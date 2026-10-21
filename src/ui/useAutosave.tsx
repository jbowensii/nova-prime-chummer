// The editor's saving, shared by both games (moved out of EditorView): load once, autosave 400 ms after a change (one
// request at a time, the latest state queued), flush on leave (keepalive), ask before a link drops an unsaved change,
// the "Saved elsewhere" conflict, and undo/redo.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { newId } from '../model/types'
import { session, track, useMe } from '../core/ui-kit/auth'
import { Modal } from '../core/ui-kit/bits'
import type { Repo } from '../core/ui-kit/repoContext'

export type SaveStatus = { state: 'saved'; at?: string } | { state: 'saving' } | { state: 'failed'; error: string } | { state: 'conflict' }
export type Conflict = { rev: number; file: string; updatedAt?: string }
type Doc = { id: string; updatedAt: string; identity: { name: string; streetName: string } }

export interface AutosaveOpts<T> {
  /** 'runner' or 'NPC': the copy's fallback name and the leave question */
  noun: string
  /** what's done to a loaded (or reloaded) doc before it's edited; a change it makes is saved with the next edit */
  prepare: (loaded: T) => T
  editHref: (doc: T, tab: string) => string
  /** Save and close goes here */
  home: (doc?: T) => string
  tab: string
  /** a link to this same doc (another tab of it): no save-before-leaving */
  inEditor: (href: string) => boolean
}

export function useAutosave<T extends Doc>(repo: Repo<T>, id: string, o: AutosaveOpts<T>) {
  const me = useMe()
  // the latest options and account, for the handlers and the load's callback (kept current after each render)
  const opt = useRef(o),
    meNow = useRef(me)
  useLayoutEffect(() => {
    opt.current = o
    meNow.current = me
  })
  // someone else's runner (admin and editors can open everyone's): read-only, their name on the bar
  const [owner, setOwner] = useState<string | null>(null)
  const [doc, setDoc] = useState<T | undefined>()
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const hist = useRef<{ past: T[]; future: T[] }>({ past: [], future: [] })
  const [can, setCan] = useState({ undo: false, redo: false }) // hist's state, for the render
  // what the bar says: saved (when), saving, or failed (the server's reason, with Retry)
  const [status, setStatus] = useState<SaveStatus>({ state: 'saved' })
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [copyName, setCopyName] = useState('')
  // saving: one request at a time; the latest unsaved state follows when it finishes
  const sync = useRef({
    rev: undefined as number | undefined,
    loaded: undefined as T | undefined,
    saved: undefined as T | undefined,
    latest: undefined as T | undefined,
    busy: false,
    queued: undefined as T | undefined,
    paused: false,
    run: Promise.resolve(),
    failed: false,
  })
  /** changed since it was loaded or last saved, or the last save failed: worth a warning before the page goes */
  const unsaved = () => {
    const st = sync.current
    return st.failed || (!!st.latest && st.latest !== st.loaded && st.latest !== st.saved)
  }

  // fetched once per doc: a catalog reload (a catalog edit saved) must not replace unsaved or conflicted state
  useEffect(() => {
    repo.get(id).then(
      s => {
        sync.current.rev = s?.rev
        sync.current.loaded = s?.ch
        const me = meNow.current,
          theirs = !!(me && s?.owner && s.owner !== me.username)
        sync.current.paused = theirs // never saved
        setOwner(theirs ? (s!.ownerName ?? s!.owner!) : null)
        setDoc(s && opt.current.prepare(s.ch))
        if (s) setStatus({ state: 'saved', at: s.ch.updatedAt })
        setLoaded(true)
      },
      e => {
        setLoadError((e as Error).message ?? String(e))
        setLoaded(true)
      },
    )
  }, [repo, id])

  // the returned promise covers the queued follow-up too; sign-out waits for it (auth.tsx track)
  const persist = (next: T, keepalive = false): Promise<void> => {
    const st = sync.current
    if (st.paused || session.held || next === st.saved) return st.busy ? st.run : Promise.resolve()
    if (st.busy) {
      st.queued = next
      return st.run
    }
    st.busy = true
    setStatus({ state: 'saving' })
    return (st.run = track(
      (async () => {
        const r = await repo.save(next, st.rev, { keepalive })
        st.busy = false
        st.failed = !r.ok && !r.conflict
        if (r.ok) {
          st.rev = r.rev
          st.saved = next
          setStatus({ state: 'saved', at: new Date().toISOString() })
        } else if (r.conflict) {
          st.paused = true
          setStatus({ state: 'conflict' })
          setCopyName(`${next.identity.streetName || next.identity.name || opt.current.noun} copy`)
          setConflict(r.conflict)
        } else setStatus({ state: 'failed', error: session.held ? 'Signed out. Sign back in and it’s sent.' : (r.error ?? 'Saving failed.') })
        const q = st.queued
        st.queued = undefined
        if (q && !st.paused) await persist(q)
      })(),
    ))
  }
  /** Save now: the latest state, through the same path as the autosave. True when everything is saved. */
  const saveNow = async () => {
    const st = sync.current
    if (st.latest && st.latest !== st.loaded) await persist(st.latest)
    await st.run
    return !unsaved()
  }
  const saveAndClose = async () => {
    if (await saveNow()) location.hash = opt.current.home(sync.current.loaded)
  }

  useEffect(() => {
    sync.current.latest = doc
    if (!doc || doc === sync.current.loaded) return
    const t = setTimeout(() => void persist(doc), 400)
    return () => clearTimeout(t)
  }, [doc]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const warn = (e: BeforeUnloadEvent) => {
      if (unsaved() && !sync.current.paused && !session.discarding) e.preventDefault()
    }
    // a link out of this doc: send the change first; if it can't be saved, ask before leaving it behind
    const leave = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!a || e.defaultPrevented || opt.current.inEditor(a.getAttribute('href')!) || !unsaved() || sync.current.paused) return
      e.preventDefault()
      const to = a.getAttribute('href')!
      void saveNow().then(ok => {
        if (ok || confirm(`This ${opt.current.noun}’s latest changes aren’t saved. Leave anyway and lose them?`)) location.hash = to
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
    if (!doc) return
    if (how === 'overwrite') {
      const r = await repo.save(doc, undefined, { force: true })
      if (r.ok) {
        sync.current.rev = r.rev
        sync.current.saved = doc
        sync.current.failed = false
        setStatus({ state: 'saved', at: new Date().toISOString() })
      } else setStatus({ state: 'failed', error: r.error ?? 'Saving failed.' })
    } else if (how === 'copy') {
      const copy = { ...doc, id: newId(), campaign: undefined, identity: { ...doc.identity, streetName: copyName.trim() || `${doc.identity.streetName} copy` } }
      const r = await repo.save(copy, undefined, { filename: copyName.trim() })
      if (r.ok) location.hash = opt.current.editHref(copy, opt.current.tab)
    } else {
      const s = await repo.get(doc.id)
      sync.current.rev = s?.rev
      sync.current.loaded = s?.ch
      setDoc(s && opt.current.prepare(s.ch))
      setStatus({ state: 'saved', at: s?.ch.updatedAt })
    }
    sync.current.paused = false
    setConflict(null)
  }

  /** a change: on the undo stack when undoable (else the stack is dropped), stamped updatedAt */
  const commit = (next: T, undoable: boolean) => {
    hist.current.past = undoable && doc ? [...hist.current.past.slice(-99), doc] : []
    hist.current.future = []
    setDoc({ ...next, updatedAt: new Date().toISOString() })
    setCan({ undo: hist.current.past.length > 0, redo: false })
  }
  const stacks = () => setCan({ undo: hist.current.past.length > 0, redo: hist.current.future.length > 0 })
  const undo = () => {
    const prev = hist.current.past.pop()
    if (prev && doc) {
      hist.current.future.push(doc)
      setDoc(prev)
      stacks()
    }
  }
  const redo = () => {
    const next = hist.current.future.pop()
    if (next && doc) {
      hist.current.past.push(doc)
      setDoc(next)
      stacks()
    }
  }

  return {
    doc,
    setDoc,
    loaded,
    loadError,
    owner,
    status,
    saveNow,
    saveAndClose,
    conflict,
    copyName,
    setCopyName,
    resolveConflict,
    commit,
    undo,
    redo,
    canUndo: can.undo,
    canRedo: can.redo,
  }
}
export type Autosave<T extends Doc> = ReturnType<typeof useAutosave<T>>

export function SaveLine({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span className={`save-status ${status.state}`} role="status" aria-label="Save status">
      {status.state === 'saving' && 'Saving…'}
      {status.state === 'saved' &&
        `All changes saved${status.at ? ` · ${new Date(status.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
      {status.state === 'conflict' && 'Not saved — changed in another browser; choose which version to keep.'}
      {status.state === 'failed' && (
        <>
          Not saved — {status.error}{' '}
          <button className="btn small" onClick={onRetry}>
            Retry
          </button>
        </>
      )}
    </span>
  )
}

/** "Saved elsewhere": another browser saved this doc after it was opened here. */
export function ConflictDialog({ s, name }: { s: Pick<Autosave<Doc>, 'conflict' | 'copyName' | 'setCopyName' | 'resolveConflict'>; name: string }) {
  const { conflict, copyName, setCopyName, resolveConflict } = s
  return (
    <Modal
      open={!!conflict}
      onClose={() => void resolveConflict('reload')}
      title="Saved elsewhere"
      actions={
        <>
          <button className="btn" onClick={() => void resolveConflict('reload')}>
            Discard mine, load theirs
          </button>
          <button className="btn" onClick={() => void resolveConflict('copy')}>
            Save mine as a new file
          </button>
          <button className="btn primary" onClick={() => void resolveConflict('overwrite')}>
            Overwrite with mine
          </button>
        </>
      }
    >
      {conflict && (
        <div className="stack">
          <p>
            {name} was saved on the server from another browser{conflict.updatedAt ? ` (${new Date(conflict.updatedAt).toLocaleString()})` : ''}, after you
            opened it. File: <code>{conflict.file}</code>.
          </p>
          <label>
            File name if you save yours as a new file
            <input value={copyName} onChange={e => setCopyName(e.target.value)} />
          </label>
        </div>
      )}
    </Modal>
  )
}

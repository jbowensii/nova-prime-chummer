import { useEffect, useRef, useState, type ReactNode } from 'react'
import { loadCatalog } from '../engine'
import { detectRepo, migrateBrowserToServer, RepoContext, type Repo } from './repo'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { AiSettings } from './AiSettings'
import { AccountMenu, fetchMe, isAdmin, Me, onSessionEnd, session, useMe, type User } from './auth'
import { BooksScreen } from './Books'
import { CatalogEdits } from './EditEntry'
import { Library } from './Library'
import { BookReview } from './Review'
import { RulesScreen } from './Rules'
import { Setup } from './Setup'
import { Recover, SignIn } from './SignIn'
import { RESTORED } from './Backup'
import { DataScreen } from './tabs/Data'
import { UsersScreen } from './Users'
import './app.css'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

/** Core tables a runner can't be built without: while one is missing the app opens on its setup screen. */
const ESSENTIAL = ['attributes', 'metatypes', 'levels', 'packages', 'pricing', 'skills']

/** No core data yet (loadCatalog's coreMissing): the Books page, where the core rulebook is imported, is all that works. */
function NoCoreData({ missing }: { missing: string[] }) {
  const admin = isAdmin(useMe())
  return (
    <main className="lib">
      <header><div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>The game data isn’t set up yet</h1></div>
        <div className="row"><AccountMenu /></div></header>
      {admin ? <>
        <p>Import the core rulebook on the Books page, or upload a data pack.</p>
        {missing.length < 12 && <p className="muted">Missing: {missing.join(', ')}.</p>}
        <p className="row"><a className="btn primary" href="#/books">Open Books</a> <a className="btn" href="#/books/datapack">Upload data pack</a></p>
      </> : <p>The admin hasn’t set up the game data yet. Check back once they have.</p>}
    </main>
  )
}

/** The app itself, signed in (or with no server): the catalog and runners load only here. */
function Main({ repo, route }: { repo: Repo; route: string[] }) {
  const me = useMe()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState(0)
  useEffect(() => {
    loadCatalog('./').then(setCatalog, e => setFailed(String(e)))
    if (repo.mode === 'server') migrateBrowserToServer(repo).then(setMoved, () => {})
  }, [repo])

  if (failed) return <main className="lib"><h1>Game data didn’t load</h1><p>{failed}</p><p>Check that the <code>data/</code> folder is served next to this page, then reload.</p></main>
  if (!catalog) return <main className="lib"><p className="muted">Loading game data…</p></main>

  const admin = isAdmin(me)
  // pages a role can't use open the runner list instead (the server refuses their requests anyway)
  const page = (route[0] === 'books' || route[0] === 'users') && !admin ? '' : route[0]
  const [, id, tab] = route
  const refresh = () => loadCatalog('./').then(setCatalog, () => {}) // a failed reload keeps the loaded catalog
  if (catalog.coreMissing.some(n => ESSENTIAL.includes(n)) && page !== 'books') return <NoCoreData missing={catalog.coreMissing} />
  return (
    <RepoContext.Provider value={repo}><CatalogEdits c={catalog} reload={refresh}>
      {catalog.coreMissing.length > 0 && <p className="banner" role="status" style={{ margin: 0 }}>
        Some game data is missing: {catalog.coreMissing.join(', ')}. {admin
          ? <>Import the core rulebook again on the <a href="#/books">Books page</a>, or upload a data pack.</>
          : 'Ask the admin to import the core rulebook again.'}</p>}
      {moved > 0 && <p className="banner" role="status" style={{ margin: 0 }}>Moved {moved} runner{moved === 1 ? '' : 's'} from this browser to tower04.</p>}
      {page === 'c' && id ? <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
        : page === 'users' ? <UsersScreen />
        : page === 'books' && id === 'ai' ? <AiSettings />
        : page === 'books' && id && tab === 'review' ? <BookReview key={id} c={catalog} id={id} />
        : page === 'books' ? <BooksScreen c={catalog} reload={() => void refresh()} />
        : page === 'data' ? <DataScreen c={catalog} /> : page === 'rules' ? <RulesScreen c={catalog} /> : <Library c={catalog} />}
    </CatalogEdits></RepoContext.Provider>
  )
}

/** The sign-in form over everything, open dialogs included: a modal <dialog> shown last is the top of the top layer and
 *  the only thing not inert. It can't be dismissed (Escape, or Chrome's close on a repeated Escape, opens it again). */
function Over({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) { d.showModal(); d.querySelector('input')?.focus() } // React's autoFocus ran while it was still closed
  }, [])
  return <dialog ref={ref} className="gate-over" aria-label="Sign in again" onCancel={e => e.preventDefault()}
    onClose={() => ref.current?.isConnected && ref.current.showModal()}>{children}</dialog>
}

/** A new page (not a tab switch inside the runner): focus its title, so a screen reader starts there. */
function useFocusTitle(key: string) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    const t = setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return // the page put focus somewhere itself
      const h = document.querySelector<HTMLElement>('main h1')
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }) }
    }, 0)
    return () => clearTimeout(t)
  }, [key])
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const [repo, setRepo] = useState<Repo | null>(null)
  // server: the signed-in account (null: sign in) and whether no account exists yet; browser storage: no accounts at all
  const [me, setMe] = useState<{ user: User | null; setup: boolean; oidc?: boolean } | null>(null)
  const [ended, setEnded] = useState(false)
  // the reload after a restore (Backup.tsx): the sign-in page says why everyone was signed out, once
  const [restored] = useState(() => { try { const r = sessionStorage.getItem(RESTORED); sessionStorage.removeItem(RESTORED); return !!r } catch { return false } })

  useEffect(() => {
    detectRepo().then(async r => {
      setMe(r.mode === 'server' ? await fetchMe() : { user: null, setup: false })
      setRepo(r)
    })
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const user = me?.user
  useFocusTitle(`${route[0] ?? ''}/${route[0] === 'c' ? route[1] : ''}/${me?.setup}/${!!user}`)
  // a session that ends while the app is open: the sign-in form goes over the page, which keeps its state (unsaved
  // runner edits are sent again once signed back in); someone else signing in there starts afresh
  useEffect(() => {
    onSessionEnd(user ? () => setEnded(true) : null)
    return () => onSessionEnd(null)
  }, [user])

  if (!repo || !me) return <main className="lib"><p className="muted">Loading…</p></main>
  if (route[0] === 'setup' && route[1] === 'reset') return <Recover />
  if (repo.mode === 'server' && me.setup) return <Setup onDone={u => { location.hash = '#/'; setMe({ user: u, setup: false }) }} />
  if (repo.mode === 'server' && !user) return <SignIn oidc={me.oidc} onSignedIn={u => setMe({ user: u, setup: false, oidc: me.oidc })} over={false}
    note={restored ? 'The server was restored from a backup. Sign in with the accounts in that backup.' : undefined} />

  const back = (u: User) => {
    if (u.id !== user?.id) return location.reload() // saving stays held: the old account's changes are never sent
    session.held = false
    setMe({ user: u, setup: false, oidc: me.oidc })
    setEnded(false)
    dispatchEvent(new Event('ca2-signed-in'))
  }
  return (
    <Me.Provider value={user ?? null}>
      <div inert={ended} aria-hidden={ended || undefined}><Main repo={repo} route={route} /></div>
      {ended && <Over><SignIn oidc={me.oidc} onSignedIn={back} note={<>You were signed out: the session ended, or was ended elsewhere. Sign in again to
        carry on, and unsaved changes on this page are saved then. <b>Signing in as someone else discards this page’s unsaved changes.</b></>} /></Over>}
    </Me.Provider>
  )
}

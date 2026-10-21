import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PageHeader } from './nav'
import { dupeGroups, loadCatalog } from '../engine'
import { ca2Codec } from '../engine/charxml'
import { detectRepo, migrateBrowserToServer, npcRepoFor, RepoContext, type Repo } from './repo'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { AiSettings } from './AiSettings'
import { canEdit, fetchMe, isAdmin, Me, onSessionEnd, session, useMe, type User } from './auth'
import { BooksScreen } from './Books'
import { CampaignScreen, CampaignsScreen } from './Campaigns'
import { listCompendiums, listShared, readable } from './compendiumStore'
import { CompendiumsScreen } from './Compendiums'
import { CatalogEdits } from './EditEntry'
import { Library } from './Library'
import { NpcsScreen } from './Npcs'
import { BookReview } from './Review'
import { RulesScreen } from './Rules'
import { TableSetupScreen } from './TableRules'
import { Setup } from './Setup'
import { Recover, SignIn } from './SignIn'
import { RESTORED } from './Backup'
import { DataScreen } from './tabs/Data'
import { TrashScreen } from './Trash'
import { UsersScreen } from './Users'
import './app.css'
import '../sr6/ui/theme.css'
import { BackgroundArt } from './Background'
import { GamePicker } from './GamePicker'
import { Sr6Main } from '../sr6/ui/Sr6App'
import { gameOf, homeOf, storedGame } from './game'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
/** The route the app opens on: a bare #/ opens the remembered game's home (links inside the app keep #/ as Anarchy's). */
function firstRoute() {
  const r = parseHash()
  if (r.length || storedGame() !== 'sr6') return r
  history.replaceState(null, '', location.pathname + location.search + homeOf('sr6'))
  return parseHash()
}

/** Core tables a runner can't be built without: while one is missing the app opens on its setup screen. */
const ESSENTIAL = ['attributes', 'metatypes', 'levels', 'packages', 'pricing', 'skills']

/** No core data yet (loadCatalog's coreMissing): the Books page, where the core rulebook is imported, is all that works. */
function NoCoreData({ missing }: { missing: string[] }) {
  const admin = isAdmin(useMe())
  return (
    <main className="lib">
      <PageHeader title="The game data isn’t set up yet" />
      {admin ? (
        <>
          <p>Import the core rulebook on the Books page, or upload a data pack.</p>
          {missing.length < 12 && <p className="muted">Missing: {missing.join(', ')}.</p>}
          <p className="row">
            <a className="btn primary" href="#/books">
              Open Books
            </a>{' '}
            <a className="btn" href="#/books/datapack">
              Upload data pack
            </a>
          </p>
        </>
      ) : (
        <p>The admin hasn’t set up the game data yet. Check back once they have.</p>
      )}
    </main>
  )
}

/** The app itself, signed in (or with no server): the catalog and runners load only here. */
function Main({ repo, route }: { repo: Repo; route: string[] }) {
  const me = useMe()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState(0)
  const npcs = useMemo(() => npcRepoFor(repo, ca2Codec), [repo])
  // on the server the compendiums join the catalog (a failed list loads it without them): staff get those they can read,
  // players the ones shared with the table and their campaigns (no NPCs; a runner sees its own campaign's, EditorView.tsx)
  const staff = repo.mode === 'server' && canEdit(me),
    player = repo.mode === 'server' && !!me && !staff
  const load = async () => loadCatalog('./', staff || player ? readable(await (staff ? listCompendiums() : listShared()).catch(() => [])) : [])
  useEffect(() => {
    load().then(setCatalog, e => setFailed(String(e)))
    if (repo.mode === 'server') migrateBrowserToServer(repo).then(setMoved, () => {})
  }, [repo, staff, player]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed)
    return (
      <main className="lib">
        <h1>Game data didn’t load</h1>
        <p>{failed}</p>
        <p>
          Check that the <code>data/</code> folder is served next to this page, then reload.
        </p>
      </main>
    )
  if (!catalog)
    return (
      <main className="lib">
        <p className="muted">Loading game data…</p>
      </main>
    )

  const admin = isAdmin(me)
  // pages a role can't use open the runner list instead (the server refuses their requests anyway)
  // the trash and campaigns are the server's: the browser's own storage deletes for good, and has no accounts
  const page =
    ((route[0] === 'books' || route[0] === 'users') && !admin) || (['trash', 'campaigns'].includes(route[0]) && repo.mode !== 'server')
      ? ''
      : (route[0] === 'rules' && !canEdit(me)) || route[0] === 'table-rules'
        ? 'table'
        : route[0]
  const [, id, tab] = route
  // NPCs: the GMs' area (admin and editors; the server answers players 403 anyway)
  const gmOnly = (page === 'npcs' || page === 'n') && !canEdit(me) ? 'NPCs' : page === 'compendiums' && !canEdit(me) ? 'compendiums' : ''
  const gate = (title: string, text: string) => (
    <main className="lib">
      <PageHeader title={title} />
      <p className="banner">{text}</p>
    </main>
  )
  const refresh = () => load().then(setCatalog, () => {}) // a failed reload keeps the loaded catalog
  if (catalog.coreMissing.some(n => ESSENTIAL.includes(n)) && page !== 'books') return <NoCoreData missing={catalog.coreMissing} />
  return (
    <RepoContext.Provider value={repo}>
      <CatalogEdits c={catalog} reload={refresh}>
        {catalog.coreMissing.length > 0 && (
          <p className="banner" role="status" style={{ margin: 0 }}>
            Some game data is missing: {catalog.coreMissing.join(', ')}.{' '}
            {admin ? (
              <>
                Import the core rulebook again on the <a href="#/books">Books page</a>, or upload a data pack.
              </>
            ) : (
              'Ask the admin to import the core rulebook again.'
            )}
          </p>
        )}
        {moved > 0 && (
          <p className="banner" role="status" style={{ margin: 0 }}>
            Moved {moved} runner{moved === 1 ? '' : 's'} from this browser to the server.
          </p>
        )}
        {gmOnly ? (
          gate(gmOnly === 'NPCs' ? 'NPCs & Critters' : 'Compendiums', `Only GMs can see ${gmOnly}.`)
        ) : page === 'compendiums' && repo.mode !== 'server' ? (
          gate('Compendiums', 'Compendiums need the server: this copy of the app saves in the browser.')
        ) : page === 'compendiums' ? (
          <CompendiumsScreen key={`${id}/${tab}`} c={catalog} id={id} edit={tab && decodeURIComponent(tab)} reload={refresh} />
        ) : page === 'c' && id ? (
          <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
        ) : page === 'n' && id ? (
          <RepoContext.Provider value={npcs}>
            <EditorView key={`n/${id}`} c={catalog} id={id} tab={tab ?? 'concept'} />
          </RepoContext.Provider>
        ) : page === 'npcs' && id === 'trash' && repo.mode === 'server' ? (
          <TrashScreen key={`npcs/${tab ?? ''}`} npcs user={tab} />
        ) : page === 'npcs' ? (
          <NpcsScreen c={catalog} section={id === 'critters' ? 'critters' : 'npcs'} />
        ) : page === 'users' ? (
          <UsersScreen />
        ) : page === 'campaigns' && id ? (
          <CampaignScreen
            key={id}
            id={id}
            label={r => [catalog.packages.get(r.package)?.name, catalog.levels.get(r.level)?.name ?? r.level].filter(Boolean).join(', ')}
          />
        ) : page === 'campaigns' ? (
          <CampaignsScreen />
        ) : page === 'trash' ? (
          <TrashScreen user={id} />
        ) : page === 'books' && id === 'ai' ? (
          <AiSettings />
        ) : page === 'books' && id && tab === 'review' ? (
          <BookReview key={id} c={catalog} id={id} />
        ) : page === 'books' ? (
          <BooksScreen c={catalog} reload={() => void refresh()} dupeGroups={dupeGroups} />
        ) : page === 'data' ? (
          <DataScreen c={catalog} reload={refresh} />
        ) : page === 'rules' ? (
          <RulesScreen c={catalog} open={id && decodeURIComponent(id)} />
        ) : page === 'table' ? (
          <TableSetupScreen c={catalog} />
        ) : (
          <Library c={catalog} />
        )}
      </CatalogEdits>
    </RepoContext.Provider>
  )
}

/** The sign-in form over everything, open dialogs included: a modal <dialog> shown last is the top of the top layer and
 *  the only thing not inert. It can't be dismissed (Escape, or Chrome's close on a repeated Escape, opens it again). */
function Over({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      d.showModal()
      d.querySelector('input')?.focus()
    } // React's autoFocus ran while it was still closed
  }, [])
  return (
    <dialog
      ref={ref}
      className="gate-over"
      aria-label="Sign in again"
      onCancel={e => e.preventDefault()}
      onClose={() => ref.current?.isConnected && ref.current.showModal()}
    >
      {children}
    </dialog>
  )
}

/** A new page (not a tab switch inside the runner): focus its title, so a screen reader starts there. */
function useFocusTitle(key: string) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return // the page put focus somewhere itself
      const h = document.querySelector<HTMLElement>('main h1')
      if (h) {
        h.tabIndex = -1
        h.focus({ preventScroll: true })
      }
    }, 0)
    return () => clearTimeout(t)
  }, [key])
}

export default function App() {
  const [route, setRoute] = useState(firstRoute)
  // null: the picker. A browser that opened on a deep link is in that link's game (not remembered), so a link to #/ inside
  // the app stays Anarchy's home rather than bringing the picker up
  const [game, setGame] = useState(() => storedGame() ?? (route.length ? gameOf(route) : null))
  const [repo, setRepo] = useState<Repo | null>(null)
  // server: the signed-in account (null: sign in) and whether no account exists yet; browser storage: no accounts at all
  const [me, setMe] = useState<{ user: User | null; setup: boolean; oidc?: boolean } | null>(null)
  const [ended, setEnded] = useState(false)
  // the reload after a restore (Backup.tsx): the sign-in page says why everyone was signed out, once
  const [restored] = useState(() => {
    try {
      const r = sessionStorage.getItem(RESTORED)
      sessionStorage.removeItem(RESTORED)
      return !!r
    } catch {
      return false
    }
  })

  useEffect(() => {
    detectRepo(ca2Codec).then(async r => {
      setMe(r.mode === 'server' ? await fetchMe() : { user: null, setup: false })
      setRepo(r)
    })
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  const user = me?.user
  // the game the page's look follows (sr6/ui/theme.css keys off it): the picker mixes both, #/sr6… is Shadowrun 6's
  const look = !route.length && !game ? 'pick' : gameOf(route)
  useLayoutEffect(() => {
    document.documentElement.dataset.game = look
  }, [look])
  useFocusTitle(`${route[0] ?? ''}/${route[0] === 'c' || route[0] === 'n' ? route[1] : ''}/${me?.setup}/${!!user}`)
  // a session that ends while the app is open: the sign-in form goes over the page, which keeps its state (unsaved
  // runner edits are sent again once signed back in); someone else signing in there starts afresh
  useEffect(() => {
    onSessionEnd(user ? () => setEnded(true) : null, user?.id ?? null)
    return () => onSessionEnd(null)
  }, [user])

  if (!repo || !me)
    return (
      <main className="lib">
        <p className="muted">Loading…</p>
      </main>
    )
  if (route[0] === 'setup' && route[1] === 'reset') return <Recover />
  if (!route.length && !game) return <GamePicker onPick={setGame} />
  if (repo.mode === 'server' && me.setup)
    return (
      <Setup
        onDone={u => {
          location.hash = homeOf(storedGame() ?? 'ca2')
          setMe({ user: u, setup: false })
        }}
      />
    )
  if (repo.mode === 'server' && !user)
    return (
      <SignIn
        oidc={me.oidc}
        onSignedIn={u => setMe({ user: u, setup: false, oidc: me.oidc })}
        over={false}
        note={restored ? 'The server was restored from a backup. Sign in with the accounts in that backup.' : undefined}
      />
    )

  const back = (u: User) => {
    if (u.id !== user?.id) {
      session.discarding = true
      return location.reload() // saving stays held: the old account's changes are never sent
    }
    session.held = false
    setMe({ user: u, setup: false, oidc: me.oidc })
    setEnded(false)
    dispatchEvent(new Event('ca2-signed-in'))
  }
  return (
    <Me.Provider value={user ?? null}>
      {user && <BackgroundArt game={gameOf(route)} />}
      <div inert={ended} aria-hidden={ended || undefined}>
        {route[0] === 'sr6' ? <Sr6Main repo={repo} route={route.slice(1)} /> : <Main repo={repo} route={route} />}
      </div>
      {ended && (
        <Over>
          <SignIn
            oidc={me.oidc}
            onSignedIn={back}
            note={
              <>
                You were signed out: the session ended, or was ended elsewhere. Sign in again to carry on, and unsaved changes on this page are saved then.{' '}
                <b>Signing in as someone else discards this page’s unsaved changes.</b>
              </>
            }
          />
        </Over>
      )}
    </Me.Provider>
  )
}

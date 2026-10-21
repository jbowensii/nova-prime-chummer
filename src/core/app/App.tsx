import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { HeaderBarsContext } from '../chrome/nav'
import { ca2Codec } from '../../engine/charxml'
import { detectRepo } from '../../features/runner-store/repo'
import { type Repo } from '../ui-kit/repoContext'
import { fetchMe, Me, onSessionEnd, session, type User } from '../ui-kit/auth'
import { AskButton } from '../../features/ai-assist/AskRules'
import { Main } from '../../ui/AnarchyMain'
import { SettingsButton } from './SettingsDialog'
import { Setup } from '../../features/accounts/Setup'
import { Recover, SignIn } from '../../features/accounts/SignIn'
import { RESTORED } from '../../features/backup/Backup'
import '../ui-kit/app.css'
import '../../sr6/ui/theme.css'
import { BackgroundArt } from '../../features/appearance/Background'
import { GamePicker } from './GamePicker'
import { Sr6Main } from '../../sr6/ui/Sr6App'
import { gameOf, homeOf, storedGame } from '../ui-kit/game'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
/** The route the app opens on: a bare #/ opens the remembered game's home (links inside the app keep #/ as Anarchy's). */
function firstRoute() {
  const r = parseHash()
  if (r.length || storedGame() !== 'sr6') return r
  history.replaceState(null, '', location.pathname + location.search + homeOf('sr6'))
  return parseHash()
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
      <HeaderBarsContext.Provider value={{ server: repo.mode === 'server', Ask: AskButton, Settings: SettingsButton }}>
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
      </HeaderBarsContext.Provider>
    </Me.Provider>
  )
}

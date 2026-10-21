// The sign-in page (also shown over the app when a session ends; "Sign in with Authelia" when Settings → Sign-in turned it on)
// and the recovery page (#/setup/reset), which takes the one-time code `node server/users.mjs reset <username>` prints.
import { useEffect, useState, type ReactNode } from 'react'
import { fetchMe, PasswordField, send, takeLinkNote, type User } from '../../core/ui-kit/auth'
import { Brand } from '../../core/ui-kit/bits'

/** A page with one form: the brand, a title, the fields, one error line (role=alert). */
export function GatePage({
  title,
  intro,
  err,
  onSubmit,
  busy,
  action,
  children,
  after,
}: {
  title: string
  intro?: ReactNode
  err: string
  onSubmit: () => void
  busy: boolean
  action: string
  children: ReactNode
  after?: ReactNode
}) {
  return (
    <main className="lib gate">
      <div>
        <Brand />
      </div>
      <h1>{title}</h1>
      {intro}
      <form
        className="stack"
        onSubmit={e => {
          e.preventDefault()
          if (!busy) onSubmit()
        }}
      >
        {children}
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <div>
          <button className="btn primary" aria-disabled={busy}>
            {busy ? 'One moment…' : action}
          </button>
        </div>
      </form>
      {after}
    </main>
  )
}

// why a sign-in through Authelia came back without a session (server/oidc.mjs sends /?signin=<key>)
const OIDC_ERRORS: Record<string, string> = {
  'no-account': 'Authelia knows you, but this app has no account for you. Ask the admin for an account.',
  expired: 'That sign-in took too long or was already used. Try again.',
  denied: 'Authelia didn’t sign you in. Try again.',
  'too-many': 'Too many sign-in tries from your network just now. Wait a minute, then try again.',
  off: 'Sign in with Authelia is turned off. Sign in with your username and password.',
  restoring: 'The server is being restored from a backup. Try again in a minute.',
  failed: 'Signing in with Authelia didn’t work. Try again, and if it keeps failing ask the admin to check the sign-in settings.',
}
/** The ?signin= a failed Authelia sign-in came back with: read once, and taken off the address. */
let oidcNote = (() => {
  const key = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('signin')
  if (key === null) return ''
  history.replaceState(null, '', location.pathname + location.hash)
  return Object.hasOwn(OIDC_ERRORS, key) ? OIDC_ERRORS[key] : OIDC_ERRORS.failed
})()

/** `over`: shown over a page whose session ended (the default when there is a `note`). */
export function SignIn({ onSignedIn, note, oidc, over = !!note }: { onSignedIn: (u: User) => void; note?: ReactNode; oidc?: boolean; over?: boolean }) {
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState('')
  const [err, setErr] = useState(() => oidcNote || takeLinkNote(null)),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    oidcNote = ''
  }, []) // shown once
  // over a page (a session that ended): Authelia opens in a new tab, so this page keeps its unsaved changes
  const back = async () => {
    const { user } = await fetchMe()
    if (user) onSignedIn(user)
    else setErr('You’re not signed in yet. Finish signing in with Authelia in the other tab, then choose this again.')
  }
  const submit = async () => {
    setBusy(true)
    setErr('')
    try {
      const r = await send('auth/login', { username, password })
      onSignedIn((await r.json()).user)
    } catch (e) {
      setErr((e as Error).message)
      setPassword('')
    }
    setBusy(false)
  }
  return (
    <GatePage
      title="Sign in"
      busy={busy}
      err={err}
      onSubmit={() => void submit()}
      action="Sign in"
      intro={
        note && (
          <p className="banner" role="status">
            {note}
          </p>
        )
      }
      after={
        <>
          {oidc && (
            <div className="row oidc">
              <a className="btn" href="./api/auth/oidc/start" {...(over ? { target: '_blank', rel: 'noopener' } : {})}>
                Sign in with Authelia
              </a>
              {over && (
                <button type="button" className="btn quiet" onClick={() => void back()}>
                  I’ve signed in with Authelia
                </button>
              )}
            </div>
          )}
          <p className="muted">
            Forgot your password? Ask the admin to reset it, or use a{' '}
            <a href="#/setup/reset" {...(over ? { target: '_blank', rel: 'noopener' } : {})}>
              recovery code
            </a>
            {over ? ' (opens a new tab, so this page stays as it is)' : ''}.
          </p>
        </>
      }
    >
      <label>
        Username
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </label>
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" hint={false} />
    </GatePage>
  )
}

export function Recover() {
  const [username, setUsername] = useState(''),
    [code, setCode] = useState('')
  const [pw, setPw] = useState(''),
    [again, setAgain] = useState('')
  const [err, setErr] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false)
  const submit = async () => {
    if (pw !== again) return setErr('The passwords don’t match. Type the same one twice.')
    setBusy(true)
    setErr('')
    try {
      await send('setup/reset', { username, code, password: pw })
      setDone(true)
    } catch (e) {
      setErr((e as Error).message)
    }
    setBusy(false)
  }
  if (done)
    return (
      <main className="lib gate">
        <div>
          <Brand />
        </div>
        <h1>Password set</h1>
        <p role="status">Your new password works now, and every other device was signed out.</p>
        <div>
          <a className="btn primary" href="#/" autoFocus>
            Sign in
          </a>
        </div>
      </main>
    )
  return (
    <GatePage
      title="Reset a password"
      busy={busy}
      err={err}
      onSubmit={() => void submit()}
      action="Set new password"
      intro={
        <p>
          The admin gets a one-time recovery code by running <code>node server/users.mjs reset &lt;username&gt;</code> in the container. It works for 15
          minutes.
        </p>
      }
      after={
        <p className="muted">
          <a href="#/">Back to sign in</a>
        </p>
      }
    >
      <label>
        Username
        <input
          value={username}
          onChange={e => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          autoFocus
        />
      </label>
      <label>
        Recovery code
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          placeholder="XXXX-XXXX-XXXX"
        />
      </label>
      <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
      <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" hint={false} />
    </GatePage>
  )
}

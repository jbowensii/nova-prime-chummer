// The sign-in page (also shown over the app when a session ends) and the recovery page (#/setup/reset), which takes the
// one-time code `node server/users.mjs reset <username>` prints.
import { useState, type ReactNode } from 'react'
import { PasswordField, send, type User } from './auth'

/** A page with one form: the brand, a title, the fields, one error line (role=alert). */
export function GatePage({ title, intro, err, onSubmit, busy, action, children, after }: { title: string; intro?: ReactNode; err: string;
  onSubmit: () => void; busy: boolean; action: string; children: ReactNode; after?: ReactNode }) {
  return (
    <main className="lib gate">
      <div><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a></div>
      <h1>{title}</h1>
      {intro}
      <form className="stack" onSubmit={e => { e.preventDefault(); if (!busy) onSubmit() }}>
        {children}
        {err && <p className="err" role="alert">{err}</p>}
        <div><button className="btn primary" aria-disabled={busy}>{busy ? 'One moment…' : action}</button></div>
      </form>
      {after}
    </main>
  )
}

export function SignIn({ onSignedIn, note }: { onSignedIn: (u: User) => void; note?: ReactNode }) {
  const [username, setUsername] = useState(''), [password, setPassword] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr('')
    try {
      const r = await send('auth/login', { username, password })
      onSignedIn((await r.json()).user)
    } catch (e) { setErr((e as Error).message); setPassword('') }
    setBusy(false)
  }
  return (
    <GatePage title="Sign in" busy={busy} err={err} onSubmit={() => void submit()} action="Sign in"
      intro={note && <p className="banner" role="status">{note}</p>}
      after={<>
        {/* Task 5: "Sign in with Authelia" goes here when Settings → Sign-in has an issuer. */}
        <p className="muted">Forgot your password? Ask the admin to reset it, or use a <a href="#/setup/reset"
          {...note ? { target: '_blank', rel: 'noopener' } : {}}>recovery code</a>{note ? ' (opens a new tab, so this page stays as it is)' : ''}.</p>
      </>}>
      <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none"
        spellCheck={false} required autoFocus /></label>
      <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" hint={false} />
    </GatePage>
  )
}

export function Recover() {
  const [username, setUsername] = useState(''), [code, setCode] = useState('')
  const [pw, setPw] = useState(''), [again, setAgain] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
  const submit = async () => {
    if (pw !== again) return setErr('The passwords don’t match. Type the same one twice.')
    setBusy(true); setErr('')
    try { await send('setup/reset', { username, code, password: pw }); setDone(true) } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }
  if (done) return (
    <main className="lib gate">
      <div><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a></div>
      <h1>Password set</h1>
      <p role="status">Your new password works now, and every other device was signed out.</p>
      <div><a className="btn primary" href="#/" autoFocus>Sign in</a></div>
    </main>
  )
  return (
    <GatePage title="Reset a password" busy={busy} err={err} onSubmit={() => void submit()} action="Set new password"
      intro={<p>The admin gets a one-time recovery code by running <code>node server/users.mjs reset &lt;username&gt;</code> in the
        container. It works for 15 minutes.</p>}
      after={<p className="muted"><a href="#/">Back to sign in</a></p>}>
      <label>Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none"
        spellCheck={false} required autoFocus /></label>
      <label>Recovery code<input value={code} onChange={e => setCode(e.target.value)} autoComplete="one-time-code" autoCapitalize="characters"
        spellCheck={false} required placeholder="XXXX-XXXX-XXXX" /></label>
      <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
      <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" hint={false} />
    </GatePage>
  )
}

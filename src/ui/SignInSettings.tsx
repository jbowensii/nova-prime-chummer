// Settings → Sign-in (admin, server only): Sign in with Authelia (OpenID Connect). The client secret is write-only: the server
// never sends it back, and a new issuer address drops it (server/oidc.mjs).
import { useEffect, useState } from 'react'
import { send, sentence } from './auth'
import { useRepo } from './repo'

interface Saved { issuer: string; clientId: string; tokenAuth: 'client_secret_basic' | 'client_secret_post'; enabled: boolean; secretSet: boolean; redirectUri: string | null }

export function SignInSettings() {
  const repo = useRepo()
  const [saved, setSaved] = useState<Saved | null>(null)
  const [f, setF] = useState({ issuer: '', clientId: '', tokenAuth: 'client_secret_basic' as Saved['tokenAuth'], enabled: false, secret: '' })
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null), [busy, setBusy] = useState(false)
  const load = (s: Saved) => { setSaved(s); setF({ issuer: s.issuer, clientId: s.clientId, tokenAuth: s.tokenAuth, enabled: s.enabled, secret: '' }) }
  useEffect(() => {
    if (repo.mode !== 'server') return
    send('auth-settings', undefined, 'GET').then(r => r.json()).then(load, e => setMsg({ text: (e as Error).message, err: true }))
  }, [repo.mode])
  if (repo.mode !== 'server') return null

  const newIssuer = !!saved && f.issuer.trim() !== saved.issuer
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const s: Saved = await (await send('auth-settings', { issuer: f.issuer, clientId: f.clientId, tokenAuth: f.tokenAuth, enabled: f.enabled,
        ...f.secret ? { secret: f.secret } : {} }, 'PUT')).json()
      load(s)
      setMsg({ text: s.enabled ? 'Saved. The sign-in page shows “Sign in with Authelia”.' : 'Saved. Sign in with Authelia is off.' })
    } catch (x) { setMsg({ text: (x as Error).message, err: true }) }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true); setMsg(null)
    try {
      const r: { ok: boolean; message: string } = await (await send('auth-settings/test', { issuer: f.issuer })).json()
      setMsg({ text: sentence(r.message), err: !r.ok })
    } catch (x) { setMsg({ text: (x as Error).message, err: true }) }
    setBusy(false)
  }
  const set = (k: 'issuer' | 'clientId' | 'secret') => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  return (
    <fieldset className="signin-settings">
      <legend>Sign-in</legend>
      <p className="muted">Let people sign in through Authelia (single sign-on, with its two-factor). Their accounts must exist on the
        Users page with “Signs in with: Authelia”. The first sign-in matches the Authelia username (or, without one, a verified email)
        and links the account to that Authelia user for good; Unlink on the Users page undoes it.</p>
      {saved === null && !msg ? <p className="muted">Loading…</p> : (
        <form className="stack" onSubmit={save}>
          <label>Issuer address<input type="url" value={f.issuer} onChange={set('issuer')} placeholder="https://auth.example.com" spellCheck={false}
            autoComplete="off" /></label>
          {newIssuer && saved?.issuer && <p className="warn small">A new issuer unlinks every Authelia account: each is linked again, by
            username, at its next sign-in.</p>}
          <label>Client ID<input value={f.clientId} onChange={set('clientId')} spellCheck={false} autoComplete="off" autoCapitalize="none" /></label>
          <label>Client secret<input type="password" value={f.secret} onChange={set('secret')} autoComplete="new-password" aria-describedby="oidc-secret-note"
            placeholder={saved?.secretSet && !newIssuer ? 'Saved (type a new one to replace it)' : ''} /></label>
          <small id="oidc-secret-note" className="muted">{newIssuer && saved?.secretSet
            ? 'A new issuer address needs the secret again: the saved one is only ever sent to its own issuer.'
            : 'Stored on the server only; it’s never shown again.'}</small>
          <label>The client secret goes
            <select value={f.tokenAuth} onChange={e => setF({ ...f, tokenAuth: e.target.value as Saved['tokenAuth'] })}>
              <option value="client_secret_basic">In the Authorization header (client_secret_basic)</option>
              <option value="client_secret_post">In the request body (client_secret_post)</option>
            </select>
          </label>
          {saved?.redirectUri && <p className="small">Redirect URI for Authelia: <code>{saved.redirectUri}</code></p>}
          <label className="check"><input type="checkbox" checked={f.enabled} onChange={e => setF({ ...f, enabled: e.target.checked })} />
            Show “Sign in with Authelia” on the sign-in page</label>
          <div className="row">
            <button type="button" className="btn" disabled={busy || !f.issuer.trim()} onClick={() => void test()}>Test</button>
            <button className="btn primary" disabled={busy}>Save sign-in settings</button>
          </div>
        </form>
      )}
      <div role="status" aria-live="polite">{msg && !msg.err && <p className="banner">{msg.text}</p>}</div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
    </fieldset>
  )
}

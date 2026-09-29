// Accounts in the app (server/auth.mjs does the enforcing; hiding a control here is only convenience): who is signed
// in, what their role may do, the account menu, and noticing a session that ended (any 401 from the server).
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { Modal } from './bits'

export type Role = 'admin' | 'editor' | 'player'
export interface User { id: string; username: string; name: string; email: string | null; role: Role; method: 'password' | 'authelia';
  enabled: boolean; created: string; lastLogin: string | null; linked?: boolean }

/** The signed-in account; null when the app runs without a server (browser storage: no accounts, nothing hidden). */
export const Me = createContext<User | null>(null)
export const useMe = () => useContext(Me)
export const isAdmin = (u: User | null) => !u || u.role === 'admin'
/** Catalog edits and house-rule entries: admin and editors. */
export const canEdit = (u: User | null) => !u || u.role !== 'player'
export const ROLE_NAMES: Record<Role, string> = { admin: 'Admin', editor: 'Editor', player: 'Player' }
export const MIN_PASSWORD = 10

/** A server message ("wrong username or password") as a sentence. */
export const sentence = (s: string) => `${s[0].toUpperCase()}${s.slice(1).replace(/[.:]\s*$/, '')}.`
/** A lead ("Couldn’t load the data pack") and a server's reason as one line: "Lead: reason." — or, when the reason has a
 *  colon of its own (two in one sentence read badly), "Lead. Reason." */
export function because(lead: string, why: string) {
  const w = why.trim().replace(/[.:]\s*$/, '')
  return !w ? `${lead}.` : w.includes(':') ? `${lead}. ${sentence(w)}` : `${lead}: ${w}.`
}
export const UNREACHABLE = 'The server can’t be reached. Check it’s running, then try again.'

/** What went wrong with a refused request, in plain words; 429s say how long the pause is (Retry-After). */
export async function problem(r: Response): Promise<string> {
  if (r.status === 429) {
    const s = Number(r.headers.get('Retry-After')) || 60
    if (s <= 5) return 'The server is busy. Try again in a moment.'
    const m = Math.ceil(s / 60)
    return `Too many tries, so this is paused. Try again in ${m === 1 ? 'a minute' : `${m} minutes`}.`
  }
  const why = (await r.json().catch(() => null))?.error
  return why ? sentence(why) : `Something went wrong (the server answered ${r.status}). Try again.`
}

/** POST JSON to the accounts API: the response, or an Error with a plain message when it was refused or unreachable. */
export async function send(path: string, body?: unknown, method = 'POST'): Promise<Response> {
  const r = await fetch(`./api/${path}`, { method, cache: 'no-store', headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) }).catch(() => { throw new Error(UNREACHABLE) })
  if (!r.ok) throw new Error(await problem(r))
  return r
}

export async function fetchMe(): Promise<{ user: User | null; setup: boolean; oidc?: boolean }> {
  const r = await fetch('./api/auth/me', { cache: 'no-store' }).catch(() => null)
  return r?.ok ? r.json() : { user: null, setup: false }
}

// Every request goes through fetch: a 401 from /api or /custom (other than a wrong password at sign-in) means the session
// ended (expired, signed out elsewhere, disabled). ponytail: wraps window.fetch once; XHR uploads call sessionEnded().
let expired: (() => void) | null = null
/** held: no session to save under. Set the moment a 401 is seen (or on sign-out); only the same account signing back in
 *  clears it, so an unsaved change is never sent under someone else's session. */
export const session = { held: false }
/** Runner saves in flight (repo.ts tracks every server save and delete): sign-out waits for them before ending the session. */
const saving = new Set<Promise<unknown>>()
export function track<T>(p: Promise<T>): Promise<T> {
  saving.add(p)
  void p.finally(() => saving.delete(p)).catch(() => {})
  return p
}
export function sessionEnded() {
  if (!expired) return
  session.held = true
  expired()
}
export function onSessionEnd(fn: (() => void) | null) {
  expired = fn
  const w = window as typeof window & { ca2Fetch?: typeof fetch }
  if (w.ca2Fetch) return
  const orig = w.ca2Fetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const r = await orig(input, init)
    if (r.status === 401 && expired) {
      const path = new URL(r.url || String(input instanceof Request ? input.url : input), location.href).pathname
      if (/\/(api|custom)\//.test(path) && !path.endsWith('/api/auth/login')) sessionEnded()
    }
    return r
  }
}

/** How long sign-out waits for the saves under way before it asks: a save that hangs mustn't keep anyone signed in. */
export const SIGN_OUT_WAIT = 10_000
/** Sign out: the open runner sends its last change and every save finishes, then the session ends (nothing is sent after
 *  it), then a reload so nothing stays in memory. Waits at most `wait` ms: false when a save is still running then (the
 *  caller warns; `force` signs out without waiting). */
export async function signOut(force = false, wait = SIGN_OUT_WAIT): Promise<boolean> {
  if (!force) {
    dispatchEvent(new Event('ca2-leaving'))
    const late = new Promise<'late'>(ok => setTimeout(ok, wait, 'late'))
    while (saving.size) if (await Promise.race([Promise.allSettled([...saving]), late]) === 'late') return false
  }
  session.held = true
  await fetch('./api/auth/logout', { method: 'POST' }).catch(() => {})
  location.hash = '#/'
  location.reload()
  return true
}

/** Password, with the "at least 10 characters" hint tied to it. */
export function PasswordField({ label, value, onChange, autoComplete, hint = true, autoFocus }: { label: string; value: string;
  onChange: (v: string) => void; autoComplete: string; hint?: boolean; autoFocus?: boolean }) {
  const id = useId()
  const short = hint && value.length > 0 && value.length < MIN_PASSWORD
  return (
    <div className="field">
      <label>{label}
        <input type="password" value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} required autoFocus={autoFocus}
          minLength={hint ? MIN_PASSWORD : undefined} maxLength={1024} aria-describedby={hint ? id : undefined} />
      </label>
      {hint && <small id={id} className={short ? 'warn' : 'muted'}>
        At least {MIN_PASSWORD} characters{short ? ` (${MIN_PASSWORD - value.length} more)` : ''}. A few unrelated words make a good one.</small>}
    </div>
  )
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState(''), [pw, setPw] = useState(''), [again, setAgain] = useState('')
  const [err, setErr] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false)
  const close = () => { setCur(''); setPw(''); setAgain(''); setErr(''); setDone(false); onClose() }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== again) return setErr('The new passwords don’t match. Type the same one twice.')
    setBusy(true); setErr('')
    try { await send('auth/password', { current: cur, password: pw }); setDone(true) } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  return (
    <Modal open={open} onClose={close} title="Change password" actions={done ? <button className="btn primary" onClick={close}>Done</button>
      : <><button className="btn" onClick={close}>Cancel</button><button className="btn primary" form="ca2-pw" disabled={busy}>Change password</button></>}>
      {done ? <p role="status">Password changed. Your other devices are signed out; this one stays signed in.</p> : (
        <form id="ca2-pw" className="stack" onSubmit={submit}>
          <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" hint={false} autoFocus />
          <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
          <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" hint={false} />
          {err && <p className="err" role="alert">{err}</p>}
        </form>
      )}
    </Modal>
  )
}

/** The header's account menu: name, role, Users (admin), Change password, Sign out. Nothing without accounts. */
export function AccountMenu() {
  const me = useMe()
  const [open, setOpen] = useState(false), [pw, setPw] = useState(false)
  const [leaving, setLeaving] = useState<'no' | 'waiting' | 'stuck'>('no')
  const leave = async (force = false) => {
    setLeaving('waiting')
    if (!await signOut(force)) setLeaving('stuck')
  }
  const btn = useRef<HTMLButtonElement>(null), panel = useId()
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [open])
  if (!me) return null
  return (
    <div className="account" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <button ref={btn} className="btn quiet" aria-expanded={open} aria-controls={panel} onClick={() => setOpen(o => !o)}>
        {me.name} <span aria-hidden>▾</span>
      </button>
      <div id={panel} className="account-panel" hidden={!open}>
        <p><b>{me.name}</b><br /><span className="muted">{ROLE_NAMES[me.role]} · {me.username}</span></p>
        {me.role === 'admin' && <a className="btn quiet" href="#/users" onClick={() => setOpen(false)}>Users</a>}
        {me.method === 'password' && <button className="btn quiet" onClick={() => { setOpen(false); setPw(true) }}>Change password</button>}
        <button className="btn quiet" disabled={leaving === 'waiting'} onClick={() => void leave()}>{leaving === 'waiting' ? 'Signing out…' : 'Sign out'}</button>
      </div>
      <Modal open={leaving === 'stuck'} onClose={() => setLeaving('no')} title="A change is still saving"
        actions={<><button className="btn" onClick={() => void leave()}>Keep waiting</button>
          <button className="btn danger" onClick={() => void leave(true)}>Sign out anyway</button></>}>
        <p>A runner’s change hasn’t reached the server after {SIGN_OUT_WAIT / 1000} seconds. Keep waiting, or sign out now and lose that change.</p>
      </Modal>
      <ChangePassword open={pw} onClose={() => { setPw(false); btn.current?.focus() }} />
    </div>
  )
}

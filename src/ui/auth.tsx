// Accounts in the app (server/auth.mjs does the enforcing; hiding a control here is only convenience): who is signed
// in, what their role may do, the account menu, and noticing a session that ended (any 401 from the server).
import { Icon } from './icons'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import { Modal } from './bits'
import { gameOf } from './game'

export type Role = 'admin' | 'editor' | 'player'
export interface User {
  id: string
  username: string
  name: string
  email: string | null
  role: Role
  method: 'password' | 'authelia'
  enabled: boolean
  created: string
  lastLogin: string | null
  linked?: boolean
  dailyQuestions?: number | null
}

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
  const r = await fetch(`./api/${path}`, {
    method,
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new Error(UNREACHABLE)
  })
  if (!r.ok) throw new Error(await problem(r))
  return r
}

/** Sign in with Authelia is on (the last /api/auth/me said so): the account menu offers linking a password account. */
let oidcOn = false
export async function fetchMe(): Promise<{ user: User | null; setup: boolean; oidc?: boolean }> {
  const r = await fetch('./api/auth/me', { cache: 'no-store' }).catch(() => null)
  const me = r?.ok ? await r.json() : { user: null, setup: false }
  oidcOn = !!me.oidc
  return me
}

// how "Link my Authelia account" came back (server/oidc.mjs sends /?link=<key>)
const LINK_RESULTS: Record<string, string> = {
  done: 'Your account is now linked to Authelia. From now on, sign in with Authelia: your password no longer works, and your other devices are signed out.',
  taken: 'That Authelia user is already linked to another account here, so nothing changed. Ask the admin if that’s wrong.',
  'other-account': 'Nothing changed: the Authelia user who signed in has an account of their own here. Sign in to Authelia as yourself and try again.',
  stale: 'Nothing changed: Authelia didn’t ask for your password again. Sign out of Authelia, then try again.',
  session: 'Nothing changed: the link was started from a sign-in that has ended or changed. Sign in and try again.',
  expired: 'Nothing changed: the link took too long or was already used. Try again.',
  denied: 'Nothing changed: Authelia didn’t sign you in. Try again.',
  'too-many': 'Nothing changed: too many sign-in tries from your network just now. Wait a minute, then try again.',
  failed: 'Nothing changed: linking to Authelia didn’t work. Try again, and if it keeps failing ask the admin to check the sign-in settings.',
}
/** The ?link= the browser came back with: read once, and taken off the address. */
let linkKey = (() => {
  const key = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('link')
  if (key === null) return ''
  history.replaceState(null, '', location.pathname + location.hash)
  return Object.hasOwn(LINK_RESULTS, key) ? key : 'failed'
})()
/** The link result, once (the account menu shows it; the sign-in page when nobody is signed in any more). Anyone can make a
 *  /?link=done address: "done" is only said to an account that really signs in with Authelia now. */
export function takeLinkNote(me: User | null) {
  const k = linkKey
  linkKey = ''
  return !k || (k === 'done' && me?.method !== 'authelia') ? '' : LINK_RESULTS[k]
}

/** "Link my Authelia account": what changes, the current password, then off to Authelia (the server checks it all). */
function LinkAuthelia({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState(''),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false)
  const close = () => {
    setCur('')
    setErr('')
    onClose()
  }
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      if (!(await saved())) throw new Error('A runner’s change is still saving. Try again in a moment.')
      location.assign((await (await send('auth/oidc/link/start', { current: cur })).json()).url)
    } catch (x) {
      setErr((x as Error).message)
      setCur('')
      setBusy(false)
    }
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Link my Authelia account"
      actions={
        <>
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" form="ca2-link" disabled={busy}>
            {busy ? 'One moment…' : 'Continue to Authelia'}
          </button>
        </>
      }
    >
      <form id="ca2-link" className="stack" onSubmit={e => void go(e)}>
        <p>
          You’ll sign in with Authelia as yourself to show it’s you. After that, this account signs in with Authelia only: <b>your password stops working</b>{' '}
          and your other devices are signed out. Only the admin can switch it back.
        </p>
        <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" hint={false} autoFocus />
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
      </form>
    </Modal>
  )
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
/** The account this page was signed in as: every /api request says so (X-CA2-User), and the server refuses one whose
 *  cookie is now someone else's (signed in as another account in another tab of this browser) with a 401, so nothing
 *  from this page is ever read or saved under that account. */
let account: string | null = null
export const ACCOUNT_HEADER = 'X-CA2-User'
export const accountHeader = (): Record<string, string> => (account ? { [ACCOUNT_HEADER]: account } : {})
const api = (path: string) => /\/(api|custom)\//.test(path)
export function onSessionEnd(fn: (() => void) | null, id: string | null = null) {
  expired = fn
  account = id
  const w = window as typeof window & { ca2Fetch?: typeof fetch }
  if (w.ca2Fetch) return
  const orig = (w.ca2Fetch = window.fetch.bind(window))
  window.fetch = async (input, init) => {
    if (account && !(input instanceof Request) && api(new URL(String(input), location.href).pathname)) {
      const headers = new Headers(init?.headers)
      headers.set(ACCOUNT_HEADER, account)
      init = { ...init, headers }
    }
    const r = await orig(input, init)
    if (r.status === 401 && expired) {
      const path = new URL(r.url || String(input instanceof Request ? input.url : input), location.href).pathname
      if (api(path) && !path.endsWith('/api/auth/login')) sessionEnded()
    }
    return r
  }
}

/** Before the page goes (sign-out, off to Authelia): the open runner sends its last change and every save finishes; false
 *  when one is still running after `wait` ms. */
async function saved(wait = SIGN_OUT_WAIT) {
  dispatchEvent(new Event('ca2-leaving'))
  const late = new Promise<'late'>(ok => setTimeout(ok, wait, 'late'))
  while (saving.size) if ((await Promise.race([Promise.allSettled([...saving]), late])) === 'late') return false
  return true
}
/** Every runner save under way has finished (or `wait` ms passed): the runner list waits for the editor's last save. */
export async function savesSettled(wait = 5000) {
  const late = new Promise<'late'>(ok => setTimeout(ok, wait, 'late'))
  while (saving.size) if ((await Promise.race([Promise.allSettled([...saving]), late])) === 'late') return
}
/** How long sign-out waits for the saves under way before it asks: a save that hangs mustn't keep anyone signed in. */
export const SIGN_OUT_WAIT = 10_000
/** Sign out: the open runner sends its last change and every save finishes, then the session ends (nothing is sent after
 *  it), then a reload so nothing stays in memory. Waits at most `wait` ms: false when a save is still running then (the
 *  caller warns; `force` signs out without waiting). */
export async function signOut(force = false, wait = SIGN_OUT_WAIT): Promise<boolean> {
  if (!force && !(await saved(wait))) return false
  session.held = true
  await fetch('./api/auth/logout', { method: 'POST' }).catch(() => {})
  location.hash = '#/'
  location.reload()
  return true
}

/** Password, with the "at least 10 characters" hint tied to it. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint = true,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  hint?: boolean
  autoFocus?: boolean
}) {
  const id = useId()
  const short = hint && value.length > 0 && value.length < MIN_PASSWORD
  return (
    <div className="field">
      <label>
        {label}
        <input
          type="password"
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
          autoFocus={autoFocus}
          minLength={hint ? MIN_PASSWORD : undefined}
          maxLength={1024}
          aria-describedby={hint ? id : undefined}
        />
      </label>
      {hint && (
        <small id={id} className={short ? 'warn' : 'muted'}>
          At least {MIN_PASSWORD} characters{short ? ` (${MIN_PASSWORD - value.length} more)` : ''}. A few unrelated words make a good one.
        </small>
      )}
    </div>
  )
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cur, setCur] = useState(''),
    [pw, setPw] = useState(''),
    [again, setAgain] = useState('')
  const [err, setErr] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false)
  const close = () => {
    setCur('')
    setPw('')
    setAgain('')
    setErr('')
    setDone(false)
    onClose()
  }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== again) return setErr('The new passwords don’t match. Type the same one twice.')
    setBusy(true)
    setErr('')
    try {
      await send('auth/password', { current: cur, password: pw })
      setDone(true)
    } catch (x) {
      setErr((x as Error).message)
    }
    setBusy(false)
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Change password"
      actions={
        done ? (
          <button className="btn primary" onClick={close}>
            Done
          </button>
        ) : (
          <>
            <button className="btn" onClick={close}>
              Cancel
            </button>
            <button className="btn primary" form="ca2-pw" disabled={busy}>
              Change password
            </button>
          </>
        )
      }
    >
      {done ? (
        <p role="status">Password changed. Your other devices are signed out; this one stays signed in.</p>
      ) : (
        <form id="ca2-pw" className="stack" onSubmit={submit}>
          <PasswordField label="Current password" value={cur} onChange={setCur} autoComplete="current-password" hint={false} autoFocus />
          <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
          <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" hint={false} />
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
        </form>
      )}
    </Modal>
  )
}

/** The header's account menu: name, role, Users (admin), Change password, Link my Authelia account, Sign out. Nothing without accounts. */
export function AccountMenu() {
  const me = useMe()
  const [open, setOpen] = useState(false),
    [pw, setPw] = useState(false),
    [link, setLink] = useState(false)
  const [linked, setLinked] = useState(() => takeLinkNote(me))
  const [leaving, setLeaving] = useState<'no' | 'waiting' | 'stuck'>('no')
  const leave = async (force = false) => {
    setLeaving('waiting')
    if (!(await signOut(force))) setLeaving('stuck')
  }
  const btn = useRef<HTMLButtonElement>(null),
    panel = useId()
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [open])
  if (!me) return null
  // Users and Trash stay on the side the menu is opened from (#/sr6/users, #/sr6/trash on the Shadowrun 6 side)
  const side = gameOf(location.hash.replace(/^#\/?/, '').split('/')) === 'sr6' ? '#/sr6' : '#'
  return (
    <div
      className="account"
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={btn}
        className={`btn quiet ibtn${open ? ' open' : ''}`}
        aria-label={me.name}
        data-tip={`${me.name} (${ROLE_NAMES[me.role]})`}
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen(o => !o)}
      >
        <Icon name="account" />
      </button>
      <div id={panel} className="account-panel" hidden={!open}>
        <p>
          <b>{me.name}</b>
          <br />
          <span className="muted">
            {ROLE_NAMES[me.role]} · {me.username}
          </span>
        </p>
        {me.role === 'admin' && (
          <a className="btn quiet" href={`${side}/users`} onClick={() => setOpen(false)}>
            Users
          </a>
        )}
        <a className="btn quiet" href={`${side}/trash`} onClick={() => setOpen(false)}>
          Trash
        </a>
        {me.method === 'password' && (
          <button
            className="btn quiet"
            onClick={() => {
              setOpen(false)
              setPw(true)
            }}
          >
            Change password
          </button>
        )}
        {me.method === 'password' && oidcOn && (
          <button
            className="btn quiet"
            onClick={() => {
              setOpen(false)
              setLink(true)
            }}
          >
            Link my Authelia account
          </button>
        )}
        <button className="btn quiet" disabled={leaving === 'waiting'} onClick={() => void leave()}>
          {leaving === 'waiting' ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
      <Modal
        open={leaving === 'stuck'}
        onClose={() => setLeaving('no')}
        title="A change is still saving"
        actions={
          <>
            <button className="btn" onClick={() => void leave()}>
              Keep waiting
            </button>
            <button className="btn danger" onClick={() => void leave(true)}>
              Sign out anyway
            </button>
          </>
        }
      >
        <p>A runner’s change hasn’t reached the server after {SIGN_OUT_WAIT / 1000} seconds. Keep waiting, or sign out now and lose that change.</p>
      </Modal>
      <ChangePassword
        open={pw}
        onClose={() => {
          setPw(false)
          btn.current?.focus()
        }}
      />
      <LinkAuthelia
        open={link}
        onClose={() => {
          setLink(false)
          btn.current?.focus()
        }}
      />
      <Modal open={!!linked} onClose={() => setLinked('')} title="Link my Authelia account">
        <p role="status">{linked}</p>
      </Modal>
    </div>
  )
}

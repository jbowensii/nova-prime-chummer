// Users (admin): every account, add one, edit name/username/email/role/sign-in method, disable or enable, reset a password, move
// runners to another account, delete (only with no runners). The server refuses anything that would leave no enabled
// admin; its reason is shown as it comes.
import { useEffect, useState } from 'react'
import { xmlToCharacter } from '../engine'
import { Modal } from './bits'
import { AccountMenu, PasswordField, ROLE_NAMES, send, useMe, type Role, type User } from './auth'
import { SettingsButton } from './settings'

type Account = User & { runners: number }
type Dialog = { at: 'add' } | { at: 'edit' | 'reset' | 'delete' | 'move'; u: Account }
interface Runner { file: string; name: string; owner: string }

const METHOD_NAMES = { password: 'App password', authelia: 'Authelia' }
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never'

function AccountForm({ u, onSaved, onCancel }: { u?: Account; onSaved: (msg: string) => void; onCancel: () => void }) {
  const [f, setF] = useState({ name: u?.name ?? '', username: u?.username ?? '', email: u?.email ?? '', role: u?.role ?? 'player' as Role,
    method: u?.method ?? 'password', password: '' })
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const me = useMe()
  const username = f.username.trim().toLowerCase(), renamed = !!u && username !== u.username
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const { name, email, role, method } = f
      if (u) await send(`users/${u.id}`, { name, email, role, method, ...renamed ? { username } : {} }, 'PUT')
      else await send('users', { ...f, password: method === 'password' ? f.password : undefined })
      // your own username changed: the app reloads so everything (your runners, the menu) goes by the new one
      if (renamed && u.id === me?.id) return location.reload()
      onSaved(u ? `Saved ${name}.${renamed ? ` They sign in as ${username} now.` : ''}` : `Added ${name}. They can sign in as ${username}.`)
    } catch (x) { setErr((x as Error).message) }
    setBusy(false)
  }
  return (
    <form id="ca2-account" className="stack" onSubmit={submit}>
      <div className="grid2">
        <label>Name<input value={f.name} onChange={set('name')} required maxLength={80} autoFocus /></label>
        <label>Username<input value={f.username} onChange={set('username')} required minLength={2} maxLength={32} autoCapitalize="none"
          spellCheck={false} autoComplete="off" /></label>
        <label>Email (optional)<input type="email" value={f.email} onChange={set('email')} autoComplete="off" /></label>
        <label>Role
          <select value={f.role} onChange={set('role')}>
            <option value="player">Player: their own runners</option>
            <option value="editor">Editor: also catalog edits, reads everyone’s runners</option>
            <option value="admin">Admin: everything, including books and users</option>
          </select>
        </label>
        <label>Signs in with
          <select value={f.method} onChange={set('method')}>
            <option value="password">App password</option>
            <option value="authelia">Authelia</option>
          </select>
        </label>
      </div>
      {!u && f.method === 'password' && <PasswordField label="Password" value={f.password} onChange={v => setF({ ...f, password: v })} autoComplete="new-password" />}
      {u && u.method === 'password' && f.method === 'authelia' && <p className="muted">Their app password is removed and they’re signed out.</p>}
      {renamed && <p className="muted">They sign in as {username || '…'} from now on, and their runners move with the account.
        {u.linked && f.method === 'authelia' && ` Their Authelia link is removed: their next Authelia sign-in as ${username || '…'} links it again.`}</p>}
      {u && u.method === 'authelia' && f.method === 'password' && <p className="muted">They can’t sign in until you set a password for them with Reset password after saving.</p>}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" aria-disabled={busy}>{u ? 'Save changes' : 'Add account'}</button>
      </div>
    </form>
  )
}

export function UsersScreen() {
  const me = useMe()
  const [list, setList] = useState<Account[] | null>(null)
  const [runners, setRunners] = useState<Runner[]>([])
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [err, setErr] = useState(''), [pw, setPw] = useState(''), [moveFile, setMoveFile] = useState(''), [moveTo, setMoveTo] = useState('')

  const refresh = async () => {
    try {
      setList(await (await send('users', undefined, 'GET')).json())
      const rows: { file: string; xml: string; owner: string }[] = await (await send('characters', undefined, 'GET')).json()
      setRunners(rows.map(r => { const p = xmlToCharacter(r.xml); return { file: r.file, owner: r.owner,
        name: p.ok ? p.character.identity.streetName || p.character.identity.name || r.file : r.file } }))
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); setList(l => l ?? []) }
  }
  useEffect(() => { void refresh() }, [])

  const open = (d: Dialog) => { setErr(''); setPw(''); setMsg(null); setDialog(d)
    if (d.at === 'move') { setMoveFile(runners.find(r => r.owner === d.u.username)?.file ?? ''); setMoveTo(list?.find(x => x.id !== d.u.id)?.id ?? '') } }
  const close = () => setDialog(null)
  const done = (text: string) => { setDialog(null); setMsg({ text }); void refresh() }
  /** One request from a dialog: its refusal shows in the dialog. */
  const act = async (fn: () => Promise<unknown>, text: string) => {
    setErr('')
    try { await fn(); done(text) } catch (e) { setErr((e as Error).message) }
  }
  const toggle = async (u: Account) => {
    setMsg(null)
    try { await send(`users/${u.id}`, { enabled: !u.enabled }, 'PUT'); setMsg({ text: `${u.name} is ${u.enabled ? 'disabled and signed out' : 'enabled again'}.` }) }
    catch (e) { setMsg({ text: `Couldn’t ${u.enabled ? 'disable' : 'enable'} ${u.name}. ${(e as Error).message}`, err: true }) }
    void refresh()
  }

  // the account forgets which Authelia user it belongs to: the next Authelia sign-in with its username links it again
  const unlink = async (u: Account) => {
    setMsg(null)
    try { await send(`users/${u.id}/unlink`); setMsg({ text: `${u.name} is unlinked from Authelia. The next Authelia sign-in as ${u.username} links it again.` }) }
    catch (e) { setMsg({ text: `Couldn’t unlink ${u.name}. ${(e as Error).message}`, err: true }) }
    void refresh()
  }
  const d = dialog
  const theirs = d && d.at !== 'add' ? runners.filter(r => r.owner === d.u.username) : []
  return (
    <main className="lib">
      <header>
        <div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>Users</h1></div>
        <div className="row"><button className="btn primary" onClick={() => open({ at: 'add' })}>Add account</button>
          <a className="btn quiet" href="#/">Your runners</a><SettingsButton /><AccountMenu /></div>
      </header>
      <p className="muted">Admins manage books, backups and accounts. Editors can also change the catalog and read everyone’s runners.
        Players see only their own runners.</p>
      {msg && <p className={`banner${msg.err ? ' bad' : ''}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}
      {list === null ? <p className="muted">Loading accounts…</p> : (
        <div className="scroll-x">
          <table className="data users">
            <thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Signs in with</th><th>Status</th><th>Last sign-in</th>
              <th className="num">Runners</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map(u => (
                <tr key={u.id} className={u.enabled ? undefined : 'off'}>
                  <td><b>{u.name}</b>{u.id === me?.id && <span className="muted"> (you)</span>}</td>
                  <td>{u.username}</td><td>{u.email ?? <span className="muted">None</span>}</td><td>{ROLE_NAMES[u.role]}</td>
                  <td>{METHOD_NAMES[u.method]}{u.method === 'authelia' && <span className="muted">{u.linked ? ' (linked)' : ' (not signed in yet)'}</span>}</td><td>{u.enabled ? 'Enabled' : 'Disabled'}</td><td>{when(u.lastLogin)}</td>
                  <td className="num">{u.runners}</td>
                  <td><div className="row">
                    <button className="btn small" aria-label={`Edit ${u.name}`} onClick={() => open({ at: 'edit', u })}>Edit</button>
                    {u.method === 'password' && <button className="btn small quiet" aria-label={`Reset ${u.name}’s password`} onClick={() => open({ at: 'reset', u })}>Reset password</button>}
                    <button className="btn small quiet" aria-label={`${u.enabled ? 'Disable' : 'Enable'} ${u.name}`} onClick={() => void toggle(u)}>{u.enabled ? 'Disable' : 'Enable'}</button>
                    {u.linked && <button className="btn small quiet" aria-label={`Unlink ${u.name} from Authelia`} onClick={() => void unlink(u)}>Unlink Authelia</button>}
                    {u.runners > 0 && <button className="btn small quiet" aria-label={`Move ${u.name}’s runners`} onClick={() => open({ at: 'move', u })}>Move runners</button>}
                    <button className="btn small quiet" aria-label={`Delete ${u.name}`} onClick={() => open({ at: 'delete', u })}>Delete</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={d?.at === 'add' || d?.at === 'edit'} onClose={close} title={d?.at === 'edit' ? `Edit ${d.u.name}` : 'Add account'} actions={<></>}>
        {(d?.at === 'add' || d?.at === 'edit') && <AccountForm key={d.at === 'edit' ? d.u.id : 'new'} u={d.at === 'edit' ? d.u : undefined} onSaved={done} onCancel={close} />}
      </Modal>

      <Modal open={d?.at === 'reset'} onClose={close} title={d?.at === 'reset' ? `Reset ${d.u.name}’s password` : ''}
        actions={<><button className="btn" onClick={close}>Cancel</button><button className="btn primary" form="ca2-reset">Set password</button></>}>
        {d?.at === 'reset' && <form id="ca2-reset" className="stack" onSubmit={e => { e.preventDefault()
          void act(() => send(`users/${d.u.id}/reset-password`, { password: pw }), `${d.u.name} has a new password and is signed out everywhere. Tell them the new one.`) }}>
          <p>They’re signed out on every device and sign in with this password next.</p>
          <PasswordField label="New password" value={pw} onChange={setPw} autoComplete="new-password" autoFocus />
          {err && <p className="err" role="alert">{err}</p>}
        </form>}
      </Modal>

      <Modal open={d?.at === 'move'} onClose={close} title={d?.at === 'move' ? `Move ${d.u.name}’s runners` : ''}
        actions={<><button className="btn" onClick={close}>Close</button><button className="btn primary" form="ca2-move">Move runner</button></>}>
        {d?.at === 'move' && <form id="ca2-move" className="stack" onSubmit={e => { e.preventDefault()
          const r = theirs.find(x => x.file === moveFile), to = list?.find(x => x.id === moveTo)
          if (r && to) void act(() => send(`users/${d.u.id}/move-runner`, { file: r.file, to: to.id }), `Moved ${r.name} to ${to.name}.`) }}>
          {theirs.length === 0 ? <p>{d.u.name} has no runners left.</p> : <>
            <label>Runner<select value={moveFile} onChange={e => setMoveFile(e.target.value)} autoFocus>
              {theirs.map(r => <option key={r.file} value={r.file}>{r.name} ({r.file})</option>)}</select></label>
            <label>Move to<select value={moveTo} onChange={e => setMoveTo(e.target.value)}>
              {list?.filter(x => x.id !== d.u.id).map(x => <option key={x.id} value={x.id}>{x.name} ({x.username})</option>)}</select></label>
          </>}
          {err && <p className="err" role="alert">{err}</p>}
        </form>}
      </Modal>

      <Modal open={d?.at === 'delete'} onClose={close} title={d?.at === 'delete' ? `Delete ${d.u.name}?` : ''}
        actions={d?.at === 'delete' && d.u.runners > 0 ? <><button className="btn" onClick={close}>Close</button>
          <button className="btn primary" onClick={() => open({ at: 'move', u: d.u })}>Move runners</button></>
          : <><button className="btn" onClick={close}>Keep</button>
            <button className="btn danger" onClick={() => d?.at === 'delete' && void act(() => send(`users/${d.u.id}`, undefined, 'DELETE'), `Deleted ${d.u.name}’s account.`)}>Delete account</button></>}>
        {d?.at === 'delete' && (d.u.runners > 0
          ? <p>{d.u.name} still has {d.u.runners} runner{d.u.runners === 1 ? '' : 's'}. Move them to another account first, then delete this one.</p>
          : <p>{d.u.name} can’t sign in any more. Their deleted runners are kept in <code>characters/.trash</code>.</p>)}
        {err && <p className="err" role="alert">{err}</p>}
      </Modal>
    </main>
  )
}

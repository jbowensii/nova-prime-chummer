// The Trash page (server only; the browser's own storage deletes for good): the runners an account deleted, from
// characters/<username>/.trash/ (server.mjs /api/trash). Restore puts one back in its owner's library, as a copy with a
// new id when that id is taken; Delete forever and Empty trash can't be undone. The admin opens anyone's (#/trash/<username>).
import { useEffect, useState } from 'react'
import { AccountMenu, because, isAdmin, send, useMe } from './auth'
import { Brand, Modal } from './bits'
import { SettingsButton } from './settings'
import { AskButton } from './AskRules'

export interface TrashItem { file: string; id: string; name: string; deletedAt: string }
interface Trash { user: string; name: string; items: TrashItem[] }

const q = (user?: string) => (user ? `?user=${encodeURIComponent(user)}` : '')
/** An account's trash (default: your own). */
export const loadTrash = async (user?: string): Promise<Trash> => (await send(`trash${q(user)}`, undefined, 'GET')).json()
export const runners = (n: number) => `${n} runner${n === 1 ? '' : 's'}`
/** What a restore says: `r` is the server's answer (copy: the id was taken, so it came back as a copy). */
export const restored = (was: string, r: { name: string; copy: boolean }, whose: string) => r.copy
  ? `Restored ${was} to ${whose} as “${r.name}”: a runner with the same id is already there, so this is a copy with a new id.`
  : `Restored ${was} to ${whose}.`
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function TrashScreen({ user: asked }: { user?: string }) {
  const me = useMe(), admin = isAdmin(me)
  const user = admin && asked && asked !== me?.username ? asked : undefined // someone else's: the admin only
  const [trash, setTrash] = useState<Trash | null>(null)
  const [accounts, setAccounts] = useState<{ username: string; name: string }[]>([])
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [confirm, setConfirm] = useState<TrashItem | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => loadTrash(user).then(setTrash, e => { setMsg({ text: because('Couldn’t open the trash', (e as Error).message), err: true }); setTrash({ user: user ?? '', name: '', items: [] }) })
  useEffect(() => { setMsg(null); setTrash(null); void refresh() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (admin) send('users', undefined, 'GET').then(r => r.json()).then(setAccounts, () => {})
  }, [admin])

  const own = !user
  const whose = own ? 'your library' : `${trash?.name ?? user}’s library`
  const act = async (fn: () => Promise<string>, failed: string) => {
    setBusy(true); setMsg(null)
    try { setMsg({ text: await fn() }) } catch (e) { setMsg({ text: because(failed, (e as Error).message), err: true }) }
    setBusy(false); setConfirm(null); void refresh()
  }
  const restore = (t: TrashItem) => act(async () => {
    const r: { name: string; copy: boolean } = await (await send(`trash/${encodeURIComponent(t.file)}/restore${q(user)}`)).json()
    return restored(t.name, r, whose)
  }, `Couldn’t restore ${t.name}`)
  const erase = (t: TrashItem) => act(async () => { await send(`trash/${encodeURIComponent(t.file)}${q(user)}`, undefined, 'DELETE'); return `Deleted ${t.name} for good.` },
    `Couldn’t delete ${t.name}`)
  const empty = () => act(async () => { const { deleted } = await (await send(`trash${q(user)}`, { files: items.map(t => t.file) }, 'DELETE')).json(); return `Emptied the trash: ${runners(deleted)} deleted for good.` },
    'Couldn’t empty the trash')

  const items = trash?.items ?? []
  return (
    <main className="lib">
      <header>
        <div style={{ flex: 1 }}><Brand />
          <h1>{own ? 'Trash' : `${trash?.name ?? user}’s trash`}</h1></div>
        <div className="row">
          {admin && accounts.length > 1 && <label>Account{' '}
            <select value={user ?? me?.username} onChange={e => { location.hash = e.target.value === me?.username ? '#/trash' : `#/trash/${encodeURIComponent(e.target.value)}` }}>
              {accounts.map(a => <option key={a.username} value={a.username}>{a.name} ({a.username})</option>)}
            </select></label>}
          <a className="btn quiet" href="#/">Your runners</a><AskButton /><SettingsButton /><AccountMenu />
        </div>
      </header>
      <p className="muted">Deleted runners wait here until {own ? 'you restore them or empty the trash' : 'they’re restored or the trash is emptied'}.
        Restore puts one back in {whose}.</p>
      {msg && <p className={`banner${msg.err ? ' bad' : ''}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}
      {trash === null ? <p className="muted">Loading the trash…</p> : items.length === 0 ? <div className="empty"><p>The trash is empty.</p></div> : <>
        <p className="row"><button className="btn danger" disabled={busy} onClick={() => setConfirm('all')}>Empty trash</button></p>
        <ul className="trash" aria-label="Deleted runners">
          {items.map(t => <li className="dossier" key={t.file}>
            <span className="face" aria-hidden>{t.name[0] ?? '?'}</span>
            <div><span className="title">{t.name}</span><div className="meta">Deleted <time dateTime={t.deletedAt}>{when(t.deletedAt)}</time></div></div>
            <div className="row">
              <button className="btn small" disabled={busy} aria-label={`Restore ${t.name}`} onClick={() => void restore(t)}>Restore</button>
              <button className="btn small quiet" disabled={busy} aria-label={`Delete ${t.name} forever`} onClick={() => setConfirm(t)}>Delete forever</button>
            </div>
          </li>)}
        </ul>
      </>}
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm === 'all' ? 'Empty the trash?' : `Delete ${confirm?.name} forever?`}
        actions={<><button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn danger" disabled={busy} onClick={() => void (confirm === 'all' ? empty() : erase(confirm!))}>
            {confirm === 'all' ? 'Empty trash' : 'Delete forever'}</button></>}>
        <p>{confirm === 'all' ? `Permanently delete ${runners(items.length)}? This can’t be undone.` : 'This can’t be undone.'}</p>
      </Modal>
    </main>
  )
}

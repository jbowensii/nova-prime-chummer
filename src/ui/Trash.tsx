// The Trash page (server only; the browser's own storage deletes for good): the runners an account deleted, from
// characters/<username>/.trash/ (server.mjs /api/trash). Restore puts one back in its owner's library, as a copy with a
// new id when that id is taken; Delete forever and Empty trash can't be undone. The admin opens anyone's (#/trash/<username>).
// The NPC area's trash (`npcs`: /api/npcs/trash, #/npcs/trash[/<username>]) is the same page for NPCs.
import { PageHeader } from './nav'
import { useEffect, useState } from 'react'
import { because, isAdmin, send, useMe } from './auth'
import { Modal } from './bits'

export interface TrashItem { file: string; id: string; name: string; deletedAt: string }
interface Trash { user: string; name: string; items: TrashItem[] }

const q = (user?: string) => (user ? `?user=${encodeURIComponent(user)}` : '')
/** An account's trash (default: your own); `npcs`: its NPC trash. */
export const loadTrash = async (user?: string, npcs = false): Promise<Trash> => (await send(`${npcs ? 'npcs/' : ''}trash${q(user)}`, undefined, 'GET')).json()
export const runners = (n: number, noun = 'runner') => `${n} ${noun}${n === 1 ? '' : 's'}`
/** What a restore says: `r` is the server's answer (copy: the id was taken, so it came back as a copy). */
export const restored = (was: string, r: { name: string; copy: boolean }, whose: string, noun = 'runner') => r.copy
  ? `Restored ${was} to ${whose} as “${r.name}”: a${noun === 'NPC' ? 'n' : ''} ${noun} with the same id is already there, so this is a copy with a new id.`
  : `Restored ${was} to ${whose}.`
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function TrashScreen({ user: asked, npcs = false }: { user?: string; npcs?: boolean }) {
  const noun = npcs ? 'NPC' : 'runner', api = npcs ? 'npcs/trash' : 'trash', home = npcs ? '#/npcs/trash' : '#/trash'
  const me = useMe(), admin = isAdmin(me)
  const user = admin && asked && asked !== me?.username ? asked : undefined // someone else's: the admin only
  const [trash, setTrash] = useState<Trash | null>(null)
  const [accounts, setAccounts] = useState<{ username: string; name: string }[]>([])
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [confirm, setConfirm] = useState<TrashItem | 'all' | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = () => loadTrash(user, npcs).then(setTrash, e => { setMsg({ text: because('Couldn’t open the trash', (e as Error).message), err: true }); setTrash({ user: user ?? '', name: '', items: [] }) })
  useEffect(() => { setMsg(null); setTrash(null); void refresh() }, [user, npcs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (admin) send('users', undefined, 'GET').then(r => r.json()).then(setAccounts, () => {})
  }, [admin])

  const own = !user
  const whose = npcs ? (own ? 'your NPCs' : `${trash?.name ?? user}’s NPCs`) : own ? 'your library' : `${trash?.name ?? user}’s library`
  const act = async (fn: () => Promise<string>, failed: string) => {
    setBusy(true); setMsg(null)
    try { setMsg({ text: await fn() }) } catch (e) { setMsg({ text: because(failed, (e as Error).message), err: true }) }
    setBusy(false); setConfirm(null); void refresh()
  }
  const restore = (t: TrashItem) => act(async () => {
    const r: { name: string; copy: boolean } = await (await send(`${api}/${encodeURIComponent(t.file)}/restore${q(user)}`)).json()
    return restored(t.name, r, whose, noun)
  }, `Couldn’t restore ${t.name}`)
  const erase = (t: TrashItem) => act(async () => { await send(`${api}/${encodeURIComponent(t.file)}${q(user)}`, undefined, 'DELETE'); return `Deleted ${t.name} for good.` },
    `Couldn’t delete ${t.name}`)
  const empty = () => act(async () => { const { deleted } = await (await send(`${api}${q(user)}`, { files: items.map(t => t.file) }, 'DELETE')).json(); return `Emptied the trash: ${runners(deleted, noun)} deleted for good.` },
    'Couldn’t empty the trash')

  const items = trash?.items ?? []
  return (
    <main className="lib">
      <PageHeader title={npcs ? (own ? 'NPC trash' : `${trash?.name ?? user}’s NPC trash`) : own ? 'Trash' : `${trash?.name ?? user}’s trash`}>
          {admin && accounts.length > 1 && <label className="inline">Account{' '}
            <select value={user ?? me?.username} onChange={e => { location.hash = e.target.value === me?.username ? home : `${home}/${encodeURIComponent(e.target.value)}` }}>
              {accounts.map(a => <option key={a.username} value={a.username}>{a.name} ({a.username})</option>)}
            </select></label>}
      </PageHeader>
      <p className="muted">Deleted {noun}s wait here until {own ? 'you restore them or empty the trash' : 'they’re restored or the trash is emptied'}.
        Restore puts one back in {whose}.</p>
      {msg && <p className={`banner${msg.err ? ' bad' : ''}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}
      {trash === null ? <p className="muted">Loading the trash…</p> : items.length === 0 ? <div className="empty"><p>The trash is empty.</p></div> : <>
        <p className="row"><button className="btn danger" disabled={busy} onClick={() => setConfirm('all')}>Empty trash</button></p>
        <ul className="trash" aria-label={`Deleted ${noun}s`}>
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
        <p>{confirm === 'all' ? `Permanently delete ${runners(items.length, noun)}? This can’t be undone.` : 'This can’t be undone.'}</p>
      </Modal>
    </main>
  )
}

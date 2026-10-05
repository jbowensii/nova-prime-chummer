// Campaigns (server/campaigns.mjs; spec docs/superpowers/specs/2026-09-29-campaigns-ask-rules-design.md §2): the list of
// the caller's campaigns, and one campaign's page — its runners grouped by player (the GM and the admin open them read-only
// and print them; a member sees roster rows), who plays, and the GM's tools. The server enforces every rule; hiding a
// control here is only convenience. `game`: Shadowrun 6's campaigns are the same pages over /api/sr6/campaigns, linking
// under #/sr6 (its runners open at #/sr6/c/<id>, its NPCs at #/sr6/n/<id>); a campaign holds only its own game's.
import { PageHeader } from './nav'
import { IconButton } from './icons'
import { useEffect, useId, useState } from 'react'
import { because, canEdit, send, useMe, type User } from './auth'
import { AskRules } from './AskRules'
import { Modal } from './bits'
import type { Game } from './game'
import type { Override } from '../model/types'

export interface Person { username?: string; name: string }
export interface CampaignRunner { key: string; mine: boolean; ownerName: string; streetName: string; level: string; package: string; id?: string; owner?: string }
export interface Campaign { id: string; name: string; note: string; archived: boolean; created: string; you: 'gm' | 'admin' | 'member'
  gms: Person[]; members: Person[]; runners: CampaignRunner[]
  npcs?: { id: string; name: string; owner: string; ownerName: string }[] // the NPCs shared with it: the GM's and the admin's view only
  creation?: { key: string; value: string; source?: string; page?: number }[] | null } // SR6: its own creation settings (null: the server's)

/** `game`'s campaign API paths (for send) and page links. */
export function campaignLinks(game: Game = 'ca2') {
  const sr6 = game === 'sr6', home = sr6 ? '#/sr6/' : '#/'
  return { api: (rest = '') => `${sr6 ? 'sr6/' : ''}campaigns${rest}`, list: `${home}campaigns`, campaign: (id: string) => `${home}campaigns/${id}`,
    runner: (id: string, tab: string) => `${home}c/${id}/${tab}`, npc: (id: string) => sr6 ? `#/sr6/n/${id}/stats` : `#/n/${id}/concept` }
}
/** The caller's campaigns of `game` (Shadowrun 6's at /api/sr6/campaigns). */
export const loadCampaigns = async (game: Game = 'ca2'): Promise<Campaign[]> => (await send(campaignLinks(game).api(), undefined, 'GET')).json()
/** A GM's (or the admin's) approvals on another account's runner in a campaign they run, replaced on the server (the
 *  runner stays its player's; only its GMs and the admin may). */
export const approveRunner = (game: Game, campaign: string, runner: string, overrides: Override[]) =>
  send(campaignLinks(game).api(`/${campaign}/runners/${encodeURIComponent(runner)}/overrides`), { overrides }, 'PUT')
/** Whether `me` plays in or runs `c` (only then can they put a runner in it); the admin sees every campaign without being in it. */
export const joined = (c: Campaign, me: User | null) => c.you !== 'admin' || [...c.gms, ...c.members].some(p => p.username === me?.username)
const names = (ps: Person[]) => ps.map(p => p.name).join(', ')

function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <PageHeader title={title}>{children}</PageHeader>
  )
}

/** Name and note: a new campaign, or the GM's edit of one. */
function CampaignForm({ c, game, onDone, onCancel }: { c?: Campaign; game?: Game; onDone: (c: Campaign) => void; onCancel: () => void }) {
  const [name, setName] = useState(c?.name ?? ''), [note, setNote] = useState(c?.note ?? '')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try { onDone(await (await send(campaignLinks(game).api(c ? `/${c.id}` : ''), { name, note }, c ? 'PUT' : 'POST')).json()) }
    catch (x) { setErr((x as Error).message); setBusy(false) }
  }
  return (
    <form className="stack" onSubmit={e => void submit(e)}>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoFocus /></label>
      <label>Note for the table (optional)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={4000} /></label>
      {err && <p className="err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" aria-disabled={busy}>{c ? 'Save changes' : 'Create campaign'}</button>
      </div>
    </form>
  )
}

export function CampaignsScreen({ game = 'ca2' }: { game?: Game }) {
  const me = useMe(), L = campaignLinks(game)
  const [list, setList] = useState<Campaign[] | null>(null)
  const [msg, setMsg] = useState('')
  const [archived, setArchived] = useState(false)
  const [creating, setCreating] = useState(false)
  useEffect(() => { loadCampaigns(game).then(setList, e => { setMsg(because('Couldn’t load the campaigns', (e as Error).message)); setList([]) }) }, [game])
  const shown = (list ?? []).filter(x => archived || !x.archived)
  const staff = canEdit(me)
  return (
    <main className="lib">
      <Header title="Campaigns">{staff && <IconButton className="primary" icon="campaign-add" label="New campaign" onClick={() => setCreating(true)} />}</Header>
      <p className="muted">{staff ? 'Run a campaign: add your players, and they put their runners in it. You can read and print the runners in the campaigns you run.'
        : 'The campaigns you play in. Put a runner in one from your runner list; the GM can then read and print it.'}</p>
      {msg && <p className="banner bad" role="alert">{msg}</p>}
      {list === null ? <p className="muted">Loading campaigns…</p> : <>
        {list.some(x => x.archived) && <label className="check inline"><input type="checkbox" checked={archived} onChange={e => setArchived(e.target.checked)} /> Show archived campaigns</label>}
        {shown.length === 0 ? <div className="empty"><p>{staff ? 'No campaigns yet. Start one, then add your players.' : 'You’re not in a campaign yet. A GM adds you to theirs.'}</p></div> : (
          <div className="scroll-x">
            <table className="data campaigns">
              <thead><tr><th>Campaign</th><th>GM</th><th className="num">Players</th><th className="num">Runners</th></tr></thead>
              <tbody>{shown.map(x => (
                <tr key={x.id} className={x.archived ? 'off' : undefined}>
                  <td><a href={L.campaign(x.id)}><b>{x.name}</b></a>{x.archived && <> <span className="state removed">Archived</span></>}</td>
                  <td>{names(x.gms)}</td><td className="num">{x.members.length}</td><td className="num">{x.runners.length}</td>
                </tr>))}
              </tbody>
            </table>
          </div>)}
      </>}
      <Modal open={creating} onClose={() => setCreating(false)} title="New campaign" actions={<></>}>
        {creating && <CampaignForm game={game} onCancel={() => setCreating(false)} onDone={x => { location.hash = L.campaign(x.id) }} />}
      </Modal>
    </main>
  )
}

type Confirm = { title: string; body: string; label: string; run: () => Promise<unknown> }

/** `label`: a runner row's line under its name (Anarchy: its package and level); `extra`: a game's own section after the
 *  runners (SR6: its creation rules), given the campaign and a way to put back the one a change returns. */
export function CampaignScreen({ id, label, game = 'ca2', extra }: { id: string; label: (r: CampaignRunner) => string; game?: Game
  extra?: (camp: Campaign, set: (c: Campaign) => void) => React.ReactNode }) {
  const me = useMe(), L = campaignLinks(game)
  const [camp, setCamp] = useState<Campaign | null>(null)
  const [missing, setMissing] = useState('')
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [player, setPlayer] = useState(''), [coGm, setCoGm] = useState('')
  const [accounts, setAccounts] = useState<User[]>([]) // the admin's: names to pick from
  const listId = useId()
  useEffect(() => {
    send(L.api(`/${id}`), undefined, 'GET').then(r => r.json()).then(setCamp, e => setMissing((e as Error).message))
    if (me?.role === 'admin') send('users', undefined, 'GET').then(r => r.json()).then(setAccounts, () => {})
  }, [id, me, game]) // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) return <main className="lib"><Header title="Campaign" /><p className="banner bad" role="alert">{missing}</p><p><a href={L.list}>Back to campaigns</a></p></main>
  if (!camp) return <main className="lib"><p className="muted">Loading campaign…</p></main>

  const manages = camp.you !== 'member', admin = me?.role === 'admin'
  /** One change: the campaign as the server now has it, or its refusal. */
  const act = async (path: string, method: string, body?: unknown, done?: string) => {
    setMsg(null)
    try {
      const r = await send(L.api(`/${id}${path}`), body, method)
      if (r.status === 204) { location.hash = L.list; return true }
      setCamp(await r.json())
      if (done) setMsg({ text: done })
      return true
    } catch (e) { setMsg({ text: (e as Error).message, err: true }); return false }
  }
  const groups = new Map<string, CampaignRunner[]>()
  // by owner: the username (GM, admin), else the name (a member's roster has no usernames; their own runners are `mine`)
  for (const r of camp.runners) { const k = r.owner ? `u:${r.owner}` : r.mine ? 'me' : `n:${r.ownerName}`; groups.set(k, [...groups.get(k) ?? [], r]) }
  const staffAccounts = accounts.filter(u => u.role !== 'player' && !camp.gms.some(g => g.username === u.username))

  return (
    <main className="lib campaign">
      <Header title={camp.name} />
      <p className="muted">GM: {names(camp.gms)} · {camp.members.length} player{camp.members.length === 1 ? '' : 's'}
        {camp.archived && <> <span className="state removed">Archived</span></>}</p>
      {camp.note && <p className="campaign-note">{camp.note}</p>}
      {msg && <p className={`banner${msg.err ? ' bad' : ''}`} role={msg.err ? 'alert' : 'status'}>{msg.text}</p>}

      <section aria-labelledby={`${listId}-r`}>
        <h2 id={`${listId}-r`}>Runners</h2>
        {game === 'ca2' && <AskRules />}
        {camp.runners.length === 0 ? <p className="empty-note">No runners in this campaign yet. Players add theirs from their runner list with <b>Add to campaign…</b></p>
          : [...groups].map(([owner, rows]) => <div key={owner} className="cgroup">
            <h3>{rows[0].ownerName}</h3>
            {rows.map(r => {
              const open = r.id && (r.mine || manages)
              return <div className="dossier" key={r.key}>
                <span className="face" aria-hidden>{r.streetName[0]}</span>
                <div>
                  {open ? <a className="title" href={L.runner(r.id!, 'concept')}>{r.streetName}</a> : <span className="title">{r.streetName}</span>}
                  <div className="meta">{label(r)}</div>
                </div>
                <div className="row">
                  {open && !r.mine && <a className="btn small" href={L.runner(r.id!, 'print')} aria-label={`Print ${r.streetName}`}>Print</a>}
                  {r.id && (r.mine || manages) && <button className="btn small quiet" aria-label={`Remove ${r.streetName} from the campaign`}
                    onClick={() => void act(`/runners/${encodeURIComponent(r.id!)}`, 'DELETE', undefined, `${r.streetName} left the campaign.`)}>Remove from campaign</button>}
                </div>
              </div>
            })}
          </div>)}
      </section>

      {extra?.(camp, setCamp)}

      {manages && !!camp.npcs?.length && <section aria-labelledby={`${listId}-n`}>
        <h2 id={`${listId}-n`}>NPCs</h2>
        <ul className="roster">{camp.npcs.map(n => <li key={n.id}><a href={L.npc(n.id)}>{n.name}</a><span className="muted"> · {n.ownerName}</span></li>)}</ul>
      </section>}

      <section aria-labelledby={`${listId}-t`}>
        <h2 id={`${listId}-t`}>The table</h2>
        <h3>{camp.gms.length === 1 ? 'Game master' : 'Game masters'}</h3>
        <ul className="roster">{camp.gms.map(p => <li key={p.username ?? p.name}><span>{p.name}{p.username && <span className="muted"> · {p.username}</span>}</span>
          {manages && camp.gms.length > 1 && p.username && <button className="btn small quiet" aria-label={`Remove ${p.name} as GM`}
            onClick={() => void act(`/gms/${encodeURIComponent(p.username!)}`, 'DELETE', undefined, `${p.name} is no longer a GM here.`)}>Remove</button>}</li>)}
        </ul>
        <h3>Players</h3>
        {camp.members.length === 0 ? <p className="muted">No players yet.</p> : <ul className="roster">{camp.members.map(p => <li key={p.username ?? p.name}>
          <span>{p.name}{p.username && <span className="muted"> · {p.username}</span>}</span>
          {manages && p.username && <button className="btn small quiet" aria-label={`Remove ${p.name}`} onClick={() => setConfirm({ title: `Remove ${p.name}?`,
            body: `${p.name} leaves ${camp.name}, and their runners leave it too. The runners stay theirs.`, label: 'Remove player',
            run: () => act(`/members/${encodeURIComponent(p.username!)}`, 'DELETE', undefined, `${p.name} left the campaign.`) })}>Remove</button>}</li>)}
        </ul>}
        {manages && <form className="row addrow" onSubmit={e => { e.preventDefault(); if (player.trim()) void act('/members', 'POST', { user: player.trim() }, `Added ${player.trim()}.`).then(ok => ok && setPlayer('')) }}>
          <label>Add a player by username<input value={player} onChange={e => setPlayer(e.target.value)} list={admin ? `${listId}-u` : undefined}
            autoCapitalize="none" spellCheck={false} autoComplete="off" /></label>
          <button className="btn">Add player</button>
          {admin && <datalist id={`${listId}-u`}>{accounts.map(u => <option key={u.id} value={u.username}>{u.name}</option>)}</datalist>}
        </form>}
        {admin && staffAccounts.length > 0 && <form className="row addrow" onSubmit={e => { e.preventDefault(); if (coGm) void act('/gms', 'POST', { user: coGm }, 'Added a co-GM.').then(ok => ok && setCoGm('')) }}>
          <label>Add a co-GM<select value={coGm} onChange={e => setCoGm(e.target.value)}>
            <option value="">Choose an admin or editor</option>
            {staffAccounts.map(u => <option key={u.id} value={u.username}>{u.name} ({u.username})</option>)}</select></label>
          <button className="btn" disabled={!coGm}>Add co-GM</button>
        </form>}
      </section>

      {manages && <section aria-labelledby={`${listId}-g`}>
        <h2 id={`${listId}-g`}>GM tools</h2>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>Rename or edit the note</button>
          <button className="btn" onClick={() => void act('', 'PUT', { archived: !camp.archived }, camp.archived ? 'The campaign is active again.' : 'The campaign is archived: no runners can join it.')}>
            {camp.archived ? 'Unarchive' : 'Archive'}</button>
          <button className="btn danger" disabled={camp.runners.length > 0} onClick={() => setConfirm({ title: `Delete ${camp.name}?`,
            body: 'The campaign goes for good. Nobody’s runners change.', label: 'Delete campaign', run: () => act('', 'DELETE') })}>Delete campaign</button>
        </div>
        {camp.runners.length > 0 && <p className="muted">A campaign can be deleted once no runners are in it.</p>}
      </section>}

      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${camp.name}`} actions={<></>}>
        {editing && <CampaignForm c={camp} game={game} onCancel={() => setEditing(false)} onDone={x => { setCamp(x); setEditing(false); setMsg({ text: 'Saved.' }) }} />}
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}
        actions={<><button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
          <button className="btn danger" onClick={() => { const r = confirm!.run; setConfirm(null); void r() }}>{confirm?.label}</button></>}>
        <p>{confirm?.body}</p>
      </Modal>
    </main>
  )
}

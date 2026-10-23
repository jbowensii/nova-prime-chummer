// Setup (#/setup/<tab>): the screen before a game, admin only (the server refuses everyone else: /api/setup-config).
// Tabs: Configuration (Config/options.json), Backups, Updates (shell: electron-updater is Phase 6), Game Systems (read only:
// install/enable/disable is Phase 3). Server: server/setupcfg.mjs.
import { useEffect, useState } from 'react'
import { api } from '../ui-kit/api'
import { RepoContext, type Repo } from '../ui-kit/repoContext'
import { BackupSettings } from '../../features/backup/Backup'

type Value = string | number | boolean | null
interface Setting {
  key: string
  type: 'text' | 'bool' | 'number' | 'choice'
  options?: string[]
  value: Value
  source: 'flag' | 'env' | 'file' | 'default'
  later: boolean
  readonly?: boolean
}
interface View {
  file: string
  version: string
  desktop: boolean
  settings: Setting[]
  systems: { id: string; game: string; version: string; status: string }[]
  backups: { name: string; bytes: number; created: string }[]
}
const TABS: [string, string][] = [
  ['configuration', 'Configuration'],
  ['backups', 'Backups'],
  ['updates', 'Updates'],
  ['systems', 'Game Systems'],
]
const SOURCE = { flag: 'command-line flag', env: 'environment variable', file: 'options.json', default: 'default' }
const mb = (b: number) => `${Math.max(1, Math.round(b / 1024 ** 2))} MB`
/** The text a setting's field starts with; null (off) stays null. */
const draftOf = (s: Setting): string | boolean | null => (s.value === null ? null : s.type === 'bool' ? !!s.value : String(s.value))
const drafts = (v: View) => Object.fromEntries(v.settings.map(s => [s.key, draftOf(s)]))
const JSON_HEADERS = { 'Content-Type': 'application/json' }

function Configuration({ view, reload }: { view: View; reload: (v: View) => void }) {
  const [draft, setDraft] = useState(() => drafts(view))
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const put = async (body: unknown, done: string) => {
    setMsg(null)
    try {
      const v = await api<View>('setup-config', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(body) })
      reload(v)
      setDraft(drafts(v))
      setMsg({ text: done })
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true })
    }
  }
  const save = () => {
    const set: Record<string, Value> = {}
    for (const s of view.settings) {
      const d = draft[s.key]
      if (d === draftOf(s)) continue
      set[s.key] = d === null || d === '' ? null : s.type === 'number' ? Number(d) : d
    }
    if (!Object.keys(set).length) return setMsg({ text: 'Nothing changed.' })
    return put({ set }, 'Saved to Config/options.json. Restart the app for it to take effect.')
  }
  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        void save()
      }}
    >
      <p className="muted">
        Settings live in <code>{view.file}</code>. Turning a setting off writes <code>null</code>, which stays off instead of falling back to its default. A
        command-line flag or environment variable overrides the file.
      </p>
      {view.settings.map(s => {
        const d = draft[s.key],
          id = `cfg-${s.key}`
        const set = (v: string | boolean | null) => setDraft({ ...draft, [s.key]: v })
        return (
          <div className="field" key={s.key}>
            <label htmlFor={id}>{s.key}</label>
            {s.readonly ? (
              <input id={id} type="text" value={s.value === null ? '' : String(s.value)} readOnly />
            ) : s.type === 'bool' ? (
              <input id={id} type="checkbox" checked={!!d} onChange={e => set(e.target.checked)} />
            ) : s.type === 'choice' ? (
              <select id={id} value={String(d)} onChange={e => set(e.target.value)}>
                {s.options!.map(o => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <span className="row">
                <input
                  id={id}
                  type={s.type === 'number' ? 'number' : 'text'}
                  value={d === null ? '' : String(d)}
                  disabled={d === null}
                  onChange={e => set(e.target.value)}
                />
                <label className="check inline">
                  <input type="checkbox" aria-label={`${s.key} off`} checked={d === null} onChange={e => set(e.target.checked ? null : '')} />
                  Off
                </label>
              </span>
            )}
            <small className="muted">
              Now: {s.value === null ? 'off' : String(s.value)} (from {SOURCE[s.source]})
              {s.source === 'file' && (
                <>
                  {' '}
                  <button type="button" className="btn quiet" onClick={() => void put({ reset: [s.key] }, `${s.key} is back to its default.`)}>
                    Use default
                  </button>
                </>
              )}
              {(s.source === 'flag' || s.source === 'env') && ' — overrides the file while it is set'}
              {s.later ? ' — takes effect in a later phase' : s.readonly ? ' — set by the installer' : ' — takes effect after a restart'}
            </small>
          </div>
        )
      })}
      <div className="row">
        <button className="btn" type="submit">
          Save settings
        </button>
      </div>
      <div role="status" aria-live="polite">
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
    </form>
  )
}

function Backups({ view, repo }: { view: View; repo: Repo }) {
  return (
    <>
      <h2>Safety backups</h2>
      <p className="muted">A restore saves the current data first in Backups/. The newest 3 are kept.</p>
      {view.backups.length ? (
        <ul>
          {view.backups.map(b => (
            <li key={b.name}>
              {b.name} — {new Date(b.created).toLocaleString()}, {mb(b.bytes)}
            </li>
          ))}
        </ul>
      ) : (
        <p>No safety backups yet.</p>
      )}
      <RepoContext.Provider value={repo}>
        <BackupSettings />
      </RepoContext.Provider>
    </>
  )
}

function Updates({ view }: { view: View }) {
  const channel = view.settings.find(s => s.key === 'updateChannel')?.value
  return (
    <>
      <p>
        Version <b>{view.version}</b>, update channel <b>{String(channel)}</b> (change it on the Configuration tab).
      </p>
      <button className="btn" disabled aria-describedby="upd-later">
        Check for updates
      </button>
      <p id="upd-later" className="muted">
        Coming in a later phase.
      </p>
    </>
  )
}

function Systems({ view }: { view: View }) {
  if (!view.systems.length) return <p className="muted">The installed systems are listed here once the server runs on the Data folder layout.</p>
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>System</th>
            <th>Version</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {view.systems.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.version}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Installing, enabling and disabling systems comes in a later phase.</p>
    </>
  )
}

export function SetupScreen({ tab, admin, repo }: { tab?: string; admin: boolean; repo: Repo }) {
  const [view, setView] = useState<View | null>(null)
  const [err, setErr] = useState('')
  const on = TABS.some(([t]) => t === tab) ? tab! : 'configuration'
  const ok = admin && repo.mode === 'server'
  useEffect(() => {
    if (ok) api<View>('setup-config').then(setView, e => setErr((e as Error).message))
  }, [ok])
  return (
    <main className="lib">
      <h1>Setup</h1>
      <p>
        <a href="#/">Back to the games</a>
      </p>
      {!admin ? (
        <p className="banner err">Only an admin can open Setup. Sign in with an admin account.</p>
      ) : repo.mode !== 'server' ? (
        <p className="banner err">Setup needs the server: this copy keeps its data in the browser.</p>
      ) : (
        <>
          <nav className="tabs" aria-label="Setup">
            {TABS.map(([t, label]) => (
              <a key={t} href={`#/setup/${t}`} aria-current={t === on ? 'page' : undefined}>
                {label}
              </a>
            ))}
          </nav>
          {err && <p className="banner err">{err}</p>}
          {view && (
            <section>
              {on === 'configuration' && <Configuration view={view} reload={setView} />}
              {on === 'backups' && <Backups view={view} repo={repo} />}
              {on === 'updates' && <Updates view={view} />}
              {on === 'systems' && <Systems view={view} />}
            </section>
          )}
        </>
      )}
    </main>
  )
}

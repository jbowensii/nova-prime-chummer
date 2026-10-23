// Setup (#/setup/<tab>): the screen before a game, admin only (the server refuses everyone else: /api/setup-config).
// Tabs: Configuration (Config/options.json), Backups, Updates (shell: electron-updater is Phase 6), Game Systems (version, status,
// on/off, install/update from a file or URL). Server: server/setupcfg.mjs, server/systems.mjs.
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
interface SystemInfo {
  id: string
  title: string
  game: string
  version: string
  status: string
  enabled: boolean
  coreImported: boolean
  books: number
  catalog: number
}
interface View {
  file: string
  version: string
  desktop: boolean
  settings: Setting[]
  systems: SystemInfo[]
  backups: { name: string; bytes: number; created: string }[]
  cloud: { configured: boolean; error?: string }
}
interface CloudBackup {
  key: string
  bytes: number
  lastModified: string
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

/** Cloud backup (S3): Config and Data only, never the Library (the uploaded books). Settings file: awsConfig. */
function CloudBackups({ cloud }: { cloud: View['cloud'] }) {
  const [list, setList] = useState<CloudBackup[] | null>(null)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (what: () => Promise<string | void>) => {
    setBusy(true)
    setMsg(null)
    try {
      const text = await what()
      if (text) setMsg({ text })
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true })
    } finally {
      setBusy(false)
    }
  }
  const refresh = () => run(async () => void setList((await api<{ backups: CloudBackup[] }>('cloud-backup')).backups))
  const backUp = () =>
    run(async () => {
      const r = await api<{ key: string }>('cloud-backup', { method: 'POST' })
      setList((await api<{ backups: CloudBackup[] }>('cloud-backup')).backups)
      return `Backed up to ${r.key}.`
    })
  const restore = (key: string) => {
    if (!window.confirm(`Replace your runners, campaigns and settings with ${key}? The current data is saved in Backups/ first. Books are not touched.`)) return
    void run(async () => {
      await api('cloud-backup/restore', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ key }) })
      return `Restored ${key}. Reload the page.`
    })
  }
  return (
    <>
      <h2>Cloud backup (S3)</h2>
      <p className="muted">
        Sends your runners, campaigns, settings and imported catalog data (Config and Data) to an S3 bucket. Your books are never uploaded. Set{' '}
        <code>awsConfig</code> on the Configuration tab to the S3 settings file.
      </p>
      {!cloud.configured ? (
        <p>Not configured{cloud.error ? `: ${cloud.error}` : ''}.</p>
      ) : (
        <>
          <div className="row">
            <button type="button" className="btn" disabled={busy} onClick={() => void backUp()}>
              Back up to cloud
            </button>
            <button type="button" className="btn quiet" disabled={busy} onClick={() => void refresh()}>
              Refresh list
            </button>
          </div>
          {list &&
            (list.length ? (
              <ul>
                {list.map(b => (
                  <li key={b.key}>
                    {b.key} — {new Date(b.lastModified).toLocaleString()}, {mb(b.bytes)}{' '}
                    <button type="button" className="btn quiet" disabled={busy} onClick={() => restore(b.key)}>
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No cloud backups yet.</p>
            ))}
        </>
      )}
      <div role="status" aria-live="polite">
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
    </>
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
      <CloudBackups cloud={view.cloud} />
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

function Systems({ view, reload }: { view: View; reload: (v: View) => void }) {
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [url, setUrl] = useState<Record<string, string>>({})
  if (!view.systems.length) return <p className="muted">The installed systems are listed here once the server runs on the Data folder layout.</p>
  const run = async (path: string, init: RequestInit, done: string) => {
    setMsg(null)
    try {
      const systems = await api<SystemInfo[]>(`setup-config/systems/${path}`, init)
      reload({ ...view, systems })
      setMsg({ text: done })
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true })
    }
  }
  return (
    <>
      {view.systems.map(s => (
        <section key={s.id}>
          <h2>
            {s.title} <small className="muted">({s.id})</small>
          </h2>
          <p>
            Version <b>{s.version}</b> — {s.status}. Core data: {s.coreImported ? 'imported' : 'not imported'}; {s.books} book{s.books === 1 ? '' : 's'};
            catalog: {s.catalog} file{s.catalog === 1 ? '' : 's'}.
          </p>
          <label className="check inline">
            <input
              type="checkbox"
              checked={s.enabled}
              onChange={e =>
                void run(
                  `${s.id}/enabled`,
                  { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ enabled: e.target.checked }) },
                  `${s.title} is ${e.target.checked ? 'on' : 'off'}.`,
                )
              }
            />
            On
          </label>
          <div className="field">
            <label htmlFor={`pkg-${s.id}`}>Install or update from a file</label>
            <input
              id={`pkg-${s.id}`}
              type="file"
              accept=".zip,application/zip"
              onChange={e => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void run(`${s.id}/install`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: f }, `${s.title} package installed.`)
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={`url-${s.id}`}>Install or update from a web address</label>
            <span className="row">
              <input id={`url-${s.id}`} type="url" value={url[s.id] ?? ''} onChange={e => setUrl({ ...url, [s.id]: e.target.value })} />
              <button
                type="button"
                className="btn"
                disabled={!url[s.id]}
                onClick={() =>
                  void run(
                    `${s.id}/install`,
                    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ url: url[s.id] }) },
                    `${s.title} package installed.`,
                  )
                }
              >
                Install
              </button>
            </span>
          </div>
        </section>
      ))}
      <p className="muted">An install keeps your characters, NPCs, designs and compendiums; the old system files are moved to _to_delete in the data folder.</p>
      <div role="status" aria-live="polite">
        {msg && !msg.err && <p className="banner">{msg.text}</p>}
      </div>
      <div role="alert">{msg?.err && <p className="banner err">{msg.text}</p>}</div>
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
              {on === 'systems' && <Systems view={view} reload={setView} />}
            </section>
          )}
        </>
      )}
    </main>
  )
}

// SR6 creation rules (src/sr6/engine/creation.ts): the form (one row per setting, grouped as CREATION_GROUPS), the server's
// default at the top of the Rules page (the admin edits it; editors and players read it, players on their Table rules
// page) and a campaign's own on its page (its GMs and the admin choose the server's or their own copy; its players read
// it). A runner in a campaign with its own settings is built, checked and priced with those (useCampaignRules); every
// other runner with the server's.
import { useEffect, useMemo, useState } from 'react'
import { canEdit, isAdmin, send, useMe } from '../../ui/auth'
import { loadCampaigns, type Campaign } from '../../ui/Campaigns'
import { CREATION_GROUPS, expandKeys, readSettingsFile, rulesFrom, type CreationRow, type CreationRules } from '../engine/creation'
import type { Sr6Catalog } from '../model/types'

export type Loaded = { rules: CreationRules; errors: string[] }
type Row = { value: string; source: string; page: string }
const NO_ROW: Row = { value: '', source: '', page: '' }
const rowsOf = (cr: CreationRules): Record<string, Row> =>
  Object.fromEntries([...cr.values()].map(s => [s.key, { value: String(s.value), source: s.source ?? '', page: s.page ? String(s.page) : '' }]))

/** The rules a runner in campaign `id` is built with, fetched each time the editor opens it: undefined while they load,
 *  null for the server's (no campaign, a campaign without its own settings, or one this account can't read). */
export function useCampaignRules(id: string | undefined): CreationRules | null | undefined {
  const [got, setGot] = useState<{ id?: string; rules: CreationRules | null }>({ rules: null })
  useEffect(() => {
    if (id) void send(`sr6/campaigns/${id}`, undefined, 'GET').then(r => r.json())
      .then((c: Campaign) => campaignRules(c), () => null).then(rules => setGot({ id, rules }))
  }, [id])
  return !id ? null : got.id === id ? got.rules : undefined
}
/** A campaign's settings as its list entry has them (Runners.tsx: one rules map per runner). */
export const campaignRules = (c: Campaign | undefined) => c?.creation ? rulesFrom(c.creation).rules : null

/** The form. `onSave` gets the whole list; without it the form is read only. Load settings file puts a local creation.xml's
 *  values in the form for review (readSettingsFile); only Save sends them. */
export function CreationForm({ c, cr, onSave, children }: { c: Sr6Catalog; cr: Loaded; onSave?: (settings: CreationRow[]) => Promise<void>; children?: React.ReactNode }) {
  const [draft, setDraft] = useState(() => rowsOf(cr.rules))
  useEffect(() => setDraft(rowsOf(cr.rules)), [cr])
  const [msg, setMsg] = useState(''), [err, setErr] = useState(''), [saving, setSaving] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([]) // what the loaded file had that the form left out
  const keys = expandKeys({ metatypes: Object.fromEntries(c.entries.metatypes) })
  const qualities = [...c.entries.qualities.values()].sort((a, b) => a.name.localeCompare(b.name))
  const set = (key: string, f: Partial<Row>) => { setMsg(''); setDraft(d => ({ ...d, [key]: { ...NO_ROW, ...d[key], ...f } })) }
  async function load(f: File) {
    setMsg(''); setErr(''); setSkipped([])
    if (f.size > 1024 * 1024) return setErr(`${f.name} is larger than 1 MB: it isn’t a creation rules file.`)
    const r = readSettingsFile(await f.text(), f.name)
    if (r.fatal) return setErr(r.fatal)
    setDraft(rowsOf(r.rules))
    setSkipped(r.errors)
    setMsg(`Loaded ${r.rules.size === 1 ? '1 setting' : `${r.rules.size} settings`} from ${f.name} into the form, in place of what it showed. Check them, then Save creation rules; nothing is saved until then.`)
  }
  async function save() {
    setMsg(''); setErr(''); setSkipped([]); setSaving(true)
    const settings = Object.entries(draft).filter(([, r]) => r.value.trim()).map(([key, r]) => ({ key, value: r.value.trim(),
      ...r.source.trim() ? { source: r.source.trim() } : {}, ...r.page.trim() ? { page: r.page.trim() } : {} }))
    try {
      await onSave!(settings)
      setMsg('Creation rules saved.')
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }
  return <>
    {cr.errors.length > 0 && <ul className="err">{cr.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    {children}
    {onSave && <p><label className="btn file">Load settings file…
      <input type="file" accept=".xml,application/xml,text/xml" aria-label="Load settings file" disabled={saving}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void load(f) }} /></label>
      {' '}<span className="muted">A creation.xml from your own notes or another server; you review it here before saving.</span></p>}
    {skipped.length > 0 && <div className="warn"><p>Left out of the file:</p><ul>{skipped.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
    <fieldset className="bare" disabled={!onSave || saving}>
      {CREATION_GROUPS.map(g => {
        const rows = keys.filter(k => k.group === g)
        return rows.length > 0 && <div key={g}>
          <h3>{g}</h3>
          {g === 'Karma prices' && <p>Also the career prices.</p>}
          <div className="scroll-x"><table className="data"><thead><tr><th>Setting</th><th>Value</th><th>Source</th><th>Page</th></tr></thead>
            <tbody>{rows.map(k => {
              const r = draft[k.key] ?? NO_ROW, v = (value: string) => set(k.key, { value })
              return <tr key={k.key}>
                <td>{k.label}</td>
                <td>{k.type === 'number'
                  ? <input type="number" step="any" aria-label={k.label} value={r.value} onChange={e => v(e.target.value)} />
                  : <select aria-label={k.label} value={r.value} onChange={e => v(e.target.value)}>
                    <option value="">Not set</option>
                    {k.type === 'bool' ? <><option value="true">Yes</option><option value="false">No</option></>
                      : <>{r.value && !c.entries.qualities.has(r.value) && <option value={r.value}>{r.value} (not in the catalog)</option>}
                        {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</>}
                  </select>}</td>
                <td><input className="src-id" aria-label={`${k.label}: source`} value={r.source} onChange={e => set(k.key, { source: e.target.value.toUpperCase() })} /></td>
                <td><input type="number" min={1} step={1} aria-label={`${k.label}: page`} value={r.page} onChange={e => set(k.key, { page: e.target.value })} /></td>
              </tr>
            })}</tbody></table></div>
        </div>
      })}
    </fieldset>
    {onSave && <p><button type="button" className="btn" disabled={saving} onClick={() => void save()}>Save creation rules</button></p>}
    <div role="status" aria-live="polite">{msg && <p className="ok">{msg}</p>}</div>
    {err && <p className="err" role="alert">{err}</p>}
  </>
}

/** The top of the Rules page: the server's settings (the admin edits them), and where a campaign's own are set. */
export function ServerCreation({ c, cr, reload }: { c: Sr6Catalog; cr: Loaded; reload: () => Promise<void> }) {
  const me = useMe(), admin = isAdmin(me), staff = canEdit(me)
  const [own, setOwn] = useState<Campaign[]>([]) // the caller's campaigns with their own settings
  useEffect(() => { loadCampaigns('sr6').then(l => setOwn(l.filter(x => x.creation)), () => {}) }, [])
  return (
    <section className="sr6-creation">
      <h2>Creation rules</h2>
      <p>The numbers the core rulebook gives in its text: the server’s settings, which every runner is built and checked
        against unless its campaign has its own. {admin ? 'Fill them in from your book.' : 'The admin fills them in.'}{' '}
        {staff ? <>A GM can give a campaign they run its own settings on <a href="#/sr6/campaigns">its campaign page</a>.</>
          : 'A campaign’s GM can give it its own settings; they show on the campaign’s page.'}</p>
      {own.length > 0 && <p>Campaigns with their own settings: {own.map((x, i) => <span key={x.id}>{i > 0 && ', '}<a href={`#/sr6/campaigns/${x.id}`}>{x.name}</a></span>)}.</p>}
      <CreationForm c={c} cr={cr} onSave={admin ? async settings => { await send('sr6/creation', { settings }, 'PUT'); await reload() } : undefined} />
    </section>
  )
}

/** A campaign page's creation rules: the server's, or the campaign's own (a copy of the server's to start from). Its GMs and
 *  the admin choose and save; its players read. */
export function CampaignCreation({ c, cr, camp, onSaved }: { c: Sr6Catalog; cr: Loaded; camp: Campaign; onSaved: (camp: Campaign) => void }) {
  const manages = camp.you !== 'member'
  const [mine, setMine] = useState(!!camp.creation)
  useEffect(() => setMine(!!camp.creation), [camp])
  const shown: Loaded = useMemo(() => camp.creation ? rulesFrom(camp.creation) : cr, [camp, cr])
  const [msg, setMsg] = useState(''), [err, setErr] = useState('')
  const put = async (creation: CreationRow[] | null) => {
    const next: Campaign = await (await send(`sr6/campaigns/${camp.id}`, { creation }, 'PUT')).json()
    onSaved(next)
  }
  return (
    <section className="sr6-creation">
      <h2>Creation rules</h2>
      {manages ? <fieldset className="bare row">
        <legend className="sr-only">Creation rules for this campaign</legend>
        <label className="check"><input type="radio" name="camp-creation" checked={!mine} onChange={() => { setMine(false); setMsg(''); setErr('') }} />Use the server’s settings</label>
        <label className="check"><input type="radio" name="camp-creation" checked={mine} onChange={() => { setMine(true); setMsg(''); setErr('') }} />Use this campaign’s own settings</label>
      </fieldset> : <p>{camp.creation ? 'This campaign has its own settings, set by its GM. Your runners in it are built and checked with them.'
        : <>This campaign uses the server’s settings (the <a href="#/sr6/rules">Rules page</a>).</>}</p>}
      {manages && !mine && <>
        <p>Runners in this campaign are built and checked with the server’s settings (the <a href="#/sr6/rules">Rules page</a>).</p>
        {camp.creation && <p><button type="button" className="btn" onClick={() => { setErr(''); put(null).then(() => setMsg('This campaign uses the server’s settings again.'),
          e => setErr((e as Error).message)) }}>Save: use the server’s settings</button> <span className="muted">Its own settings are dropped.</span></p>}
      </>}
      {(mine || (!manages && camp.creation)) && <CreationForm c={c} cr={mine && !camp.creation ? cr : shown}
        onSave={manages ? settings => put(settings) : undefined}>
        {manages && !camp.creation && <p>A copy of the server’s settings to start from: change what this campaign plays differently, then save.</p>}
      </CreationForm>}
      <div role="status" aria-live="polite">{msg && <p className="ok">{msg}</p>}</div>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  )
}

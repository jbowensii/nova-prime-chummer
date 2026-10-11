// AI settings: one block per provider. The choices go to library/.config/ai-providers.xml ("Save settings");
// each key goes alone to ai-keys.xml ("Save key") and never comes back: the page only learns whether it is set.
// Each game has its own (game="sr6", #/sr6/books/ai: /api/sr6/ai-*, library/sr6/.config): its own provider, key and
// AnythingLLM workspace, for its own Ask the rules and AI search; Anarchy's also reads books no recipe knows.
import { useEffect, useState } from 'react'
import { api, BooksHeader, PROVIDER_NAMES } from './Books'
import { because } from './auth'
import { useRepo } from './repo'

interface Opt { value: string; label: string }
export interface Provider { enabled: boolean; baseUrl: string; model: string; workspace: string }
type Field = 'baseUrl' | 'model' | 'workspace'
const NS = 'urn:chummer-anarchy2:config:1'
const IDS = ['anthropic', 'openai', 'gemini', 'anythingllm']
const FIELDS: Record<string, { hint: string; fields: [Field, string, string][] }> = {
  anthropic: { hint: 'Claude models, with an API key from console.anthropic.com.',
    fields: [['model', 'Model', 'claude-opus-5 (default)'], ['baseUrl', 'Address (optional)', 'https://api.anthropic.com']] },
  openai: { hint: 'OpenAI, OpenRouter, LiteLLM, Ollama or LM Studio: anything that speaks the OpenAI chat API.',
    fields: [['baseUrl', 'Address', 'https://api.openai.com/v1'], ['model', 'Model', 'gpt-5']] },
  gemini: { hint: 'Google’s Gemini models, with a key from Google AI Studio.',
    fields: [['model', 'Model', 'gemini-2.5-pro (default)'], ['baseUrl', 'Address (optional)', 'https://generativelanguage.googleapis.com']] },
  anythingllm: { hint: 'Your own AnythingLLM server and one of its workspaces.',
    fields: [['baseUrl', 'Address', 'http://anythingllm:3001'], ['workspace', 'Workspace', 'shadowrun']] },
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** A connection test's answer (POST /api/ai-test): the model, its reply (200 characters of text) and how long it took. */
export interface Tested { ok: true; model: string; reply: string; ms: number }
export const connected = (t: Tested) => `Connected — ${t.model} replied “${t.reply}” in ${(t.ms / 1000).toFixed(1)} s.`
const blank = (): Provider => ({ enabled: false, baseUrl: '', model: '', workspace: '' })
const KEY_NEEDED = ['anthropic', 'gemini', 'anythingllm'] // a local OpenAI-compatible server may need none
/** The fields a provider's test uses, trimmed as they are saved: a stale attribute it ignores (a model on AnythingLLM) never counts. */
const used = (id: string, p: Provider) => FIELDS[id].fields.map(([k]) => p[k].trim()).join('\n')
/** Why Test is disabled, said beside it; null when it can run. */
export function testBlocked(id: string, p: Provider, saved: Provider | undefined, keySet: boolean, running: boolean) {
  if (running) return 'Testing now:'
  if (!saved || used(id, p) !== used(id, saved)) return 'Unsaved changes. Save settings first:'
  if (!keySet && KEY_NEEDED.includes(id)) return 'No key saved. Save a key first:'
  return null
}

export function parse(xml: string) {
  const root = new DOMParser().parseFromString(xml, 'text/xml').documentElement
  const providers = Object.fromEntries(IDS.map(id => [id, blank()]))
  for (const p of root.getElementsByTagName('provider')) {
    const id = p.getAttribute('id')!
    if (id in providers) providers[id] = { enabled: p.getAttribute('enabled') === 'true', baseUrl: p.getAttribute('baseUrl') ?? '',
      model: p.getAttribute('model') ?? '', workspace: p.getAttribute('workspace') ?? '' }
  }
  const keys = Object.fromEntries([...root.getElementsByTagName('key')].map(k => [k.getAttribute('provider')!, k.getAttribute('set') === 'true']))
  return { use: root.getAttribute('use') ?? '', providers, keys }
}

export function toXml(use: string, providers: Record<string, Provider>) {
  const rows = IDS.map(id => {
    const p = providers[id]
    const attrs = ([['baseUrl', p.baseUrl], ['model', p.model], ['workspace', p.workspace]] as const)
      .filter(([, v]) => v.trim()).map(([k, v]) => ` ${k}="${esc(v.trim())}"`).join('')
    return `  <provider id="${id}" enabled="${p.enabled}"${attrs}/>\n`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aiproviders xmlns:ca2="${NS}" version="1"${use ? ` use="${use}"` : ''}>\n${rows}</ca2:aiproviders>\n`
}

export function AiSettings({ game = 'ca2' }: { game?: 'ca2' | 'sr6' }) {
  const repo = useRepo()
  const sr6 = game === 'sr6', pre = sr6 ? 'sr6/' : '' // the game's own /api/sr6/ai-* routes
  const [state, setState] = useState<ReturnType<typeof parse> | null>(null)
  const [keyInput, setKeyInput] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  // per provider: the loaded model list (a select replaces the text box), 'loading', or why it failed
  const [lists, setLists] = useState<Record<string, Opt[] | 'loading' | { error: string } | undefined>>({})
  const [savedUrl, setSavedUrl] = useState<Record<string, string>>({}) // the list is asked at the saved address only
  const [saved, setSaved] = useState<Record<string, Provider>>({}) // a connection test uses the saved settings only
  const [tests, setTests] = useState<Record<string, 'running' | Tested | { error: string } | undefined>>({})
  const load = () => api<string>(`${pre}ai-settings`).then(x => {
    const s = parse(x)
    setState(s)
    setSavedUrl(Object.fromEntries(IDS.map(id => [id, s.providers[id].baseUrl.trim()])))
    setSaved(s.providers)
    setTests({})
    setLists({})
  }, e => setMsg(`${because('Couldn’t read the AI settings', e.message)} Reload to try again.`))
  useEffect(() => { if (repo.mode === 'server') void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (repo.mode !== 'server') return <main className="lib"><BooksHeader title="AI settings" /><p>AI settings live on the app’s server; open this page there.</p></main>
  if (!state) return <main className="lib"><BooksHeader title="AI settings" />{msg ? <p className="banner" role="status">{msg}</p> : <p className="muted">Loading…</p>}</main>

  const setP = (id: string, patch: Partial<Provider>) => setState({ ...state, providers: { ...state.providers, [id]: { ...state.providers[id], ...patch } } })
  const saveSettings = async () => {
    const use = state.providers[state.use]?.enabled ? state.use : ''
    try {
      const r = await api<{ cleared: string[]; message?: string }>(`${pre}ai-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: toXml(use, state.providers) })
      setMsg(r.message ? `Settings saved. ${r.cleared.map(p => PROVIDER_NAMES[p]).join(', ')}: ${r.message}.` : 'Settings saved.')
      await load()
    } catch (e) { setMsg(because('Couldn’t save the settings', (e as Error).message)) }
  }
  const saveKey = async (id: string, value: string) => {
    try {
      await api(`${pre}ai-keys`, { method: 'PUT', headers: { 'Content-Type': 'application/xml' },
        body: `<keys><key provider="${id}">${esc(value.trim())}</key></keys>` })
      setKeyInput({ ...keyInput, [id]: '' })
      setMsg(value.trim() ? `${PROVIDER_NAMES[id]} key saved.` : `${PROVIDER_NAMES[id]} key removed.`)
      // only the key flag changes: unsaved provider edits on the page stay
      setState(s => s && { ...s, keys: { ...s.keys, [id]: !!value.trim() } })
      setLists(l => ({ ...l, [id]: undefined }))
      setTests(t => ({ ...t, [id]: undefined }))
    } catch (e) { setMsg(because('Couldn’t save the key', (e as Error).message)) }
  }
  const loadModels = async (id: string) => {
    setLists(l => ({ ...l, [id]: 'loading' }))
    try {
      const r = await api<{ models?: string[]; workspaces?: { slug: string; name: string }[] }>(`${pre}ai-models?provider=${id}`)
      const opts = r.workspaces ? r.workspaces.map(w => ({ value: w.slug, label: w.name })) : (r.models ?? []).map(m => ({ value: m, label: m }))
      setLists(l => ({ ...l, [id]: opts.sort((a, b) => a.label < b.label ? -1 : a.label > b.label ? 1 : 0) }))
    } catch (e) { setLists(l => ({ ...l, [id]: { error: (e as Error).message } })) }
  }
  const runTest = async (id: string) => {
    setTests(t => ({ ...t, [id]: 'running' }))
    try { const r = await api<Tested>(`${pre}ai-test?provider=${id}`, { method: 'POST' }); setTests(t => ({ ...t, [id]: r })) }
    catch (e) { setTests(t => ({ ...t, [id]: { error: (e as Error).message } })) }
  }
  const TYPE = ' type' // the "type a name instead" option: model ids and workspace slugs have no spaces
  // the model (for AnythingLLM the workspace: its name shown, its slug saved), picked from a list loaded from the provider
  const pickField = (id: string, k: 'model' | 'workspace', label: string, ph: string) => {
    const p = state.providers[id], list = lists[id]
    const listed = Array.isArray(list) ? (p[k] && !list.some(o => o.value === p[k]) ? [{ value: p[k], label: p[k] }, ...list] : list) : null
    return (
      <div key={k} className="modelrow">
        <label>{label}
          {listed
            ? <select value={p[k]} onChange={e => e.target.value === TYPE ? setLists(l => ({ ...l, [id]: undefined })) : setP(id, { [k]: e.target.value })}>
                <option value="">{ph.includes('(default)') ? `Default: ${ph.replace(' (default)', '')}` : `Choose a ${k}`}</option>
                {listed.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value={TYPE}>Type a {k} name instead</option>
              </select>
            : <input value={p[k]} placeholder={ph} autoComplete="off" onChange={e => setP(id, { [k]: e.target.value })} />}
        </label>
        <button className="btn quiet" disabled={!state.keys[id] || list === 'loading' || p.baseUrl.trim() !== savedUrl[id]}
          onClick={() => void loadModels(id)}>{list === 'loading' ? 'Loading…' : `Load ${k}s`}</button>
        <p className="muted wide">{p.baseUrl.trim() !== savedUrl[id] ? 'Save settings first: the list' : 'The list'} uses the saved address and key.</p>
        {list && typeof list === 'object' && 'error' in list &&
          <p role="alert" className="wide">Couldn’t load the {k} list: {list.error.replace(/\.$/, '')}. You can type a {k} name.</p>}
      </div>
    )
  }
  const enabled = IDS.filter(id => state.providers[id].enabled)

  return (
    <main className="lib ai">
      <BooksHeader title="AI settings" />
      {sr6 ? <p>Shadowrun 6’s own AI answers Ask the rules and the AI search on Rules and Game data, from the Shadowrun 6 books on
        this server only. For AnythingLLM, choose a workspace that holds the Shadowrun 6 books and nothing else. Anarchy’s AI
        has <a href="#/books/ai">its own settings</a>. You pay the provider for what it reads. Keys are stored on this server in a
        file of their own and are never shown again.</p>
        : <p>An AI reads books the app has no recipe for and proposes their entries; you review them before anything is added.
        You pay the provider for what it reads. Keys are stored on this server in a file of their own and are never shown again.
        These settings are Shadowrun Anarchy’s; Shadowrun 6 has <a href="#/sr6/books/ai">its own</a>.</p>}
      <div role="status" aria-live="polite">{msg && <p className="banner">{msg}</p>}</div>

      <label className="use">Provider to use
        <select value={enabled.includes(state.use) ? state.use : ''} onChange={e => setState({ ...state, use: e.target.value })}>
          <option value="">None</option>
          {enabled.map(id => <option key={id} value={id}>{PROVIDER_NAMES[id]}</option>)}
        </select>
      </label>

      {IDS.map(id => {
        const p = state.providers[id], f = FIELDS[id]
        return (
          <fieldset key={id} className="provider">
            <legend>{PROVIDER_NAMES[id]}</legend>
            <p className="muted">{f.hint}</p>
            <label className="check"><input type="checkbox" checked={p.enabled} onChange={e => setP(id, { enabled: e.target.checked })} />Turn on</label>
            <div className="grid2">
              {f.fields.map(([k, label, ph]) => k === 'model' || (k === 'workspace' && id === 'anythingllm') ? pickField(id, k, label, sr6 && k === 'workspace' ? 'shadowrun-6' : ph)
                : <label key={k}>{label}<input value={p[k]} placeholder={ph} autoComplete="off" onChange={e => setP(id, { [k]: e.target.value })} /></label>)}
            </div>
            <div className="row keyrow">
              <label style={{ flex: 1 }}>API key
                <input type="password" autoComplete="new-password" value={keyInput[id] ?? ''} placeholder={state.keys[id] ? 'New key replaces it' : ''}
                  onChange={e => setKeyInput({ ...keyInput, [id]: e.target.value })} />
              </label>
              <button className="btn" disabled={!keyInput[id]?.trim()} onClick={() => void saveKey(id, keyInput[id])}>Save key</button>
              {state.keys[id] && <button className="btn quiet" onClick={() => void saveKey(id, '')}>Remove key</button>}
            </div>
            <p className={state.keys[id] ? 'ok' : 'muted'}>{state.keys[id] ? 'Key saved' : 'No key saved'}</p>
            {(() => {
              const t = tests[id], blocked = testBlocked(id, p, saved[id], state.keys[id], t === 'running')
              return <div className="row testrow">
                <button className="btn quiet" disabled={!!blocked} aria-label={`Test ${PROVIDER_NAMES[id]}`}
                  onClick={() => void runTest(id)}>{t === 'running' ? 'Testing…' : 'Test'}</button>
                <span className="muted">{blocked ? `${blocked} the test` : 'The test'} sends “Reply with the single word OK.” with the saved settings and key.</span>
                {t && t !== 'running' && ('error' in t
                  ? <p role="alert" className="wide">{because('Couldn’t connect', t.error)}</p>
                  : <p role="status" className="ok wide">{connected(t)}</p>)}
              </div>
            })()}
          </fieldset>
        )
      })}
      <div className="row"><button className="btn primary" onClick={() => void saveSettings()}>Save settings</button>
        <span className="muted">Saves the choices above. Keys are saved with their own button.</span></div>
    </main>
  )
}

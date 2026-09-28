// AI settings: one block per provider. The choices go to library/.config/ai-providers.xml ("Save settings");
// each key goes alone to ai-keys.xml ("Save key") and never comes back: the page only learns whether it is set.
import { useEffect, useState } from 'react'
import { api, BooksHeader, PROVIDER_NAMES } from './Books'
import { useRepo } from './repo'

interface Provider { enabled: boolean; baseUrl: string; model: string; workspace: string }
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
const blank = (): Provider => ({ enabled: false, baseUrl: '', model: '', workspace: '' })

function parse(xml: string) {
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

function toXml(use: string, providers: Record<string, Provider>) {
  const rows = IDS.map(id => {
    const p = providers[id]
    const attrs = ([['baseUrl', p.baseUrl], ['model', p.model], ['workspace', p.workspace]] as const)
      .filter(([, v]) => v.trim()).map(([k, v]) => ` ${k}="${esc(v.trim())}"`).join('')
    return `  <provider id="${id}" enabled="${p.enabled}"${attrs}/>\n`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aiproviders xmlns:ca2="${NS}" version="1"${use ? ` use="${use}"` : ''}>\n${rows}</ca2:aiproviders>\n`
}

export function AiSettings() {
  const repo = useRepo()
  const [state, setState] = useState<ReturnType<typeof parse> | null>(null)
  const [keyInput, setKeyInput] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const load = () => api<string>('ai-settings').then(x => setState(parse(x)), e => setMsg(`Couldn’t read the AI settings: ${e.message}. Reload to try again.`))
  useEffect(() => { if (repo.mode === 'server') void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (repo.mode !== 'server') return <main className="lib"><BooksHeader title="AI settings" /><p>AI settings live on the app’s server; open this page there.</p></main>
  if (!state) return <main className="lib"><BooksHeader title="AI settings" />{msg ? <p className="banner" role="status">{msg}</p> : <p className="muted">Loading…</p>}</main>

  const setP = (id: string, patch: Partial<Provider>) => setState({ ...state, providers: { ...state.providers, [id]: { ...state.providers[id], ...patch } } })
  const saveSettings = async () => {
    const use = state.providers[state.use]?.enabled ? state.use : ''
    try {
      const r = await api<{ cleared: string[]; message?: string }>('ai-settings', { method: 'PUT', headers: { 'Content-Type': 'application/xml' }, body: toXml(use, state.providers) })
      setMsg(r.message ? `Settings saved. ${r.cleared.map(p => PROVIDER_NAMES[p]).join(', ')}: ${r.message}.` : 'Settings saved.')
      await load()
    } catch (e) { setMsg(`Couldn’t save the settings: ${(e as Error).message}.`) }
  }
  const saveKey = async (id: string, value: string) => {
    try {
      await api('ai-keys', { method: 'PUT', headers: { 'Content-Type': 'application/xml' },
        body: `<keys><key provider="${id}">${esc(value.trim())}</key></keys>` })
      setKeyInput({ ...keyInput, [id]: '' })
      setMsg(value.trim() ? `${PROVIDER_NAMES[id]} key saved.` : `${PROVIDER_NAMES[id]} key removed.`)
      await load()
    } catch (e) { setMsg(`Couldn’t save the key: ${(e as Error).message}.`) }
  }
  const enabled = IDS.filter(id => state.providers[id].enabled)

  return (
    <main className="lib ai">
      <BooksHeader title="AI settings"><a className="btn quiet" href="#/books">Books</a></BooksHeader>
      <p>An AI reads books the app has no recipe for and proposes their entries; you review them before anything is added.
        You pay the provider for what it reads. Keys are stored on this server in a file of their own and are never shown again.</p>
      {msg && <p className="banner" role="status">{msg}</p>}

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
              {f.fields.map(([k, label, ph]) => <label key={k}>{label}<input value={p[k]} placeholder={ph} onChange={e => setP(id, { [k]: e.target.value })} /></label>)}
            </div>
            <div className="row keyrow">
              <label style={{ flex: 1 }}>API key
                <input type="password" autoComplete="off" value={keyInput[id] ?? ''} placeholder={state.keys[id] ? 'Enter a new key to replace it' : ''}
                  onChange={e => setKeyInput({ ...keyInput, [id]: e.target.value })} />
              </label>
              <button className="btn" disabled={!keyInput[id]?.trim()} onClick={() => void saveKey(id, keyInput[id])}>Save key</button>
              {state.keys[id] && <button className="btn quiet" onClick={() => void saveKey(id, '')}>Remove key</button>}
            </div>
            <p className={state.keys[id] ? 'ok' : 'muted'}>{state.keys[id] ? 'Key saved' : 'No key saved'}</p>
          </fieldset>
        )
      })}
      <div className="row"><button className="btn primary" onClick={() => void saveSettings()}>Save settings</button>
        <span className="muted">Saves the choices above. Keys are saved with their own button.</span></div>
    </main>
  )
}

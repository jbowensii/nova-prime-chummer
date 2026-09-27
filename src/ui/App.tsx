import { useEffect, useState } from 'react'
import { loadCatalog } from '../engine'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { Library } from './Library'
import { DataScreen } from './tabs/Data'
import './app.css'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [route, setRoute] = useState(parseHash)

  useEffect(() => {
    loadCatalog('./').then(setCatalog, e => setFailed(String(e)))
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  if (failed) return <main className="lib"><h1>Game data didn’t load</h1><p>{failed}</p><p>Check that the <code>data/</code> folder is served next to this page, then reload.</p></main>
  if (!catalog) return <main className="lib"><p className="muted">Loading game data…</p></main>

  const [page, id, tab] = route
  if (page === 'c' && id) return <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
  if (page === 'data') return <DataScreen c={catalog} />
  return <Library c={catalog} />
}

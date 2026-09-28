import { useEffect, useState } from 'react'
import { loadCatalog } from '../engine'
import { detectRepo, migrateBrowserToServer, RepoContext, type Repo } from './repo'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { AiSettings } from './AiSettings'
import { BooksScreen } from './Books'
import { Library } from './Library'
import { BookReview } from './Review'
import { RulesScreen } from './Rules'
import { DataScreen } from './tabs/Data'
import './app.css'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [route, setRoute] = useState(parseHash)
  const [repo, setRepo] = useState<Repo | null>(null)
  const [moved, setMoved] = useState(0)

  const reload = () => loadCatalog('./').then(setCatalog, e => setFailed(String(e)))
  useEffect(() => {
    void reload()
    detectRepo().then(async r => {
      if (r.mode === 'server') setMoved(await migrateBrowserToServer(r).catch(() => 0))
      setRepo(r)
    })
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])

  if (failed) return <main className="lib"><h1>Game data didn’t load</h1><p>{failed}</p><p>Check that the <code>data/</code> folder is served next to this page, then reload.</p></main>
  if (!catalog || !repo) return <main className="lib"><p className="muted">Loading game data…</p></main>

  const [page, id, tab] = route
  return (
    <RepoContext.Provider value={repo}>
      {moved > 0 && <p className="banner" role="status" style={{ margin: 0 }}>Moved {moved} runner{moved === 1 ? '' : 's'} from this browser to tower04.</p>}
      {page === 'c' && id ? <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
        : page === 'books' && id === 'ai' ? <AiSettings />
        : page === 'books' && id && tab === 'review' ? <BookReview key={id} c={catalog} id={id} />
        : page === 'books' ? <BooksScreen c={catalog} reload={() => void loadCatalog('./').then(setCatalog, () => {}) /* a failed reload keeps the loaded catalog */} />
        : page === 'data' ? <DataScreen c={catalog} /> : page === 'rules' ? <RulesScreen c={catalog} /> : <Library c={catalog} />}
    </RepoContext.Provider>
  )
}

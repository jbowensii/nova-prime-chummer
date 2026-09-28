import { useEffect, useState } from 'react'
import { loadCatalog } from '../engine'
import { detectRepo, migrateBrowserToServer, RepoContext, type Repo } from './repo'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { AiSettings } from './AiSettings'
import { BooksScreen } from './Books'
import { CatalogEdits } from './EditEntry'
import { Library } from './Library'
import { BookReview } from './Review'
import { RulesScreen } from './Rules'
import { DataScreen } from './tabs/Data'
import './app.css'

const parseHash = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)

/** Core tables a runner can't be built without: while one is missing the app opens on its setup screen. */
const ESSENTIAL = ['attributes', 'metatypes', 'levels', 'packages', 'pricing', 'skills']

/** No core data yet (loadCatalog's coreMissing): the Books page, where the core rulebook is imported, is all that works. */
function Setup({ missing }: { missing: string[] }) {
  return (
    <main className="lib">
      <h1>The game data isn’t set up yet</h1>
      <p>Import the core rulebook on the Books page, or upload a data pack.</p>
      {missing.length < 12 && <p className="muted">Missing: {missing.join(', ')}.</p>}
      <p><a className="btn primary" href="#/books">Open Books</a></p>
    </main>
  )
}

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
  const refresh = () => loadCatalog('./').then(setCatalog, () => {}) // a failed reload keeps the loaded catalog
  if (catalog.coreMissing.some(n => ESSENTIAL.includes(n)) && page !== 'books') return <Setup missing={catalog.coreMissing} />
  return (
    <RepoContext.Provider value={repo}><CatalogEdits c={catalog} reload={refresh}>
      {catalog.coreMissing.length > 0 && <p className="banner" role="status" style={{ margin: 0 }}>
        Some game data is missing: {catalog.coreMissing.join(', ')}. Import the core rulebook again on the <a href="#/books">Books page</a>, or upload a data pack.</p>}
      {moved > 0 && <p className="banner" role="status" style={{ margin: 0 }}>Moved {moved} runner{moved === 1 ? '' : 's'} from this browser to tower04.</p>}
      {page === 'c' && id ? <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
        : page === 'books' && id === 'ai' ? <AiSettings />
        : page === 'books' && id && tab === 'review' ? <BookReview key={id} c={catalog} id={id} />
        : page === 'books' ? <BooksScreen c={catalog} reload={() => void refresh()} />
        : page === 'data' ? <DataScreen c={catalog} /> : page === 'rules' ? <RulesScreen c={catalog} /> : <Library c={catalog} />}
    </CatalogEdits></RepoContext.Provider>
  )
}

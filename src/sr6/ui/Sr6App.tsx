// The Shadowrun 6 side (#/sr6/...): the SR6 catalog (loadSr6Catalog) loads once here, then the page: Books (admin; the
// Anarchy Books page with game="sr6"), Rules, Game data, or the runner list (a shell until the builder, S2).
import { useEffect, useState } from 'react'
import { isAdmin, useMe } from '../../ui/auth'
import { BooksScreen } from '../../ui/Books'
import { PageHeader } from '../../ui/nav'
import { RepoContext, type Repo } from '../../ui/repo'
import { loadSr6Catalog } from '../engine/load'
import type { Sr6Catalog } from '../model/types'
import { Sr6Data } from './Data'
import { Sr6Rules } from './Rules'

export function Sr6Main({ repo, route }: { repo: Repo; route: string[] }) {
  const admin = isAdmin(useMe())
  const [c, setC] = useState<Sr6Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const refresh = () => loadSr6Catalog().then(x => { setC(x); setFailed(null) }, e => setFailed(String(e)))
  useEffect(() => { void refresh() }, [])
  const page = route[0] === 'books' && !admin ? '' : route[0]

  const body = page === 'books' ? <BooksScreen game="sr6" reload={() => void refresh()} />
    : page === 'rules' || page === 'data' ? (c ? page === 'rules' ? <Sr6Rules c={c} /> : <Sr6Data c={c} reload={refresh} />
      : <main className="lib"><PageHeader title={page === 'rules' ? 'Rules' : 'Game data'} />{!failed && <p className="muted">Loading game data…</p>}</main>)
    : <main className="lib">
      <PageHeader title="Your runners" />
      <div className="empty"><p>SR6 builder coming. Your Shadowrun 6 runners will be listed here.</p></div>
    </main>
  return (
    <RepoContext.Provider value={repo}>
      {failed && <p className="banner err" role="alert" style={{ margin: 0 }}>The SR6 game data didn’t load: {failed}</p>}
      {body}
    </RepoContext.Provider>
  )
}

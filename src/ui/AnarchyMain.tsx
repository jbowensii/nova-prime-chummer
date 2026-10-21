// Anarchy's router: once signed in (or with no server) it loads the catalog and picks the page for the route. App.tsx picks
// this or Shadowrun 6's Sr6Main.
import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '../core/chrome/nav'
import { dupeGroups } from '../engine/dupes'
import { loadCatalog } from '../engine/load'
import { ca2Codec } from '../engine/charxml'
import { migrateBrowserToServer, npcRepoFor } from '../features/runner-store/repo'
import { RepoContext, type Repo } from '../core/ui-kit/repoContext'
import type { Catalog } from '../model/types'
import { EditorView } from './EditorView'
import { AiSettings } from '../features/ai-assist/AiSettings'
import { canEdit, isAdmin, useMe } from '../core/ui-kit/auth'
import { BooksScreen } from '../features/book-library/Books'
import { CampaignScreen, CampaignsScreen } from '../features/campaigns/Campaigns'
import { listCompendiums, listShared, readable } from '../features/compendiums/compendiumStore'
import { CompendiumsScreen } from './Compendiums'
import { CatalogEdits } from './EditEntry'
import { Library } from './Library'
import { NpcsScreen } from './Npcs'
import { BookReview } from './Review'
import { RulesScreen } from './Rules'
import { TableSetupScreen } from './TableRules'
import { DataScreen } from './tabs/Data'
import { TrashScreen } from '../features/runner-store/Trash'
import { UsersScreen } from '../features/accounts/Users'

/** Core tables a runner can't be built without: while one is missing the app opens on its setup screen. */
const ESSENTIAL = ['attributes', 'metatypes', 'levels', 'packages', 'pricing', 'skills']

/** No core data yet (loadCatalog's coreMissing): the Books page, where the core rulebook is imported, is all that works. */
function NoCoreData({ missing }: { missing: string[] }) {
  const admin = isAdmin(useMe())
  return (
    <main className="lib">
      <PageHeader title="The game data isn’t set up yet" />
      {admin ? (
        <>
          <p>Import the core rulebook on the Books page, or upload a data pack.</p>
          {missing.length < 12 && <p className="muted">Missing: {missing.join(', ')}.</p>}
          <p className="row">
            <a className="btn primary" href="#/books">
              Open Books
            </a>{' '}
            <a className="btn" href="#/books/datapack">
              Upload data pack
            </a>
          </p>
        </>
      ) : (
        <p>The admin hasn’t set up the game data yet. Check back once they have.</p>
      )}
    </main>
  )
}

/** The app itself, signed in (or with no server): the catalog and runners load only here. */
export function Main({ repo, route }: { repo: Repo; route: string[] }) {
  const me = useMe()
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState(0)
  const npcs = useMemo(() => npcRepoFor(repo, ca2Codec), [repo])
  // on the server the compendiums join the catalog (a failed list loads it without them): staff get those they can read,
  // players the ones shared with the table and their campaigns (no NPCs; a runner sees its own campaign's, EditorView.tsx)
  const staff = repo.mode === 'server' && canEdit(me),
    player = repo.mode === 'server' && !!me && !staff
  const load = async () => loadCatalog('./', staff || player ? readable(await (staff ? listCompendiums() : listShared()).catch(() => [])) : [])
  useEffect(() => {
    load().then(setCatalog, e => setFailed(String(e)))
    if (repo.mode === 'server') migrateBrowserToServer(repo).then(setMoved, () => {})
  }, [repo, staff, player]) // eslint-disable-line react-hooks/exhaustive-deps

  if (failed)
    return (
      <main className="lib">
        <h1>Game data didn’t load</h1>
        <p>{failed}</p>
        <p>
          Check that the <code>data/</code> folder is served next to this page, then reload.
        </p>
      </main>
    )
  if (!catalog)
    return (
      <main className="lib">
        <p className="muted">Loading game data…</p>
      </main>
    )

  const admin = isAdmin(me)
  // pages a role can't use open the runner list instead (the server refuses their requests anyway)
  // the trash and campaigns are the server's: the browser's own storage deletes for good, and has no accounts
  const page =
    ((route[0] === 'books' || route[0] === 'users') && !admin) || (['trash', 'campaigns'].includes(route[0]) && repo.mode !== 'server')
      ? ''
      : (route[0] === 'rules' && !canEdit(me)) || route[0] === 'table-rules'
        ? 'table'
        : route[0]
  const [, id, tab] = route
  // NPCs: the GMs' area (admin and editors; the server answers players 403 anyway)
  const gmOnly = (page === 'npcs' || page === 'n') && !canEdit(me) ? 'NPCs' : page === 'compendiums' && !canEdit(me) ? 'compendiums' : ''
  const gate = (title: string, text: string) => (
    <main className="lib">
      <PageHeader title={title} />
      <p className="banner">{text}</p>
    </main>
  )
  const refresh = () => load().then(setCatalog, () => {}) // a failed reload keeps the loaded catalog
  if (catalog.coreMissing.some(n => ESSENTIAL.includes(n)) && page !== 'books') return <NoCoreData missing={catalog.coreMissing} />
  return (
    <RepoContext.Provider value={repo}>
      <CatalogEdits c={catalog} reload={refresh}>
        {catalog.coreMissing.length > 0 && (
          <p className="banner" role="status" style={{ margin: 0 }}>
            Some game data is missing: {catalog.coreMissing.join(', ')}.{' '}
            {admin ? (
              <>
                Import the core rulebook again on the <a href="#/books">Books page</a>, or upload a data pack.
              </>
            ) : (
              'Ask the admin to import the core rulebook again.'
            )}
          </p>
        )}
        {moved > 0 && (
          <p className="banner" role="status" style={{ margin: 0 }}>
            Moved {moved} runner{moved === 1 ? '' : 's'} from this browser to the server.
          </p>
        )}
        {gmOnly ? (
          gate(gmOnly === 'NPCs' ? 'NPCs & Critters' : 'Compendiums', `Only GMs can see ${gmOnly}.`)
        ) : page === 'compendiums' && repo.mode !== 'server' ? (
          gate('Compendiums', 'Compendiums need the server: this copy of the app saves in the browser.')
        ) : page === 'compendiums' ? (
          <CompendiumsScreen key={`${id}/${tab}`} c={catalog} id={id} edit={tab && decodeURIComponent(tab)} reload={refresh} />
        ) : page === 'c' && id ? (
          <EditorView key={id} c={catalog} id={id} tab={tab ?? 'concept'} />
        ) : page === 'n' && id ? (
          <RepoContext.Provider value={npcs}>
            <EditorView key={`n/${id}`} c={catalog} id={id} tab={tab ?? 'concept'} />
          </RepoContext.Provider>
        ) : page === 'npcs' && id === 'trash' && repo.mode === 'server' ? (
          <TrashScreen key={`npcs/${tab ?? ''}`} npcs user={tab} />
        ) : page === 'npcs' ? (
          <NpcsScreen c={catalog} section={id === 'critters' ? 'critters' : 'npcs'} />
        ) : page === 'users' ? (
          <UsersScreen />
        ) : page === 'campaigns' && id ? (
          <CampaignScreen
            key={id}
            id={id}
            label={r => [catalog.packages.get(r.package)?.name, catalog.levels.get(r.level)?.name ?? r.level].filter(Boolean).join(', ')}
          />
        ) : page === 'campaigns' ? (
          <CampaignsScreen />
        ) : page === 'trash' ? (
          <TrashScreen user={id} />
        ) : page === 'books' && id === 'ai' ? (
          <AiSettings />
        ) : page === 'books' && id && tab === 'review' ? (
          <BookReview key={id} c={catalog} id={id} />
        ) : page === 'books' ? (
          <BooksScreen c={catalog} reload={() => void refresh()} dupeGroups={dupeGroups} />
        ) : page === 'data' ? (
          <DataScreen c={catalog} reload={refresh} />
        ) : page === 'rules' ? (
          <RulesScreen c={catalog} open={id && decodeURIComponent(id)} />
        ) : page === 'table' ? (
          <TableSetupScreen c={catalog} />
        ) : (
          <Library c={catalog} />
        )}
      </CatalogEdits>
    </RepoContext.Provider>
  )
}

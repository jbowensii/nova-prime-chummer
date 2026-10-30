// The Shadowrun 6 side (#/sr6/...): the SR6 catalog (loadSr6Catalog, with a GM's readable SR6 compendiums) and the
// server's creation rules (loadCreation) load once here, then the page: Books (admin; the Anarchy Books page with
// game="sr6", and #/sr6/books/ai: SR6's own AI settings, the Anarchy page with game="sr6"), Table setup (#/sr6/table:
// the creation rules, Creation.tsx), Rules, Game data, Users (admin) and Trash (the Anarchy pages with game="sr6"), or
// the runner list (Runners.tsx), a runner's editor (#/sr6/c/<id>/<tab>, EditorView.tsx) and, for GMs, NPCs & Critters
// (Npcs.tsx, #/sr6/npcs[/critters|/trash]) and an NPC's editor (#/sr6/n/<id>/<tab>), the Designer (Designer.tsx,
// #/sr6/designs[/<id>|/trash[/<user>]]: vehicle and drone designs) and Compendiums (Compendiums.tsx,
// #/sr6/compendiums[/<id>[/<entry id>]]); Campaigns (#/sr6/campaigns[/<id>]) are Anarchy's pages with game="sr6". SR6
// is server only (R): with browser storage the runners page says so.
import { useEffect, useMemo, useState } from 'react'
import { canEdit, isAdmin, useMe } from '../../../core/ui-kit/auth'
import { AiSettings } from '../../../features/ai-assist/AiSettings'
import { BooksScreen } from '../../../features/book-library/Books'
import { CampaignsScreen } from '../../../features/campaigns/Campaigns'
import { listShared, readable } from '../../../features/compendiums/compendiumStore'
import { PageHeader } from '../../../core/chrome/nav'
import { RepoContext, type Repo } from '../../../core/ui-kit/repoContext'
import { TrashScreen } from '../../../features/runner-store/Trash'
import { UsersScreen } from '../../../features/accounts/Users'
import { CL6_ONLY_KEY, flag, loadCreation } from '../../table-setup/domain/creation'
import { sr6Data } from '../../catalog/domain/data'
import { loadSr6Catalog } from '../../catalog/domain/load'
import type { Sr6Catalog } from '../../formats/domain/types'
import { listSr6Compendiums } from '../../compendiums/ui/compendiumStore'
import { Sr6Compendiums } from '../../compendiums/ui/Compendiums'
import { CampaignCreation, ServerCreation, type Loaded } from '../../table-setup/ui/Creation'
import { Sr6Data } from '../../game-data/ui/Data'
import { Sr6DesignEditor, Sr6Designs } from '../../designer/ui/Designer'
import { Sr6EditorView } from './EditorView'
import { NPC_TABS, SR6_TABS } from '../../runner-builder/ui/tabList'
import { Sr6Npcs } from '../../npcs/ui/Npcs'
import { Sr6CampaignScreen } from '../../runner-builder/ui/problems'
import { Sr6Rules } from '../../game-data/ui/Rules'
import { Sr6Runners } from '../../runner-library/ui/Runners'

const FOLIO: Record<string, string> = {
  '': 'Your runners',
  designs: 'Designer',
  npcs: 'NPCs & Critters',
  compendiums: 'Compendiums',
  campaigns: 'Campaigns',
  books: 'Books',
  users: 'Users',
  trash: 'Trash',
  rules: 'Rules',
  data: 'Game data',
  table: 'Table setup',
}
/** The book's page footer, "SECTION // SUB" (theme.css .sr6-folio): drawn from data-folio, so it's never read twice or found as page text. */
function folio(page: string, route: string[]) {
  if (page !== 'c' && page !== 'n') return `Shadowrun 6 // ${FOLIO[page] ?? FOLIO['']}`
  const tab = route[2] ?? (page === 'n' ? 'stats' : 'concept')
  return `${page === 'n' ? 'NPCs & Critters' : 'Your runners'} // ${[...SR6_TABS, ...NPC_TABS].find(([k]) => k === tab)?.[1] ?? ''}`
}

export function Sr6Main({ repo, route }: { repo: Repo; route: string[] }) {
  const me = useMe(),
    admin = isAdmin(me)
  const [c, setC] = useState<Sr6Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [cr, setCr] = useState<Loaded>({ rules: new Map(), errors: [] })
  // the server's cl6OnlyData setting (null until the creation rules are read): the catalog waits for it
  const [cl6only, setCl6only] = useState<boolean | null>(null)
  // on the server the SR6 compendiums join the catalog (a failed list loads it without them): staff get those they can
  // read, players the ones shared with the table and their SR6 campaigns (no NPCs; a runner sees its own campaign's)
  const staff = repo.mode === 'server' && canEdit(me),
    player = repo.mode === 'server' && !!me && !staff
  const refresh = async () =>
    loadSr6Catalog('./', staff || player ? readable(await (staff ? listSr6Compendiums() : listShared('./', 'sr6')).catch(() => [])) : [], !!cl6only).then(
      x => {
        setC(x)
        setFailed(null)
      },
      e => setFailed(String(e)),
    )
  const refreshCreation = () =>
    loadCreation().then(
      x => {
        setCr(x)
        setCl6only(flag(x.rules, CL6_ONLY_KEY) === true)
      },
      () => setCl6only(on => on ?? false), // (unreadable rules: the catalog still loads, without the data set)
    )
  useEffect(() => {
    if (cl6only !== null) void refresh()
  }, [staff, player, cl6only]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void refreshCreation()
  }, [])
  const data = useMemo(() => c && sr6Data(c), [c])
  // pages a role can't use show the runners (players never get the NPC area: the server refuses them too)
  const page =
    ((route[0] === 'books' || route[0] === 'users') && !admin) ||
    ((route[0] === 'npcs' || route[0] === 'n') && !canEdit(me)) ||
    (route[0] === 'compendiums' && !staff)
      ? ''
      : route[0] === 'table-rules'
        ? 'table'
        : route[0]

  const body =
    page === 'books' && route[1] === 'ai' ? (
      <AiSettings game="sr6" />
    ) : page === 'books' ? (
      <BooksScreen game="sr6" reload={() => void refresh()} />
    ) : page === 'users' ? (
      <UsersScreen game="sr6" />
    ) : page === 'trash' ? (
      <TrashScreen game="sr6" user={route[1]} />
    ) : page === 'npcs' && route[1] === 'trash' ? (
      <TrashScreen game="sr6" npcs user={route[2]} />
    ) : page === 'designs' && route[1] === 'trash' && repo.mode === 'server' ? (
      <TrashScreen game="sr6" npcs="designs" user={route[2]} />
    ) : page === 'rules' || page === 'data' || page === 'table' ? (
      c && data ? (
        page === 'rules' ? (
          <Sr6Rules c={c} open={route[1] && decodeURIComponent(route[1])} />
        ) : page === 'table' ? (
          <main className="lib">
            <PageHeader title="Table setup" />
            {repo.mode === 'server' ? (
              <ServerCreation c={c} cr={cr} reload={refreshCreation} />
            ) : (
              <p className="muted">The table’s settings are kept on the server.</p>
            )}
          </main>
        ) : (
          <Sr6Data c={c} data={data!} reload={refresh} />
        )
      ) : (
        <main className="lib">
          <PageHeader title={page === 'rules' ? 'Rules' : page === 'table' ? 'Table setup' : 'Game data'} />
          {!failed && <p className="muted">Loading game data…</p>}
        </main>
      )
    ) : page === 'compendiums' ? (
      c && data ? (
        <Sr6Compendiums c={c} data={data} cr={cr.rules} id={route[1]} edit={route[2]} reload={refresh} />
      ) : (
        <main className="lib">
          <PageHeader title="Compendiums" />
          {!failed && <p className="muted">Loading game data…</p>}
        </main>
      )
    ) : page === 'campaigns' && repo.mode === 'server' ? (
      route[1] ? (
        <Sr6CampaignScreen
          key={route[1]}
          id={route[1]}
          c={c}
          data={data}
          cr={cr.rules}
          extra={(camp, set) => c && <CampaignCreation c={c} cr={cr} camp={camp} onSaved={set} />}
        />
      ) : (
        <CampaignsScreen game="sr6" />
      )
    ) : repo.mode !== 'server' ? (
      <main className="lib">
        <PageHeader title="Your runners" />
        <div className="empty">
          <p>Shadowrun 6 runners need the Nova Prime Chummer server.</p>
        </div>
      </main>
    ) : c && data ? (
      page === 'npcs' ? (
        <Sr6Npcs c={c} data={data} cr={cr.rules} section={route[1] === 'critters' ? 'critters' : 'npcs'} reload={refresh} />
      ) : page === 'designs' && route[1] ? (
        <Sr6DesignEditor key={route[1]} c={c} data={data} cr={cr.rules} id={route[1]} />
      ) : page === 'designs' ? (
        <Sr6Designs c={c} data={data} cr={cr.rules} />
      ) : page === 'n' && route[1] ? (
        <Sr6EditorView key={`n/${route[1]}`} npc c={c} data={data} cr={cr.rules} id={route[1]} tab={route[2] ?? 'stats'} />
      ) : page === 'c' && route[1] ? (
        <Sr6EditorView key={route[1]} c={c} data={data} cr={cr.rules} id={route[1]} tab={route[2] ?? 'concept'} sub={route.slice(3).join('/') || undefined} />
      ) : (
        <Sr6Runners c={c} data={data} cr={cr.rules} />
      )
    ) : (
      <main className="lib">
        <PageHeader title="Your runners" />
        {!failed && <p className="muted">Loading game data…</p>}
      </main>
    )
  return (
    <RepoContext.Provider value={repo}>
      {failed && (
        <p className="banner err" role="alert" style={{ margin: 0 }}>
          The SR6 game data didn’t load: {failed}
        </p>
      )}
      {body}
      {route[2] !== 'print' && <footer className="sr6-folio" data-folio={folio(page, route)} aria-hidden="true" />}
    </RepoContext.Provider>
  )
}

// The Shadowrun 6 side (#/sr6/...): the SR6 catalog (loadSr6Catalog, with a GM's readable SR6 compendiums) and the creation rules (loadCreation) load once here, then the page: Books (admin; the
// Anarchy Books page with game="sr6"), Rules, Game data, Users (admin) and Trash (the Anarchy pages with game="sr6"), or the runner
// list (Runners.tsx), a runner's editor (#/sr6/c/<id>/<tab>, EditorView.tsx) and, for GMs, NPCs & Critters (Npcs.tsx, #/sr6/npcs[/trash]) and an NPC's
// editor (#/sr6/n/<id>/<tab>) and Compendiums (Compendiums.tsx, #/sr6/compendiums[/<id>[/<entry id>]]); Campaigns (#/sr6/campaigns[/<id>]) are Anarchy's pages with game="sr6". SR6 is server only (R): with browser storage the runners page says so.
import { useEffect, useMemo, useState } from 'react'
import { canEdit, isAdmin, useMe } from '../../ui/auth'
import { BooksScreen } from '../../ui/Books'
import { CampaignScreen, CampaignsScreen } from '../../ui/Campaigns'
import { readable } from '../../ui/compendiumStore'
import { PageHeader } from '../../ui/nav'
import { RepoContext, type Repo } from '../../ui/repo'
import { TrashScreen } from '../../ui/Trash'
import { UsersScreen } from '../../ui/Users'
import { loadCreation, type CreationRules } from '../engine/creation'
import { sr6Data } from '../engine/data'
import { loadSr6Catalog } from '../engine/load'
import type { Sr6Catalog } from '../model/types'
import { listSr6Compendiums } from './compendiumStore'
import { Sr6Compendiums } from './Compendiums'
import { Sr6Data } from './Data'
import { Sr6EditorView } from './EditorView'
import { Sr6Npcs } from './Npcs'
import { Sr6Rules } from './Rules'
import { Sr6Runners } from './Runners'

export function Sr6Main({ repo, route }: { repo: Repo; route: string[] }) {
  const me = useMe(), admin = isAdmin(me)
  const [c, setC] = useState<Sr6Catalog | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [cr, setCr] = useState<{ rules: CreationRules; errors: string[] }>({ rules: new Map(), errors: [] })
  // staff on the server: the SR6 compendiums they can read join their catalog (a failed list loads it without them);
  // players' catalogs never hold one
  const staff = repo.mode === 'server' && canEdit(me)
  const refresh = async () => loadSr6Catalog('./', staff ? readable(await listSr6Compendiums().catch(() => [])) : [])
    .then(x => { setC(x); setFailed(null) }, e => setFailed(String(e)))
  const refreshCreation = () => loadCreation().then(setCr)
  useEffect(() => { void refresh() }, [staff]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void refreshCreation() }, [])
  const data = useMemo(() => c && sr6Data(c), [c])
  // pages a role can't use show the runners (players never get the NPC area: the server refuses them too)
  const page = ((route[0] === 'books' || route[0] === 'users') && !admin) || ((route[0] === 'npcs' || route[0] === 'n') && !canEdit(me))
    || (route[0] === 'compendiums' && !staff) ? '' : route[0]

  const body = page === 'books' ? <BooksScreen game="sr6" reload={() => void refresh()} />
    : page === 'users' ? <UsersScreen game="sr6" />
    : page === 'trash' ? <TrashScreen game="sr6" user={route[1]} />
    : page === 'npcs' && route[1] === 'trash' ? <TrashScreen game="sr6" npcs user={route[2]} />
    : page === 'rules' || page === 'data' ? (c ? page === 'rules' ? <Sr6Rules c={c} /> : <Sr6Data c={c} reload={refresh} cr={cr} reloadCreation={refreshCreation} />
      : <main className="lib"><PageHeader title={page === 'rules' ? 'Rules' : 'Game data'} />{!failed && <p className="muted">Loading game data…</p>}</main>)
    : page === 'compendiums' ? c ? <Sr6Compendiums c={c} id={route[1]} edit={route[2]} reload={refresh} />
      : <main className="lib"><PageHeader title="Compendiums" />{!failed && <p className="muted">Loading game data…</p>}</main>
    : page === 'campaigns' && repo.mode === 'server' ? route[1] ? <CampaignScreen key={route[1]} game="sr6" id={route[1]} label={() => ''} /> : <CampaignsScreen game="sr6" />
    : repo.mode !== 'server' ? <main className="lib"><PageHeader title="Your runners" /><div className="empty"><p>Shadowrun 6 runners need the Chummer server.</p></div></main>
    : c && data ? page === 'npcs' ? <Sr6Npcs c={c} />
      : page === 'n' && route[1] ? <Sr6EditorView key={`n/${route[1]}`} npc c={c} data={data} cr={cr.rules} id={route[1]} tab={route[2] ?? 'stats'} />
      : page === 'c' && route[1] ? <Sr6EditorView key={route[1]} c={c} data={data} cr={cr.rules} id={route[1]} tab={route[2] ?? 'concept'} />
      : <Sr6Runners c={c} data={data} cr={cr.rules} />
    : <main className="lib"><PageHeader title="Your runners" />{!failed && <p className="muted">Loading game data…</p>}</main>
  return (
    <RepoContext.Provider value={repo}>
      {failed && <p className="banner err" role="alert" style={{ margin: 0 }}>The SR6 game data didn’t load: {failed}</p>}
      {body}
    </RepoContext.Provider>
  )
}

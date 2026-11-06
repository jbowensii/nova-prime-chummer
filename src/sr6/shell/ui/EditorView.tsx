// The SR6 runner's editor (#/sr6/c/<id>/<tab>): the Anarchy editor's look (topbar, tabs, the budgets panel where the
// receipt is) over useAutosave (save, conflict, undo). Read only for someone else's runner. Once finalized (career) the
// tabs show the runner as it stands (its build with the ledger's live spends replayed, src/sr6/runner-builder/domain/career/career.ts) and are
// read only but Concept, Review and Ledger: spends are recorded on the Ledger tab. A refused step shows its reason under
// the tabs. The Print tab shows the SR6 sheet instead (src/sr6/print/ui/Sheet.tsx). An NPC (#/sr6/n/<id>/<tab>, GMs only)
// opens from the NPC store with tabs Concept, Stat block (a critter's Design too) and Print, and its kind chip where a
// runner's state badge is. A last route segment names the row or section to scroll to (#/sr6/c/<id>/<tab>/<target>,
// FixAt.tsx); on Builder (build/<uid>[/<uid>]) it's the item's uid path.
import { useEffect, useMemo, useState } from 'react'
import { canEdit, useMe } from '../../../core/ui-kit/auth'
import { Brand, StateBadge } from '../../../core/ui-kit/bits'
import { approveRunner } from '../../../features/campaigns/campaignsStore'
import { IconButton } from '../../../core/ui-kit/icons'
import { HeaderBars } from '../../../core/chrome/nav'
import { Face } from '../../../core/ui-kit/Portrait'
import { ConflictDialog, SaveLine, useAutosave } from '../../../features/runner-store/useAutosave'
import { allBudgets } from '../../runner-builder/domain/creation/budgets'
import { currentBuild, preview, record, validateCareer } from '../../runner-builder/domain/career/career'
import type { CreationRules } from '../../table-setup/domain/creation'
import { sr6Data, type Sr6Data } from '../../catalog/domain/data'
import { deriveSr6 } from '../../runner-builder/domain/creation/derive'
import { forSr6Campaign, houseNotes, keepSr6House, withSr6House } from '../../runner-builder/domain/career/house'
import { makeProvider } from '../../runner-builder/domain/creation/providers'
import { migrateSr6Ids } from '../../runner-builder/domain/career/migrate'
import { validateSr6 } from '../../runner-builder/domain/review/rules'
import type { Sr6Character } from '../../formats/domain/character'
import type { Sr6Catalog } from '../../formats/domain/types'
import { Budgets } from '../../runner-builder/ui/Budgets'
import { rulesForRunner, tableRulesFor, useRunnerCampaign } from '../../table-setup/ui/Creation'
import { withSampleFixes } from '../../runner-builder/domain/creation/samplefix'
import { npcChip, reasonText, runAct, SR6_FINAL_TIP, Sr6Editor, sr6EditHref, sr6NpcHref, sr6NpcsHref, type Sr6Ctx } from '../../runner-builder/ui/editor'
import { problemParts } from '../../runner-builder/ui/problems'
import { downloadSr6Runners } from '../../foundry/ui/Foundry'
import { exportSr6, sr6NpcRepo, sr6Repo } from '../../runner-builder/ui/repo'
import { AttributesTab } from '../../runner-builder/ui/tabs/Attributes'
import { AugmentationsTab } from '../../runner-builder/ui/tabs/Augmentations'
import { ConceptTab } from '../../runner-builder/ui/tabs/Concept'
import { ContactsTab } from '../../runner-builder/ui/tabs/Contacts'
import { CareerIdentities, GearTab } from '../../runner-builder/ui/tabs/Gear'
import { LedgerTab } from '../../runner-builder/ui/tabs/Ledger'
import { MagicTab } from '../../runner-builder/ui/tabs/Magic'
import { MartialArtsTab } from '../../runner-builder/ui/tabs/MartialArts'
import { MethodTab } from '../../runner-builder/ui/tabs/Method'
import { QualitiesTab } from '../../runner-builder/ui/tabs/Qualities'
import { ReviewTab } from '../../runner-builder/ui/tabs/Review'
import { SkillsTab } from '../../runner-builder/ui/tabs/Skills'
import { StatsTab } from '../../npcs/ui/tabs/Stats'
import { DesignTab } from '../../npcs/ui/tabs/Design'
import { DronesTab, VehiclesTab } from '../../runner-builder/ui/tabs/Vehicles'
import { CrittersTab } from '../../runner-builder/ui/tabs/Critters'
import { ItemBuilder } from '../../runner-builder/ui/Builder'
import { Sr6Sheet } from '../../print/ui/Sheet'
import { AskRules } from '../../../features/ai-assist/AskRules'
import { TabBoundary } from '../../../core/shared/ui'
import { npcTabs, sr6Tabs } from '../../runner-builder/ui/tabList'
import { ProblemsPanel, useScrollToTarget } from '../../runner-builder/ui/FixAt'

// (the item builders, #/sr6/c/<id>/build/<uid path>: career changes there are recorded spends, as the Ledger's)
const OPEN_IN_CAREER = new Set(['concept', 'review', 'ledger', 'build'])

/** `cr`: the server's creation rules; a runner in a campaign with its own settings uses those instead. */
export function Sr6EditorView({
  c: all,
  data: allData,
  cr: serverRules,
  id,
  tab,
  sub,
  npc = false,
}: {
  c: Sr6Catalog
  data: Sr6Data
  cr: CreationRules
  id: string
  tab: string
  /** on Builder its uid path (`build/<uid>[/<uid>]`); on any other tab the row or section to scroll to */
  sub?: string
  npc?: boolean
}) {
  const repo = useMemo(() => (npc ? sr6NpcRepo() : sr6Repo()), [npc])
  const href = npc ? sr6NpcHref : sr6EditHref,
    noun = npc ? 'NPC' : 'runner'
  const save = useAutosave(repo, id, {
    noun,
    tab,
    prepare: ch => migrateSr6Ids(ch, all),
    editHref: (ch, t) => href(ch.id, t),
    home: doc => (npc ? sr6NpcsHref(doc?.npc) : '#/sr6'),
    inEditor: h => h.startsWith(href(id, '')),
  })
  const { doc: ch, setDoc, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const [refusal, setRefusal] = useState<string | null>(null)
  const gm = canEdit(useMe()) // GM approval: GMs (editors) and the admin
  // the runner's rules: the server's or its campaign's, with its own choices over them where the campaign doesn't lock them
  const camp = useRunnerCampaign(npc ? undefined : ch?.campaign)
  const cr = useMemo(
    () => (ch && camp !== undefined ? rulesForRunner(serverRules, camp, ch) : rulesForRunner(serverRules, null, {})),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [serverRules, camp, ch?.rules],
  )
  const table = useMemo(() => tableRulesFor(serverRules, camp), [serverRules, camp])
  const locks = useMemo(() => (camp?.locks ?? []).map(l => ({ key: l.key, by: l.byName ?? l.by })), [camp])
  const me = useMe()
  // a player's catalog holds the compendiums shared with every SR6 campaign they play in: this runner sees its own
  // campaign's (c, the pickers' catalog); its copies of compendium entries no longer there stand in for them (data)
  const c = useMemo(() => (canEdit(me) ? all : forSr6Campaign(all, ch?.campaign)), [all, me, ch?.campaign])
  const kept = useMemo(() => withSr6House(c, ch?.house), [c, ch?.house])
  const data = useMemo(() => (kept.c === all ? allData : sr6Data(kept.c)), [kept.c, all, allData])
  useEffect(() => {
    if (!refusal) return
    const t = setTimeout(() => setRefusal(null), 6000)
    return () => clearTimeout(t)
  }, [refusal])
  const calc = useMemo(() => {
    if (!ch) return undefined
    // career: every tab, budget and derived value reads the runner as it stands; update and replace act on the stored one
    // (a book sample's printed lines as the owner's override file corrects them: engine/samplefix.ts)
    const view = withSampleFixes(c, ch.finalizedAt ? { ...ch, build: currentBuild(ch) } : ch).ch
    const p = makeProvider(view.build.method, data, cr)
    return {
      view,
      p,
      budgets: allBudgets(view.build, data, cr, p),
      d: deriveSr6(data, cr, view),
      v: [...(ch.finalizedAt ? validateCareer(data, cr, ch) : validateSr6(data, cr, withSampleFixes(c, ch).ch)), ...houseNotes(c, kept.gone)],
    }
  }, [ch, data, cr, c, kept.gone])

  useScrollToTarget(tab === 'build' ? undefined : sub, !!calc)

  const back = npc ? <a href={sr6NpcsHref(ch?.npc)}>Back to NPCs & Critters</a> : <a href="#/sr6">Back to your runners</a>
  if (!loaded || camp === undefined)
    return (
      <main className="lib">
        <p className="muted">Loading {noun}…</p>
      </main>
    )
  if (loadError)
    return (
      <main className="lib">
        <h1>Couldn’t open this {noun}</h1>
        <p className="err">{loadError}</p>
        <p>
          {back}
          {npc ? '.' : ', where you can download its file or try to repair it.'}
        </p>
      </main>
    )
  if (!ch || !calc)
    return (
      <main className="lib">
        <h1>{npc ? 'NPC' : 'Runner'} not found</h1>
        <p>It may have been deleted on the server. {back}</p>
      </main>
    )

  const theirs = owner !== null,
    career = !!ch.finalizedAt
  const { view, ...derived } = calc
  const tabs = npc ? npcTabs(ch.npc?.kind) : sr6Tabs(view.build.magic, career && !ch.npc)
  const shown = tab === 'build' && sub && !npc ? 'build' : tabs.some(([k]) => k === tab) ? tab : 'concept'
  const locked = career && !OPEN_IN_CAREER.has(shown),
    ro = theirs || locked
  // a compendium entry it uses is copied onto it (src/sr6/runner-builder/domain/career/house.ts): it keeps it if the compendium goes
  const commit = (next: Sr6Character, undoable = true) => {
    setRefusal(null)
    save.commit(keepSr6House(c, next), undoable)
  }
  // ledger entries aren't on the undo stack (R): Void is their undo
  const toLedger = (r: { ok: true; ch: Sr6Character } | { ok: false; reason: string }) => {
    if (!r.ok) {
      const why = reasonText(r.reason)
      setRefusal(why)
      return why
    }
    commit(r.ch, false)
    return null
  }
  const ctx: Sr6Ctx = {
    c,
    data,
    cr,
    ch: view,
    table,
    locks,
    ...derived,
    ro,
    career,
    npc,
    edit: fn => {
      if (!ro) {
        const n = structuredClone(ch)
        fn(n.build)
        commit(n)
      }
    },
    update: fn => {
      if (!ro) {
        const n = structuredClone(ch)
        fn(n)
        commit(n)
      }
    },
    replace: next => {
      if (!ro) commit(next)
    },
    // their own runner directly; a player's in a campaign they run (or the admin) on the server
    approve: !gm
      ? null
      : !theirs
        ? overrides => {
            commit({ ...structuredClone(ch), overrides })
            return Promise.resolve(null)
          }
        : ch.campaign && !npc
          ? overrides =>
              approveRunner('sr6', ch.campaign!, ch.id, overrides).then(
                () => {
                  setDoc({ ...ch, overrides })
                  return null
                },
                e => (e as Error).message,
              )
          : null,
    act: op => {
      if (ro) return 'This runner is read only here.'
      const r = runAct(ch, op, data, cr)
      if ('error' in r) {
        setRefusal(r.error)
        return r.error
      }
      commit(r.ch)
      return null
    },
    preview: (a, typed) => preview(ch, a, data, cr, typed),
    record: (a, typed) => (theirs ? 'This runner is read only here.' : toLedger(record(ch, a, data, cr, typed))),
    ledger: fn => (theirs ? 'This runner is read only here.' : toLedger(fn(ch))),
    undo: save.undo,
    redo: save.redo,
    canUndo: save.canUndo,
    canRedo: save.canRedo,
  }
  if (tab === 'print')
    return (
      <Sr6Editor.Provider value={ctx}>
        <Sr6Sheet />
      </Sr6Editor.Provider>
    )
  const errors = calc.v.filter(x => x.severity === 'error' && !x.approved).length,
    open = problemParts(calc.v) // a GM reading a player's runner is told what's open on it
  const name = ch.identity.streetName || ch.identity.name || (npc ? 'Unnamed NPC' : 'Unnamed runner')

  return (
    <Sr6Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">
          {ch.identity.portrait && <Face ch={ch} />}
          <span className="name">{name}</span>
          {ch.npc ? <span className="noncanon npckind">{npcChip(ch.npc)}</span> : <StateBadge finalized={career} finalTip={SR6_FINAL_TIP} />}
        </div>
        {!theirs && (
          <div className="savebar">
            <SaveLine status={status} onRetry={() => void saveNow()} />
          </div>
        )}
        <span className="spacer" />
        <HeaderBars>
          {!theirs && (
            <>
              <IconButton icon="save" label="Save" onClick={() => void saveNow()} disabled={status.state === 'saving'} />
              <IconButton icon="close" label="Save and close" onClick={() => void saveAndClose()} />
              <IconButton icon="undo" label="Undo" disabled={!ctx.canUndo} onClick={ctx.undo} />
              <IconButton icon="redo" label="Redo" disabled={!ctx.canRedo} onClick={ctx.redo} />
            </>
          )}
          <IconButton icon="download" label="Export file" onClick={() => (theirs ? exportSr6(c, ch) : setDoc(exportSr6(c, ch)))} />
          <IconButton icon="foundry" label="Export for Foundry" onClick={() => downloadSr6Runners(c, data, cr, [ch])} />
        </HeaderBars>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a
            key={k}
            href={href(ch.id, k)}
            aria-current={shown === k ? 'page' : undefined}
            aria-label={k === 'review' && errors > 0 ? `${label}, ${errors} ${errors === 1 ? 'problem' : 'problems'}` : undefined}
          >
            {label}
            {k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {theirs && (
        <p className="banner readonly" role="status">
          Read only — {owner}’s {noun}. Only they can change it; you can still export a copy.
        </p>
      )}
      {theirs && !npc && open.length > 0 && (
        <p className="banner" role="status">
          This runner has {open.join(' and ')} — <a href={href(ch.id, 'review')}>review them</a>.
        </p>
      )}
      {!theirs && locked && (
        <p className="banner readonly" role="status">
          Finalized: spend karma and nuyen on the <a href={sr6EditHref(ch.id, 'ledger')}>Ledger tab</a>.
        </p>
      )}
      {refusal && (
        <p className="banner err" role="alert">
          {refusal}
        </p>
      )}
      <div className="layout">
        <div className="chapter-tab" aria-hidden>
          {shown === 'build' ? 'Builder' : tabs.find(([k]) => k === shown)?.[1]}
        </div>
        <main className="work">
          <AskRules game="sr6" />
          <fieldset className="bare" disabled={ro && !(shown === 'review' && ctx.approve)}>
            {shown !== 'review' && shown !== 'build' && <ProblemsPanel tab={shown} tabs={tabs} />}
            <TabBoundary key={shown}>
              {shown === 'concept' && <ConceptTab />}
              {shown === 'method' && <MethodTab />}
              {shown === 'attributes' && <AttributesTab />}
              {shown === 'skills' && <SkillsTab />}
              {shown === 'qualities' && <QualitiesTab />}
              {shown === 'martial' && <MartialArtsTab />}
              {shown === 'magic' && <MagicTab />}
              {shown === 'augmentations' && <AugmentationsTab />}
              {shown === 'gear' && <GearTab />}
              {shown === 'vehicles' && <VehiclesTab />}
              {shown === 'drones' && <DronesTab />}
              {shown === 'critters' && <CrittersTab />}
              {shown === 'contacts' && <ContactsTab />}
              {shown === 'review' && <ReviewTab />}
              {shown === 'ledger' && <LedgerTab />}
              {shown === 'stats' && <StatsTab />}
              {shown === 'design' && <DesignTab />}
              {shown === 'build' && <ItemBuilder path={sub!} />}
            </TabBoundary>
          </fieldset>
          {career && !theirs && shown === 'gear' && <CareerIdentities />}
        </main>
        {!npc && <Budgets />}
      </div>
      <ConflictDialog s={save} name={name} />
    </Sr6Editor.Provider>
  )
}

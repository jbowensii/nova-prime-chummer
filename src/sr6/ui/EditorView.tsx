// The SR6 runner's editor (#/sr6/c/<id>/<tab>): the Anarchy editor's look (topbar, tabs, the budgets panel where the
// receipt is) over useAutosave (save, conflict, undo). Read only for someone else's runner. Once finalized (career) the
// tabs show the runner as it stands (its build with the ledger's live spends replayed, src/sr6/engine/career.ts) and are
// read only but Concept, Review and Ledger: spends are recorded on the Ledger tab. A refused step shows its reason under
// the tabs. The Print tab shows the SR6 sheet instead (src/sr6/print/Sheet.tsx). An NPC (#/sr6/n/<id>/<tab>, GMs only)
// opens from the NPC store with tabs Concept, Stat block and Print, and its kind chip where a runner's state badge is.
import { useEffect, useMemo, useState } from 'react'
import { canEdit, useMe } from '../../ui/auth'
import { Brand, StateBadge } from '../../ui/bits'
import { IconButton } from '../../ui/icons'
import { HeaderBars } from '../../ui/nav'
import { Face } from '../../ui/Portrait'
import { ConflictDialog, SaveLine, useAutosave } from '../../ui/useAutosave'
import { allBudgets } from '../engine/budgets'
import { currentBuild, preview, record, validateCareer } from '../engine/career'
import type { CreationRules } from '../engine/creation'
import { sr6Data, type Sr6Data } from '../engine/data'
import { deriveSr6 } from '../engine/derive'
import { forSr6Campaign, houseNotes, keepSr6House, withSr6House } from '../engine/house'
import { makeProvider } from '../engine/providers'
import { validateSr6 } from '../engine/rules'
import { MAGIC_KINDS } from '../engine/data'
import type { MagicKind, Sr6Character } from '../model/character'
import type { Sr6Catalog } from '../model/types'
import { Budgets } from './Budgets'
import { useCampaignRules } from './Creation'
import { reasonText, runAct, SR6_FINAL_TIP, Sr6Editor, sr6EditHref, sr6NpcHref, type Sr6Ctx } from './editor'
import { npcChip } from './Npcs'
import { downloadSr6Runners } from './Foundry'
import { exportSr6, sr6NpcRepo, sr6Repo } from './repo'
import { AttributesTab } from './tabs/Attributes'
import { AugmentationsTab } from './tabs/Augmentations'
import { ConceptTab } from './tabs/Concept'
import { ContactsTab } from './tabs/Contacts'
import { GearTab } from './tabs/Gear'
import { LedgerTab } from './tabs/Ledger'
import { MagicTab } from './tabs/Magic'
import { MethodTab } from './tabs/Method'
import { QualitiesTab } from './tabs/Qualities'
import { ReviewTab } from './tabs/Review'
import { SkillsTab } from './tabs/Skills'
import { StatsTab } from './tabs/Stats'
import { VehiclesTab } from './tabs/Vehicles'
import { Sr6Sheet } from '../print/Sheet'

/** Every tab; Magic only shows for an awakened or emerged runner, titled Resonance for a technomancer, and Ledger only in
 *  career (sr6Tabs). */
export const SR6_TABS: [string, string][] = [['concept', 'Concept'], ['method', 'Creation method'], ['attributes', 'Attributes'],
  ['skills', 'Skills'], ['qualities', 'Qualities'], ['magic', 'Magic'], ['augmentations', 'Augmentations'], ['gear', 'Gear'],
  ['vehicles', 'Vehicles'], ['contacts', 'Contacts & lifestyle'], ['review', 'Review'], ['ledger', 'Ledger'], ['print', 'Print']]
export const sr6Tabs = (magic: MagicKind, career = false): [string, string][] => SR6_TABS
  .filter(([k]) => (k !== 'magic' || magic !== 'mundane') && (k !== 'ledger' || career))
  .map(([k, l]) => [k, k === 'magic' && MAGIC_KINDS[magic].resonance ? 'Resonance' : l])
const OPEN_IN_CAREER = new Set(['concept', 'review', 'ledger'])
export const NPC_TABS: [string, string][] = [['concept', 'Concept'], ['stats', 'Stat block'], ['print', 'Print']]

/** `cr`: the server's creation rules; a runner in a campaign with its own settings uses those instead. */
export function Sr6EditorView({ c: all, data: allData, cr: serverRules, id, tab, npc = false }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; id: string; tab: string; npc?: boolean }) {
  const repo = useMemo(() => npc ? sr6NpcRepo() : sr6Repo(), [npc])
  const href = npc ? sr6NpcHref : sr6EditHref, noun = npc ? 'NPC' : 'runner'
  const save = useAutosave(repo, id, { noun, tab, prepare: ch => ch, editHref: (ch, t) => href(ch.id, t), home: () => npc ? '#/sr6/npcs' : '#/sr6',
    inEditor: h => h.startsWith(href(id, '')) })
  const { doc: ch, setDoc, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const [refusal, setRefusal] = useState<string | null>(null)
  const campRules = useCampaignRules(npc ? undefined : ch?.campaign), cr = campRules ?? serverRules
  const me = useMe()
  // a player's catalog holds the compendiums shared with every SR6 campaign they play in: this runner sees its own
  // campaign's (c, the pickers' catalog); its copies of compendium entries no longer there stand in for them (data)
  const c = useMemo(() => canEdit(me) ? all : forSr6Campaign(all, ch?.campaign), [all, me, ch?.campaign])
  const kept = useMemo(() => withSr6House(c, ch?.house), [c, ch?.house])
  const data = useMemo(() => kept.c === all ? allData : sr6Data(kept.c), [kept.c, all, allData])
  useEffect(() => { if (!refusal) return; const t = setTimeout(() => setRefusal(null), 6000); return () => clearTimeout(t) }, [refusal])
  const calc = useMemo(() => {
    if (!ch) return undefined
    // career: every tab, budget and derived value reads the runner as it stands; update and replace act on the stored one
    const view = ch.finalizedAt ? { ...ch, build: currentBuild(ch) } : ch
    const p = makeProvider(view.build.method, data, cr)
    return { view, p, budgets: allBudgets(view.build, data, cr, p), d: deriveSr6(data, cr, view),
      v: [...ch.finalizedAt ? validateCareer(data, cr, ch) : validateSr6(data, cr, ch), ...houseNotes(c, kept.gone)] }
  }, [ch, data, cr, c, kept.gone])

  const back = npc ? <a href="#/sr6/npcs">Back to NPCs & Critters</a> : <a href="#/sr6">Back to your runners</a>
  if (!loaded || campRules === undefined) return <main className="lib"><p className="muted">Loading {noun}…</p></main>
  if (loadError) return <main className="lib"><h1>Couldn’t open this {noun}</h1><p className="err">{loadError}</p>
    <p>{back}{npc ? '.' : ', where you can download its file or try to repair it.'}</p></main>
  if (!ch || !calc) return <main className="lib"><h1>{npc ? 'NPC' : 'Runner'} not found</h1><p>It may have been deleted on the server. {back}</p></main>

  const theirs = owner !== null, career = !!ch.finalizedAt
  const { view, ...derived } = calc
  const tabs = npc ? NPC_TABS : sr6Tabs(view.build.magic, career && !ch.npc)
  const shown = tabs.some(([k]) => k === tab) ? tab : 'concept'
  const locked = career && !OPEN_IN_CAREER.has(shown), ro = theirs || locked
  // a compendium entry it uses is copied onto it (src/sr6/engine/house.ts): it keeps it if the compendium goes
  const commit = (next: Sr6Character, undoable = true) => { setRefusal(null); save.commit(keepSr6House(c, next), undoable) }
  // ledger entries aren't on the undo stack (R): Void is their undo
  const toLedger = (r: { ok: true; ch: Sr6Character } | { ok: false; reason: string }) => {
    if (!r.ok) { const why = reasonText(r.reason); setRefusal(why); return why }
    commit(r.ch, false)
    return null
  }
  const ctx: Sr6Ctx = {
    c, data, cr, ch: view, ...derived, ro, career, npc,
    edit: fn => { if (!ro) { const n = structuredClone(ch); fn(n.build); commit(n) } },
    update: fn => { if (!ro) { const n = structuredClone(ch); fn(n); commit(n) } },
    replace: next => { if (!ro) commit(next) },
    act: op => {
      if (ro) return 'This runner is read only here.'
      const r = runAct(ch, op, data, cr)
      if ('error' in r) { setRefusal(r.error); return r.error }
      commit(r.ch)
      return null
    },
    preview: (a, typed) => preview(ch, a, data, cr, typed),
    record: (a, typed) => theirs ? 'This runner is read only here.' : toLedger(record(ch, a, data, cr, typed)),
    ledger: fn => theirs ? 'This runner is read only here.' : toLedger(fn(ch)),
    undo: save.undo, redo: save.redo, canUndo: save.canUndo, canRedo: save.canRedo,
  }
  if (tab === 'print') return <Sr6Editor.Provider value={ctx}><Sr6Sheet /></Sr6Editor.Provider>
  const errors = calc.v.filter(x => x.severity === 'error' && !x.approved).length
  const name = ch.identity.streetName || ch.identity.name || (npc ? 'Unnamed NPC' : 'Unnamed runner')

  return (
    <Sr6Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">{ch.identity.portrait && <Face ch={ch} />}<span className="name">{name}</span>
          {ch.npc ? <span className="noncanon npckind">{npcChip(ch.npc)}</span> : <StateBadge finalized={career} finalTip={SR6_FINAL_TIP} />}</div>
        {!theirs && <div className="savebar"><SaveLine status={status} onRetry={() => void saveNow()} /></div>}
        <span className="spacer" />
        <HeaderBars>
          {!theirs && <>
            <IconButton icon="save" label="Save" onClick={() => void saveNow()} disabled={status.state === 'saving'} />
            <IconButton icon="close" label="Save and close" onClick={() => void saveAndClose()} />
            <IconButton icon="undo" label="Undo" disabled={!ctx.canUndo} onClick={ctx.undo} />
            <IconButton icon="redo" label="Redo" disabled={!ctx.canRedo} onClick={ctx.redo} />
          </>}
          <IconButton icon="download" label="Export file" onClick={() => theirs ? exportSr6(c, ch) : setDoc(exportSr6(c, ch))} />
          <IconButton icon="foundry" label="Export for Foundry" onClick={() => downloadSr6Runners(c, data, cr, [ch])} />
        </HeaderBars>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a key={k} href={href(ch.id, k)} aria-current={shown === k ? 'page' : undefined}>
            {label}{k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {theirs && <p className="banner readonly" role="status">Read only — {owner}’s {noun}. Only they can change it; you can still export a copy.</p>}
      {!theirs && locked && <p className="banner readonly" role="status">Finalized: spend karma and nuyen on the <a href={sr6EditHref(ch.id, 'ledger')}>Ledger tab</a>.</p>}
      {refusal && <p className="banner err" role="alert">{refusal}</p>}
      <div className="layout">
        <div className="chapter-tab" aria-hidden>{tabs.find(([k]) => k === shown)?.[1]}</div>
        <main className="work"><fieldset className="bare" disabled={ro}>
          {shown === 'concept' && <ConceptTab />}
          {shown === 'method' && <MethodTab />}
          {shown === 'attributes' && <AttributesTab />}
          {shown === 'skills' && <SkillsTab />}
          {shown === 'qualities' && <QualitiesTab />}
          {shown === 'magic' && <MagicTab />}
          {shown === 'augmentations' && <AugmentationsTab />}
          {shown === 'gear' && <GearTab />}
          {shown === 'vehicles' && <VehiclesTab />}
          {shown === 'contacts' && <ContactsTab />}
          {shown === 'review' && <ReviewTab />}
          {shown === 'ledger' && <LedgerTab />}
          {shown === 'stats' && <StatsTab />}
        </fieldset></main>
        {!npc && <Budgets />}
      </div>
      <ConflictDialog s={save} name={name} />
    </Sr6Editor.Provider>
  )
}

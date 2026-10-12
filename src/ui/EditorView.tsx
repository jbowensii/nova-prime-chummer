import { useEffect, useMemo, useState } from 'react'
import { appendEvent, balance, derive, forCampaign, keepHouse, logChange, price, rescope, settle as settleLedger, syncRealSin, validate, type TableFlags } from '../engine'
import { canEdit, useMe } from './auth'
import { loadTableRules, tableFlags } from './TableRules'
import type { CareerEvent, Catalog, Character } from '../model/types'
import { Brand, fmt, Modal, NpcChips, StateBadge } from './bits'
import { Editor, editHref, homeHref, type EditorCtx } from './editor'
import { exportCharacter } from './Library'
import { downloadRunners } from './Foundry'
import { approveRunner } from './Campaigns'
import { useRepo } from './repo'
import { ConflictDialog, SaveLine, useAutosave } from './useAutosave'
import { Receipt } from './Receipt'
import { AmpsTab } from './tabs/Amps'
import { AttributesTab } from './tabs/Attributes'
import { ConceptTab } from './tabs/Concept'
import { GearTab } from './tabs/Gear'
import { LedgerTab } from './tabs/Ledger'
import { ReviewTab } from './tabs/Review'
import { SkillsTab } from './tabs/Skills'
import { Sheet } from '../print/Sheet'
import { BookSheet } from '../print/BookSheet'
import { usePrintStyle } from '../print/shared'
import { AskRules } from './AskRules'
import { IconButton } from './icons'
import { HeaderBars } from './nav'
import { Face } from './Portrait'
import { TabBoundary } from '../shared/ui'

/** The print page: the sheet the toolbar's Sheet type (or Settings) picks. */
function PrintSheet() { return usePrintStyle() === 'book' ? <BookSheet /> : <Sheet /> }

const TABS: [string, string][] = [['concept', 'Concept'], ['attributes', 'Attributes'], ['skills', 'Skills'], ['amps', 'Shadow Amps'],
  ['gear', 'Gear & spells'], ['review', 'Review'], ['ledger', 'Ledger'], ['print', 'Print']]

interface Pending { ev: CareerEvent; summary: string; cost: number; after: number; resolve: (ok: boolean) => void }

export function EditorView({ c: all, id, tab }: { c: Catalog; id: string; tab: string }) {
  const repo = useRepo()
  const npcRoute = location.hash.startsWith('#/n/')
  const noun = npcRoute ? 'NPC' : 'runner'
  // old runners can reference unscoped catalog ids; remap them, saved normally when they change. A runner finalized
  // before 0.5.5 gets its ledger settled (engine/career.ts settle), saved with the next change.
  const save = useAutosave(repo, id, { noun, tab, editHref, home: homeHref, prepare: ch => settleLedger(all, rescope(all, ch)),
    inEditor: href => /^#\/[cn]\//.test(href) && href.slice(4).startsWith(`${id}/`) })
  const { doc: ch, setDoc: setCh, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const gm = canEdit(useMe()) // GM approval: GMs (editors) and the admin
  const [pending, setPending] = useState<Pending | null>(null)
  useEffect(() => setCh(x => x && rescope(all, x)), [all, setCh]) // same object when nothing needs remapping
  const me = useMe()
  // a player's catalog holds the compendiums shared with every campaign they play in: this runner sees its own campaign's
  const c = useMemo(() => canEdit(me) ? all : forCampaign(all, ch?.campaign), [all, me, ch?.campaign])

  const [table, setTable] = useState<TableFlags>()
  useEffect(() => { void loadTableRules().then(r => setTable(tableFlags(r))) }, [])
  const calc = useMemo(() => ch && ({ d: derive(c, ch, table), v: validate(c, ch, table), p: price(c, ch, table), bal: ch.finalizedAt ? balance(c, ch, table) : price(c, ch, table).remaining }), [c, ch, table])

  const back = npcRoute ? <a href={ch?.npc ? homeHref(ch) : '#/npcs'}>Back to NPCs &amp; Critters</a> : <a href="#/">Back to your runners</a>
  if (!loaded) return <main className="lib"><p className="muted">Loading {noun}…</p></main>
  if (loadError) return <main className="lib"><h1>Couldn’t open this {noun}</h1><p className="err">{loadError}</p>
    <p>{back}, where you can download its file or try to repair it.</p></main>
  if (!ch || !calc) return <main className="lib"><h1>{npcRoute ? 'NPC' : 'Runner'} not found</h1><p>It may have been deleted{repo.mode === 'server' ? ' on the server' : ' from this browser'}. {back}</p></main>

  const career = !!ch.finalizedAt
  // a finalized runner's build changes go in the ledger by themselves (engine/career.ts logChange); undo takes them back
  // out, except past recorded earnings (not undoable: history before them is dropped)
  // a compendium entry it uses is copied onto it (engine/file.ts keepHouse): it keeps it if the compendium goes
  const commit = (next: Character, undoable: boolean) => save.commit(keepHouse(c, logChange(c, ch, next, table)), undoable)
  const mutate = (fn: (d: Character) => void) => { const d = structuredClone(ch); fn(d); syncRealSin(c, d.build); return d }

  const ro = owner !== null
  const ctx: EditorCtx = {
    c, ch, d: calc.d, v: calc.v, p: calc.p, balance: calc.bal, career, ro, table,
    edit: fn => { if (!ro) commit(mutate(fn), true) },
    update: fn => { if (!ro) commit(mutate(fn), true) },
    record: (ev, summary) => ro ? Promise.resolve(false) : new Promise<boolean>(resolve => {
      const cost = ev.type === 'earn' ? -ev.amount : 'cost' in ev ? ev.cost : 0
      setPending({ ev, summary, cost, after: calc.bal - cost, resolve })
    }),
    replace: next => { if (!ro) commit(next, true) },
    // their own runner directly; a player's in a campaign they run (or the admin) on the server
    approve: !gm ? null : !ro ? overrides => { commit({ ...structuredClone(ch), overrides }, true); return Promise.resolve(null) }
      : ch.campaign && !npcRoute ? overrides => approveRunner('ca2', ch.campaign!, ch.id, overrides)
        .then(() => { setCh({ ...ch, overrides }); return null }, e => (e as Error).message) : null,
    undo: save.undo, redo: save.redo, canUndo: save.canUndo, canRedo: save.canRedo,
  }
  const settle = (ok: boolean) => {
    if (pending) {
      if (ok) commit(appendEvent(ch, pending.ev), false)
      pending.resolve(ok)
    }
    setPending(null)
  }

  const errors = calc.v.filter(x => x.severity === 'error' && !x.approved).length
  const npc = !!ch.npc
  const name = ch.identity.streetName || ch.identity.name || (npc ? 'Unnamed NPC' : 'Unnamed runner')
  // an NPC has no budget, Finalize or career: no ledger tab and no receipt
  const tabs = TABS.filter(([k]) => k !== 'ledger' || (career && !npc))

  if (tab === 'print') return <Editor.Provider value={ctx}><PrintSheet /></Editor.Provider>

  return (
    <Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">{ch.identity.portrait && <Face ch={ch} />}<span className="name">{name}</span>{ch.npc ? <NpcChips npc={ch.npc} /> : <StateBadge finalized={career} />}</div>
        {!ro && <div className="savebar"><SaveLine status={status} onRetry={() => void saveNow()} /></div>}
        <span className="spacer" />
        <HeaderBars>
          {!ro && <>
            <IconButton icon="save" label="Save" onClick={() => void saveNow()} disabled={status.state === 'saving'} />
            <IconButton icon="close" label="Save and close" onClick={() => void saveAndClose()} />
            <IconButton icon="undo" label="Undo" disabled={!ctx.canUndo} onClick={ctx.undo} />
            <IconButton icon="redo" label="Redo" disabled={!ctx.canRedo} onClick={ctx.redo} />
          </>}
          <IconButton icon="download" label="Export file" onClick={() => ro ? exportCharacter(c, ch) : setCh(exportCharacter(c, ch))} />
          <IconButton icon="foundry" label="Export for Foundry" onClick={() => downloadRunners(c, [ch])} />
        </HeaderBars>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a key={k} href={editHref(ch, k)} aria-current={tab === k ? 'page' : undefined} aria-label={k === 'review' && errors > 0 ? `${label}, ${errors} ${errors === 1 ? 'problem' : 'problems'}` : undefined}>
            {label}{k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {ro && <p className="banner readonly" role="status">Read only — {owner}’s {npc ? 'NPC' : 'runner'}. Only they can change it; you can still
        {' '}<a href={editHref(ch, 'print')}>print it</a> or export a copy.</p>}
      <div className="layout">
        <div className="chapter-tab" aria-hidden>{TABS.find(([k]) => k === tab)?.[1]}</div>
        <main className="work"><AskRules /><fieldset className="bare" disabled={ro && !(tab === 'review' && ctx.approve)}><TabBoundary key={tab}>
          {tab === 'concept' && <ConceptTab />}
          {tab === 'attributes' && <AttributesTab />}
          {tab === 'skills' && <SkillsTab />}
          {tab === 'amps' && <AmpsTab />}
          {tab === 'gear' && <GearTab />}
          {tab === 'review' && <ReviewTab />}
          {tab === 'ledger' && <LedgerTab />}
        </TabBoundary></fieldset></main>
        {!npc && <Receipt />}
      </div>
      <ConflictDialog s={save} name={name} />
      <Modal open={!!pending} onClose={() => settle(false)} title="Confirm"
        actions={<><button className="btn" onClick={() => settle(false)}>Cancel</button><button className="btn primary" onClick={() => settle(true)}>Record it</button></>}>
        {pending && <div className="stack">
          <p>{pending.summary}</p>
          <div>
            <div className="line"><span className="lbl">{pending.cost < 0 ? 'Earned' : 'Cost'}</span><span className="lead" /><span className="amt num">{fmt(Math.abs(pending.cost))}</span></div>
            <div className={`line${pending.after < 0 ? ' neg' : ''}`}><span className="lbl">Balance after</span><span className="lead" /><span className="amt num">{fmt(pending.after)}</span></div>
          </div>
          {pending.after < 0 && <p className="err">That puts the balance below zero. You can still record it; it shows as a problem on Review.</p>}
        </div>}
      </Modal>
    </Editor.Provider>
  )
}

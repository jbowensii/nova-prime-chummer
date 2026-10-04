// The SR6 runner's editor (#/sr6/c/<id>/<tab>): the Anarchy editor's look (topbar, tabs, the budgets panel where the
// receipt is) over useAutosave (save, conflict, undo). Read only for someone else's runner; once finalized, every tab but
// Concept and Review (R: career changes come with S3's ledger). A refused step shows its reason under the tabs. The Print
// tab shows the SR6 sheet instead (src/sr6/print/Sheet.tsx).
import { useEffect, useMemo, useState } from 'react'
import { Brand, StateBadge } from '../../ui/bits'
import { IconButton } from '../../ui/icons'
import { MainMenu } from '../../ui/nav'
import { Face } from '../../ui/Portrait'
import { ConflictDialog, SaveLine, useAutosave } from '../../ui/useAutosave'
import { allBudgets } from '../engine/budgets'
import type { CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { deriveSr6 } from '../engine/derive'
import { makeProvider } from '../engine/providers'
import { validateSr6 } from '../engine/rules'
import { MAGIC_KINDS } from '../engine/data'
import type { MagicKind, Sr6Character } from '../model/character'
import type { Sr6Catalog } from '../model/types'
import { Budgets } from './Budgets'
import { runAct, SR6_FINAL_TIP, Sr6Editor, sr6EditHref, type Sr6Ctx } from './editor'
import { exportSr6, sr6Repo } from './repo'
import { AttributesTab } from './tabs/Attributes'
import { AugmentationsTab } from './tabs/Augmentations'
import { ConceptTab } from './tabs/Concept'
import { ContactsTab } from './tabs/Contacts'
import { GearTab } from './tabs/Gear'
import { MagicTab } from './tabs/Magic'
import { MethodTab } from './tabs/Method'
import { QualitiesTab } from './tabs/Qualities'
import { ReviewTab } from './tabs/Review'
import { SkillsTab } from './tabs/Skills'
import { VehiclesTab } from './tabs/Vehicles'
import { Sr6Sheet } from '../print/Sheet'

/** Every tab; Magic only shows for an awakened or emerged runner, titled Resonance for a technomancer (sr6Tabs). */
export const SR6_TABS: [string, string][] = [['concept', 'Concept'], ['method', 'Creation method'], ['attributes', 'Attributes'],
  ['skills', 'Skills'], ['qualities', 'Qualities'], ['magic', 'Magic'], ['augmentations', 'Augmentations'], ['gear', 'Gear'],
  ['vehicles', 'Vehicles'], ['contacts', 'Contacts & lifestyle'], ['review', 'Review'], ['print', 'Print']]
export const sr6Tabs = (magic: MagicKind): [string, string][] => SR6_TABS.filter(([k]) => k !== 'magic' || magic !== 'mundane')
  .map(([k, l]) => [k, k === 'magic' && MAGIC_KINDS[magic].resonance ? 'Resonance' : l])

export function Sr6EditorView({ c, data, cr, id, tab }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; id: string; tab: string }) {
  const repo = useMemo(() => sr6Repo(), [])
  const save = useAutosave(repo, id, { noun: 'runner', tab, prepare: ch => ch, editHref: (ch, t) => sr6EditHref(ch.id, t), home: () => '#/sr6',
    inEditor: href => href.startsWith(`#/sr6/c/${id}/`) })
  const { doc: ch, setDoc, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const [refusal, setRefusal] = useState<string | null>(null)
  useEffect(() => { if (!refusal) return; const t = setTimeout(() => setRefusal(null), 6000); return () => clearTimeout(t) }, [refusal])
  const calc = useMemo(() => {
    if (!ch) return undefined
    const p = makeProvider(ch.build.method, data, cr)
    return { p, budgets: allBudgets(ch.build, data, cr, p), v: validateSr6(data, cr, ch), d: deriveSr6(data, cr, ch) }
  }, [ch, data, cr])

  const back = <a href="#/sr6">Back to your runners</a>
  if (!loaded) return <main className="lib"><p className="muted">Loading runner…</p></main>
  if (loadError) return <main className="lib"><h1>Couldn’t open this runner</h1><p className="err">{loadError}</p>
    <p>{back}, where you can download its file or try to repair it.</p></main>
  if (!ch || !calc) return <main className="lib"><h1>Runner not found</h1><p>It may have been deleted on the server. {back}</p></main>

  const theirs = owner !== null, career = !!ch.finalizedAt
  const tabs = sr6Tabs(ch.build.magic)
  const shown = tabs.some(([k]) => k === tab) ? tab : 'concept'
  const locked = career && shown !== 'concept' && shown !== 'review', ro = theirs || locked
  const commit = (next: Sr6Character) => { setRefusal(null); save.commit(next, true) }
  const ctx: Sr6Ctx = {
    c, data, cr, ch, ...calc, ro, career,
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
    undo: save.undo, redo: save.redo, canUndo: save.canUndo, canRedo: save.canRedo,
  }
  if (tab === 'print') return <Sr6Editor.Provider value={ctx}><Sr6Sheet /></Sr6Editor.Provider>
  const errors = calc.v.filter(x => x.severity === 'error' && !x.approved).length
  const name = ch.identity.streetName || ch.identity.name || 'Unnamed runner'

  return (
    <Sr6Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">{ch.identity.portrait && <Face ch={ch} />}<span className="name">{name}</span><StateBadge finalized={career} finalTip={SR6_FINAL_TIP} /></div>
        {!theirs && <div className="savebar"><SaveLine status={status} onRetry={() => void saveNow()} /></div>}
        <span className="spacer" />
        <div className="bars">
          <div className="iconbar actions">
            {!theirs && <>
              <IconButton icon="save" label="Save" onClick={() => void saveNow()} disabled={status.state === 'saving'} />
              <IconButton icon="close" label="Save and close" onClick={() => void saveAndClose()} />
              <IconButton icon="undo" label="Undo" disabled={!ctx.canUndo} onClick={ctx.undo} />
              <IconButton icon="redo" label="Redo" disabled={!ctx.canRedo} onClick={ctx.redo} />
            </>}
            <IconButton icon="download" label="Export file" onClick={() => theirs ? exportSr6(c, ch) : setDoc(exportSr6(c, ch))} />
          </div>
          <MainMenu />
        </div>
      </header>
      <nav className="tabs" aria-label="Character sections">
        {tabs.map(([k, label]) => (
          <a key={k} href={sr6EditHref(ch.id, k)} aria-current={shown === k ? 'page' : undefined}>
            {label}{k === 'review' && errors > 0 && <span className="badge err">{errors}</span>}
          </a>
        ))}
      </nav>
      {theirs && <p className="banner readonly" role="status">Read only — {owner}’s runner. Only they can change it; you can still export a copy.</p>}
      {!theirs && locked && <p className="banner readonly" role="status">Finalized: the build is read only. Career changes come with the ledger in a later update.</p>}
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
        </fieldset></main>
        <Budgets />
      </div>
      <ConflictDialog s={save} name={name} />
    </Sr6Editor.Provider>
  )
}

// The Weapon and Cyberware designers (#/sr6/weapons[/<id>[/<uid path>]], #/sr6/cyberware[/…]; owner 2026-10-31: their own
// tabs beside the vehicle Designer's wrench). A design is one saved line (Sr6Character.itemDesign, the same server store as
// vehicle designs: /api/sr6/designs, the server strips a player's `approved`). The list: New design (a catalog weapon or
// implant, or a custom cyberlimb), Copy, Export, Delete. The editor draws the runner builder's own body (ItemFitting) over
// a one-line scratch runner, so stats, Essence, Capacity, price, Availability, fit and limb rules are the Customise page's.
// A runner buys one on the Gear or Augmentations tab, or the Ledger in career (BuyItemDesign).
import { useEffect, useMemo, useState } from 'react'
import { because, canEdit, useMe } from '../../../core/ui-kit/auth'
import { Brand, Modal } from '../../../core/ui-kit/bits'
import { IconButton, IconLink } from '../../../core/ui-kit/icons'
import { HeaderBars, PageHeader } from '../../../core/chrome/nav'
import { arrange } from '../../../features/runner-store/runnerList'
import { saveAsNew } from '../../../features/runner-store/repo'
import type { Stored } from '../../../core/ui-kit/repoContext'
import { loadTrash } from '../../../features/runner-store/Trash'
import { ConflictDialog, SaveLine, useAutosave } from '../../../features/runner-store/useAutosave'
import { newId } from '../../../core/shared/types'
import { entryLabel } from '../../catalog/domain/categories'
import type { CreationRules } from '../../table-setup/domain/creation'
import type { Sr6Data } from '../../catalog/domain/data'
import { blankSr6, type Sr6Character, type Sr6ItemDesign, type Sr6Purchase } from '../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry } from '../../formats/domain/types'
import { entryOf, priced } from '../../runner-builder/domain/creation/purchases'
import { allBudgets } from '../../runner-builder/domain/creation/budgets'
import { makeProvider } from '../../runner-builder/domain/creation/providers'
import { deriveSr6 } from '../../runner-builder/domain/creation/derive'
import { CYBERLIMBS, customisable, customLimb, lineAt, type LimbLook, type LimbPart } from '../../runner-builder/domain/assets/builders'
import { n, runAct, Sr6Editor, type Sr6Ctx } from '../../runner-builder/ui/editor'
import { CatalogPicker } from '../../runner-builder/ui/Picker'
import { ItemFitting } from '../../runner-builder/ui/Builder'
import { exportSr6, sr6DesignRepo } from '../../runner-builder/ui/repo'

type Kind = Sr6ItemDesign['kind']
const PAGE: Record<Kind, string> = { weapon: 'weapons', cyberware: 'cyberware' }
const NOUN: Record<Kind, string> = { weapon: 'Weapon', cyberware: 'Cyberware' }
const href = (kind: Kind, id = '', sub = '') => `#/sr6/${PAGE[kind]}${id ? `/${id}` : ''}${sub ? `/${sub}` : ''}`
const designName = (ch: Sr6Character) => ch.identity.streetName || 'Unnamed design'
/** A catalog entry as a fresh line (the picker's rating). */
const lineOf = (e: Sr6Entry, rating?: number): Sr6Purchase => ({
  uid: newId(),
  kind: e.kind as Sr6Purchase['kind'],
  id: e.id,
  qty: 1,
  accessories: [],
  ...(rating ? { rating } : {}),
})

/** A new item design doc: the line, approved when a GM makes it (the server strips a player's mark anyway). */
export function newItemDesign(kind: Kind, line: Sr6Purchase, name: string, gm: boolean): Sr6Character {
  const doc = blankSr6('priority')
  doc.identity.streetName = name
  doc.itemDesign = { kind, line, ...(gm ? { approved: true as const } : {}) }
  return doc
}

/** The scratch runner a design is edited on: blank but for the design's one line. */
export const scratchOf = (line: Sr6Purchase): Sr6Character => {
  const ch = blankSr6('priority')
  ch.id = 'item-design'
  ch.build.purchases = [structuredClone(line)]
  return ch
}

/** The list (#/sr6/weapons, #/sr6/cyberware). */
export function Sr6ItemDesigns({ c, data, cr, kind }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; kind: Kind }) {
  const repo = useMemo(() => sr6DesignRepo(), [])
  const me = useMe(),
    gm = canEdit(me)
  const [list, setList] = useState<Stored<Sr6Character>[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [trashed, setTrashed] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [name, setName] = useState('')
  const [base, setBase] = useState<Sr6Purchase | null>(null)
  const [limb, setLimb] = useState<{ part: LimbPart; look: LimbLook }>({ part: 'arm', look: 'obvious' })
  const [toDelete, setToDelete] = useState<Sr6Character | null>(null)
  const refresh = () => {
    loadTrash(undefined, 'designs', 'sr6')
      .then(t => setTrashed(t.items.length))
      .catch(() => setTrashed(null))
    return repo.listAll().then(
      r => setList(r.stored.filter(s => s.ch.itemDesign?.kind === kind)),
      e => {
        setMsg(because('Couldn’t load the designs', (e as Error).message ?? String(e)))
        setList([])
      },
    )
  }
  useEffect(() => {
    void refresh()
  }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const store = async (x: Sr6Character) => {
    const { r } = await saveAsNew(d => repo.save(d), x, newId)
    return r.ok ? null : (r.error ?? 'Couldn’t save the design.')
  }
  const create = async (line: Sr6Purchase) => {
    const e = entryOf(line, data)
    const doc = newItemDesign(kind, line, name.trim() || (e ? entryLabel(e) : (line.name ?? NOUN[kind])), gm)
    const err = await store(doc)
    if (err) return setMsg(err)
    setCreating(false)
    location.hash = href(kind, doc.id)
  }
  const copy = async (ch: Sr6Character) => {
    const x = structuredClone(ch)
    x.id = newId()
    x.identity.streetName = `${designName(ch)} (copy)`
    if (gm) x.itemDesign!.approved = true
    else delete x.itemDesign!.approved // (a player's copy needs a GM again)
    setMsg((await store(x)) ?? `Copied ${designName(ch)}.`)
    void refresh()
  }
  const label = NOUN[kind].toLowerCase()
  return (
    <main className="lib">
      <PageHeader title={`${NOUN[kind]} designer`}>
        <IconButton
          className="primary"
          icon="plus"
          label="New design"
          onClick={() => {
            setName('')
            setBase(null)
            setCreating(true)
          }}
        />
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/sr6/designs/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">
        {kind === 'weapon'
          ? 'Weapons built your way: a catalog weapon with its accessories and modifications.'
          : 'Cyberware built your way: an implant or a custom cyberlimb with its grade, enhancements, add-ons and built-in weapons.'}{' '}
        Saved on the server and shared with everyone; a runner buys one on the {kind === 'weapon' ? 'Gear' : 'Augmentations'} tab or the Ledger. Review asks a
        GM to approve one a player made.
      </p>
      {msg && (
        <p className="banner" role="status">
          {msg}
        </p>
      )}
      {list === null ? (
        <p className="muted">Loading designs…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <p>No {label} designs yet. Start a new one.</p>
        </div>
      ) : (
        arrange(list, 'az', '').map(({ ch, owner, ownerName }) => {
          const x = ch.itemDesign!.line,
            e = entryOf(x, data),
            p = priced(x, data, cr),
            mine = !me || !owner || owner === me.username
          return (
            <div className="dossier" key={ch.id}>
              <span className="face" aria-hidden>
                {designName(ch)[0]}
              </span>
              <div>
                <a className="title" href={href(kind, ch.id)}>
                  {designName(ch)}
                </a>
                <div className="meta">
                  {[
                    e ? entryLabel(e) : x.name,
                    `${x.accessories.length} add-ons`,
                    `${n(p.cost)}¥`,
                    `Availability ${p.avail}`,
                    kind === 'cyberware' && `Essence ${n(p.essence)}`,
                    !mine && `by ${ownerName ?? owner}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {ch.itemDesign!.approved && <span className="noncanon"> GM approved</span>}
                </div>
              </div>
              <div className="row">
                <button className="btn small" aria-label={`Export ${designName(ch)}`} onClick={() => exportSr6(c, ch)}>
                  Export
                </button>
                <button className="btn small quiet" aria-label={`Copy ${designName(ch)}`} onClick={() => void copy(ch)}>
                  Copy
                </button>
                {mine && (
                  <button className="btn small quiet" aria-label={`Delete ${designName(ch)}`} onClick={() => setToDelete(ch)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={`New ${label} design`}
        actions={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!base} onClick={() => base && void create(base)}>
              Create design
            </button>
          </>
        }
      >
        <div className="grid2">
          <label>
            Name
            <input value={name} onChange={e => setName(e.target.value)} autoFocus />
          </label>
        </div>
        <div className="row" style={{ marginTop: '0.6rem', alignItems: 'center', gap: '0.5rem' }}>
          <span className="muted">Start from:</span>
          {base && <b>{(e => (e ? entryLabel(e) : base.name))(entryOf(base, data))}</b>}
          <button className="btn small" onClick={() => setPicking(true)}>
            {base ? 'Change…' : kind === 'weapon' ? 'Pick a weapon…' : 'Pick an implant…'}
          </button>
        </div>
        {kind === 'cyberware' && (
          <div className="row" style={{ marginTop: '0.6rem', alignItems: 'end', gap: '0.5rem' }}>
            <span className="muted">or a custom cyberlimb (core rulebook p. 288):</span>
            <label>
              Limb
              <select value={limb.part} onChange={e => setLimb({ ...limb, part: e.target.value as LimbPart })}>
                {Object.entries(CYBERLIMBS).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Look
              <select value={limb.look} onChange={e => setLimb({ ...limb, look: e.target.value as LimbLook })}>
                <option value="obvious">Obvious</option>
                <option value="synthetic">Synthetic</option>
              </select>
            </label>
            <button className="btn small" onClick={() => setBase(customLimb(limb.part, limb.look))}>
              Use this limb
            </button>
          </div>
        )}
      </Modal>
      {picking && (
        <CatalogPicker
          title={kind === 'weapon' ? 'Start from a weapon' : 'Start from an implant'}
          open
          onClose={() => setPicking(false)}
          kinds={kind === 'weapon' ? ['weapons'] : ['augmentations']}
          filter={kind === 'cyberware' ? e => customisable(lineOf(e), data) : undefined}
          from={{ c, cr, data }}
          onAdd={p => {
            setBase(lineOf(p.e, p.rating))
            if (!name.trim()) setName(entryLabel(p.e))
            setPicking(false)
            return null
          }}
        />
      )}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete ? designName(toDelete) : 'this design'}?`}
        actions={
          <>
            <button className="btn" onClick={() => setToDelete(null)}>
              Keep
            </button>
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await repo.remove(toDelete!.id)
                } catch (e) {
                  setMsg(because('Couldn’t delete the design', (e as Error).message ?? String(e)))
                }
                setToDelete(null)
                void refresh()
              }}
            >
              Delete design
            </button>
          </>
        }
      >
        <p>It moves to your design trash, where you can restore it or delete it for good. Runners who bought it keep theirs.</p>
      </Modal>
    </main>
  )
}

/** One design's editor (#/sr6/weapons/<id>[/<uid path>]): `sub`, a weapon built into the implant (its uid path). */
export function Sr6ItemDesignEditor({ c, data, cr, kind, id, sub }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; kind: Kind; id: string; sub?: string }) {
  const repo = useMemo(() => sr6DesignRepo(), [])
  const save = useAutosave(repo, id, {
    noun: 'design',
    tab: '',
    prepare: x => x,
    editHref: d => href(kind, d.id),
    home: () => href(kind),
    inEditor: h => h.startsWith(href(kind, id)),
  })
  const { doc, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const gm = canEdit(useMe())
  const [refusal, setRefusal] = useState<string | null>(null)
  const line = doc?.itemDesign?.line
  // the scratch runner and everything the engine says about it (the Customise page reads the same context)
  const calc = useMemo(() => {
    if (!line) return undefined
    const ch = scratchOf(line)
    const p = makeProvider(ch.build.method, data, cr)
    return { ch, p, budgets: allBudgets(ch.build, data, cr, p), d: deriveSr6(data, cr, ch) }
  }, [line, data, cr])
  const back = <a href={href(kind)}>Back to the {NOUN[kind]} designer</a>
  if (!loaded)
    return (
      <main className="lib">
        <p className="muted">Loading design…</p>
      </main>
    )
  if (loadError || !doc?.itemDesign || !calc)
    return (
      <main className="lib">
        <h1>{loadError ? 'Couldn’t open this design' : 'Design not found'}</h1>
        <p className="err">{loadError ?? 'It may have been deleted on the server.'}</p>
        <p>{back}</p>
      </main>
    )
  const ro = owner !== null
  const commit = (fn: (x: Sr6Character) => void) => {
    if (ro) return
    const next = structuredClone(doc)
    fn(next)
    save.commit(next, true)
  }
  /** the scratch runner's one line back into the design */
  const keep = (ch: Sr6Character) => commit(x => void (x.itemDesign!.line = ch.build.purchases[0]))
  const readOnly = 'This design is read only here.'
  const ctx: Sr6Ctx = {
    c,
    data,
    cr,
    table: cr,
    locks: [],
    ...calc,
    v: [],
    ro,
    career: false,
    npc: false,
    edit: fn => {
      const ch = structuredClone(calc.ch)
      fn(ch.build)
      keep(ch)
    },
    act: op => {
      if (ro) return readOnly
      const r = runAct(calc.ch, op, data, cr)
      if ('error' in r) {
        setRefusal(r.error)
        return r.error
      }
      setRefusal(null)
      keep(r.ch)
      return null
    },
    update: () => {},
    replace: () => {},
    approve: null,
    preview: () => ({ ok: false, reason: readOnly }) as unknown as ReturnType<Sr6Ctx['preview']>,
    record: () => readOnly,
    ledger: () => readOnly,
    undo: save.undo,
    redo: save.redo,
    canUndo: save.canUndo,
    canRedo: save.canRedo,
  }
  const x = calc.ch.build.purchases[0]
  const path = sub ? `${x.uid}/${sub}` : x.uid
  const shown = lineAt(calc.ch.build, path) ?? x
  const e = entryOf(shown, data)
  const name = designName(doc)
  return (
    <Sr6Editor.Provider value={ctx}>
      <header className="topbar">
        <Brand />
        <div className="who">
          <span className="name">{name}</span>
          <span className="noncanon">{NOUN[kind]} design</span>
        </div>
        {!ro && (
          <div className="savebar">
            <SaveLine status={status} onRetry={() => void saveNow()} />
          </div>
        )}
        <span className="spacer" />
        <HeaderBars>
          {!ro && (
            <>
              <IconButton icon="save" label="Save" onClick={() => void saveNow()} disabled={status.state === 'saving'} />
              <IconButton icon="close" label="Save and close" onClick={() => void saveAndClose()} />
              <IconButton icon="undo" label="Undo" disabled={!save.canUndo} onClick={save.undo} />
              <IconButton icon="redo" label="Redo" disabled={!save.canRedo} onClick={save.redo} />
            </>
          )}
          <IconButton icon="download" label="Export file" onClick={() => exportSr6(c, doc)} />
        </HeaderBars>
      </header>
      {ro && (
        <p className="banner readonly" role="status">
          Read only — {owner}’s design. Only they can change it; you can still export or copy it.
        </p>
      )}
      <main className="lib dsn">
        <p>{sub ? <a href={href(kind, id)}>Back to {name}</a> : back}</p>
        <fieldset className="bare stack builder" disabled={ro}>
          <div className="dsn-head">
            <label>
              Name
              <input value={doc.identity.streetName} onChange={ev => commit(ch => void (ch.identity.streetName = ev.target.value))} />
            </label>
            <span>
              {sub ? 'Built-in weapon: ' : 'Based on '}
              <b>{e ? entryLabel(e) : (shown.name ?? NOUN[kind])}</b>
            </span>
            <div className="dsn-flags">
              <label className="inline">
                <input
                  type="checkbox"
                  disabled={!gm}
                  checked={!!doc.itemDesign.approved}
                  onChange={ev => commit(ch => void (ev.target.checked ? (ch.itemDesign!.approved = true) : delete ch.itemDesign!.approved))}
                />{' '}
                Approved by a GM
              </label>
            </div>
          </div>
          <ItemFitting x={shown} name={e ? entryLabel(e) : (shown.name ?? 'Item')} path={path} subHref={p => href(kind, id, p.split('/').slice(1).join('/'))} />
          {refusal && <p className="err">{refusal}</p>}
        </fieldset>
      </main>
      <ConflictDialog s={save} name={name} />
    </Sr6Editor.Provider>
  )
}

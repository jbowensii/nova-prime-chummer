// The Designer (#/sr6/designs[/<id>]; owner 2026-10-16, BUILDER): vehicle and drone designs by Double Clutch's "Build
// Your Dream" (pp. 150-155), every account its own (the server's /api/sr6/designs). The list: New design (a vehicle or a
// drone), Import, Export, Copy, Delete (to the design trash, restorable). The editor follows the book's steps: chassis,
// powertrain and console; options by level (negative: in reverse; Improved Handling for on-road or off-road only), design
// modifications and quality factors; the mods built in (2 Design Points a mod slot, their nuyen added to the price);
// built yourself; and the live totals
// (src/sr6/engine/design.ts): the stats, Design Points, price, Availability, notes and warnings (never refused). A GM's
// design is approved (a GM may tick or untick it); a player's, bought by a runner, is a Review warning a GM approves.
// A runner buys one on the Vehicles or Drones tab (the Ledger after finalising): useSr6Designs.
import { useEffect, useMemo, useRef, useState } from 'react'
import { because, canEdit, useMe } from '../../ui/auth'
import { Brand, Modal, Stepper } from '../../ui/bits'
import { IconButton, IconLink } from '../../ui/icons'
import { arrange, ownerGroups } from '../../ui/Library'
import { HeaderBars, PageHeader } from '../../ui/nav'
import { saveAsNew, type Stored, type Unreadable } from '../../ui/repo'
import { loadTrash } from '../../ui/Trash'
import { ConflictDialog, SaveLine, useAutosave } from '../../ui/useAutosave'
import { newId } from '../../shared/types'
import { entryLabel } from '../engine/categories'
import type { CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { designOf, designPart, multiplierOf, partDp, type DesignPart } from '../engine/design'
import { entryOf, modKind } from '../engine/purchases'
import { blankSr6, type Sr6Character, type Sr6Design } from '../model/character'
import type { Sr6Catalog, Sr6Entry } from '../model/types'
import { n } from './editor'
import { CatalogPicker } from './Picker'
import { exportSr6, readSr6DesignImport, sr6DesignRepo } from './repo'

const designName = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed design'
const href = (id: string) => `#/sr6/designs/${id}`
/** The design parts of one kind, by name. */
const partsOf = (c: Sr6Catalog, p: DesignPart) =>
  [...c.entries.vehicledesign.values()].filter(e => designPart(e) === p).sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
/** A drone chassis (`Drone, Small`). */
const droneChassis = (e: Sr6Entry) => /drone/i.test(e.name)

/** Your own designs (for buying one on a runner): none while they load or when the server can't list them. */
export function useSr6Designs(): Sr6Character[] {
  const me = useMe()
  const [list, setList] = useState<Sr6Character[]>([])
  useEffect(() => {
    sr6DesignRepo()
      .list()
      .then(
        r => setList(r.filter(s => s.ch.design && (!s.owner || s.owner === me?.username)).map(s => s.ch)),
        () => setList([]),
      )
  }, [me?.username])
  return list
}

/** The design list (#/sr6/designs). */
export function Sr6Designs({ c, data, cr }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules }) {
  const repo = useMemo(() => sr6DesignRepo(), [])
  const me = useMe(),
    gm = canEdit(me)
  const [list, setList] = useState<Stored<Sr6Character>[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [trashed, setTrashed] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Sr6Design['kind']>('vehicle')
  const [toDelete, setToDelete] = useState<Sr6Character | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const refresh = () => {
    loadTrash(undefined, 'designs', 'sr6')
      .then(t => setTrashed(t.items.length))
      .catch(() => setTrashed(null))
    return repo.listAll().then(
      r => {
        setList(r.stored)
        setUnreadable(r.unreadable)
      },
      e => {
        setMsg(because('Couldn’t load your designs', (e as Error).message ?? String(e)))
        setList([])
      },
    )
  }
  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = (list ?? []).filter(s => !me || !s.owner || s.owner === me.username)
  const others = ownerGroups(
    (list ?? []).filter(s => !mine.includes(s)),
    unreadable.filter(u => u.owner && u.owner !== me?.username),
    'az',
    '',
  )
  /** saved under a new id if its own is taken: null, else why not */
  const store = async (x: Sr6Character) => {
    const { r } = await saveAsNew(d => repo.save(d), x, newId)
    return r.ok ? null : (r.error ?? `${designName(x)} changed elsewhere; open it to sort it out.`)
  }
  // a copy or an import is approved only when a GM saves it (a player's copy of a GM's design needs approval again)
  const own = (x: Sr6Character): Sr6Character => ({ ...x, design: { ...x.design!, approved: gm ? true : undefined } })
  const create = async () => {
    const ch = blankSr6('priority')
    ch.identity.streetName = name.trim()
    ch.design = { kind, options: [], mods: [], ...(gm ? { approved: true as const } : {}) }
    const err = await store(ch)
    if (err) return setMsg(err)
    setCreating(false)
    location.hash = href(ch.id)
  }
  const copy = async (ch: Sr6Character) => {
    const x = own({
      ...structuredClone(ch),
      id: newId(),
      identity: { ...ch.identity, streetName: `${designName(ch)} (copy)` },
      updatedAt: new Date().toISOString(),
    })
    setMsg((await store(x)) ?? `Copied ${designName(ch)}.`)
    void refresh()
  }
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const have = new Set((list ?? []).map(s => s.ch.id)),
      done: string[] = [],
      bad: string[] = []
    for (const f of [...files]) {
      const r = readSr6DesignImport(await f.text(), have)
      if (!r.ok) {
        bad.push(`${f.name}: ${r.reason}`)
        continue
      }
      const err = await store(own(r.ch))
      if (err) bad.push(`${f.name}: ${err}`)
      else done.push(designName(r.ch))
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }
  const row = ({ ch }: Stored<Sr6Character>, mine: boolean) => {
    const d = ch.design
    const s = d && designOf(d, data, cr)
    const chassis = d?.chassis && data.entry('vehicledesign', d.chassis)
    return (
      <div className="dossier" key={ch.id}>
        <span className="face" aria-hidden>
          {designName(ch)[0]}
        </span>
        <div>
          <a className="title" href={href(ch.id)}>
            {designName(ch)}
          </a>
          <div className="meta">
            {[
              d?.kind === 'drone' ? 'Drone' : 'Vehicle',
              chassis ? entryLabel(chassis) : 'no chassis yet',
              s && `${n(s.dpv)} Design Points`,
              s && `${n(s.price)}¥`,
            ]
              .filter(Boolean)
              .join(' · ')}
            {d?.approved && <span className="noncanon"> GM approved</span>}
          </div>
        </div>
        <div className="row">
          <button className="btn small" aria-label={`Export ${designName(ch)}`} onClick={() => exportSr6(c, ch)}>
            Export
          </button>
          {mine && (
            <>
              <button className="btn small quiet" aria-label={`Copy ${designName(ch)}`} onClick={() => void copy(ch)}>
                Copy
              </button>
              <button className="btn small quiet" aria-label={`Delete ${designName(ch)}`} onClick={() => setToDelete(ch)}>
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <main className="lib">
      <PageHeader title="Designer">
        <IconButton
          className="primary"
          icon="plus"
          label="New design"
          onClick={() => {
            setName('')
            setKind('vehicle')
            setCreating(true)
          }}
        />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} />
        <input
          ref={file}
          type="file"
          accept=".xml,application/xml"
          multiple
          hidden
          onChange={e => {
            void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/sr6/designs/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">
        Vehicles and drones of your own design (Double Clutch pp. 150-155), saved on the server. A runner buys one on the Vehicles or Drones tab.
      </p>
      {msg && (
        <p className="banner" role="status">
          {msg}
        </p>
      )}
      {list === null ? (
        <p className="muted">Loading designs…</p>
      ) : mine.length === 0 ? (
        <div className="empty">
          <p>No designs yet. Start a new one or import a design file.</p>
        </div>
      ) : (
        arrange(mine, 'az', '').map(s => row(s, true))
      )}
      {others.map(({ owner, name, rows }) => (
        <section key={owner} aria-label={`${name}’s designs`}>
          <h2>{name}’s designs</h2>
          {rows.map(s => row(s, false))}
        </section>
      ))}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New design"
        actions={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void create()}>
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
          <label>
            A vehicle or a drone
            <select value={kind} onChange={e => setKind(e.target.value as Sr6Design['kind'])}>
              <option value="vehicle">Vehicle</option>
              <option value="drone">Drone</option>
            </select>
          </label>
        </div>
      </Modal>
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
        <p>It moves to your design trash, where you can restore it or delete it for good. Runners who bought it keep their vehicle.</p>
      </Modal>
    </main>
  )
}

const STATS: [keyof ReturnType<typeof designOf>['stats'], string][] = [
  ['body', 'Body'],
  ['armor', 'Armor'],
  ['handling', 'Handling'],
  ['seats', 'Seats'],
  ['size', 'Size Class'],
  ['accel', 'Acceleration'],
  ['interval', 'Speed interval'],
  ['topSpeed', 'Top speed'],
  ['pilot', 'Pilot'],
  ['sensor', 'Sensor'],
]
/** A part's Design Points as listed: `4 DP a level`, `+10 DP`, `×2`. */
const dpText = (e: Sr6Entry) => {
  const m = multiplierOf(e)
  if (m !== null) return `×${m}`
  const v = partDp(e, 1)
  return v === null ? `${e.attrs.dp ?? e.attrs.bp} DP` : `${v} DP${designPart(e) === 'option' ? ' a level' : ''}`
}

/** One design's editor (#/sr6/designs/<id>). */
export function Sr6DesignEditor({ c, data, cr, id }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; id: string }) {
  const repo = useMemo(() => sr6DesignRepo(), [])
  const save = useAutosave(repo, id, {
    noun: 'design',
    tab: '',
    prepare: x => x,
    editHref: d => href(d.id),
    home: () => '#/sr6/designs',
    inEditor: h => h.startsWith(href(id)),
  })
  const { doc, loaded, loadError, owner, status, saveNow, saveAndClose } = save
  const gm = canEdit(useMe())
  const [adding, setAdding] = useState(false)
  const back = <a href="#/sr6/designs">Back to the Designer</a>
  if (!loaded)
    return (
      <main className="lib">
        <p className="muted">Loading design…</p>
      </main>
    )
  if (loadError || !doc?.design)
    return (
      <main className="lib">
        <h1>{loadError ? 'Couldn’t open this design' : 'Design not found'}</h1>
        <p className="err">{loadError ?? 'It may have been deleted on the server.'}</p>
        <p>{back}</p>
      </main>
    )
  const d = doc.design,
    ro = owner !== null
  const sheet = designOf(d, data, cr)
  const update = (fn: (d: Sr6Design, ch: Sr6Character) => void) => {
    if (ro) return
    const next = structuredClone(doc)
    fn(next.design!, next)
    save.commit(next, true)
  }
  const levelOf = (pid: string) => d.options.find(o => o.id === pid)?.level ?? 0
  const setLevel = (pid: string, level: number) =>
    update(x => {
      const o = x.options.find(y => y.id === pid)
      if (o && level) o.level = level
      else if (level) x.options.push({ id: pid, level })
      else x.options = x.options.filter(y => y.id !== pid)
    })
  // Improved Handling for on-road or off-road only (DC p. 151, DESIGNER Q2): its own price on the option
  const road = (pid: string) => d.options.find(o => o.id === pid)?.road ?? ''
  const setRoad = (pid: string, v: string) =>
    update(x => {
      const o = x.options.find(y => y.id === pid)
      if (o && (v === 'on' || v === 'off')) o.road = v
      else if (o) delete o.road
    })
  const name = designName(doc)
  const chassisList = partsOf(c, 'chassis').filter(e => droneChassis(e) === (d.kind === 'drone'))
  const pick = (what: 'chassis' | 'powertrain' | 'console', list: Sr6Entry[], label: string) => (
    <label>
      {label}
      <select value={d[what] ?? ''} onChange={e => update(x => void (e.target.value ? (x[what] = e.target.value) : delete x[what]))}>
        <option value="">None yet</option>
        {list.map(e => (
          <option key={e.id} value={e.id}>
            {entryLabel(e)} ({dpText(e)})
          </option>
        ))}
      </select>
    </label>
  )
  const toggles = (p: DesignPart) =>
    partsOf(c, p).map(e => (
      <label key={e.id} className="inline">
        <input type="checkbox" aria-label={entryLabel(e)} checked={levelOf(e.id) > 0} onChange={ev => setLevel(e.id, ev.target.checked ? 1 : 0)} />{' '}
        {entryLabel(e)} ({dpText(e)}){' '}
        <span className="muted">
          {e.source} p.{e.page}
        </span>
      </label>
    ))
  const st = sheet.stats

  return (
    <>
      <header className="topbar">
        <Brand />
        <div className="who">
          <span className="name">{name}</span>
          <span className="noncanon">{d.kind === 'drone' ? 'Drone design' : 'Vehicle design'}</span>
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
          Read only — {owner}’s design. Only they can change it; you can still export a copy.
        </p>
      )}
      <main className="lib">
        <p>{back}</p>
        <fieldset className="bare stack" disabled={ro}>
          <section className="stack" aria-label="The design">
            <div className="grid2">
              <label>
                Name
                <input value={doc.identity.streetName} onChange={e => update((_, ch) => void (ch.identity.streetName = e.target.value))} />
              </label>
              <label>
                A vehicle or a drone
                <select
                  value={d.kind}
                  onChange={e =>
                    update(x => {
                      x.kind = e.target.value as Sr6Design['kind']
                      delete x.chassis // (a vehicle's chassis isn't a drone's)
                    })
                  }
                >
                  <option value="vehicle">Vehicle</option>
                  <option value="drone">Drone</option>
                </select>
              </label>
            </div>
            <label className="inline">
              <input type="checkbox" checked={!!d.diy} onChange={e => update(x => void (e.target.checked ? (x.diy = true) : delete x.diy))} /> Do it yourself
              (half the price, p. 155; the design and build tests are the GM’s)
            </label>
            <label className="inline">
              <input
                type="checkbox"
                disabled={!gm}
                checked={!!d.approved}
                onChange={e => update(x => void (e.target.checked ? (x.approved = true) : delete x.approved))}
              />{' '}
              Approved by a GM{' '}
              {gm
                ? '(a runner who buys it needs no GM approval)'
                : '(only a GM can approve a design; a runner who buys it gets a Review warning until a GM approves it)'}
            </label>
          </section>

          <h2>1–3. Chassis, powertrain and console</h2>
          <div className="grid2">
            {pick('chassis', chassisList, 'Chassis')}
            {pick('powertrain', partsOf(c, 'powertrain'), 'Powertrain')}
            {pick('console', partsOf(c, 'console'), 'Console')}
          </div>

          <h2>4. Options</h2>
          <p className="muted">Each level adds to the vehicle; below 0 takes the option in reverse (fewer Design Points). Past a maximum is a warning.</p>
          {partsOf(c, 'option').map(e => (
            <span key={e.id} className="row">
              <Stepper label={`${entryLabel(e)} level`} value={levelOf(e.id)} min={-20} max={20} onChange={v => setLevel(e.id, v)} /> {entryLabel(e)} (
              {dpText(e)}
              {e.attrs.max ? `; at most ${e.attrs.max}` : ''}){' '}
              {/^improved handling$/i.test(e.name) && levelOf(e.id) !== 0 && (
                <select aria-label={`${entryLabel(e)}: on-road, off-road or both`} value={road(e.id)} onChange={ev => setRoad(e.id, ev.target.value)}>
                  <option value="">On-road and off-road</option>
                  <option value="on">On-road only (3 DP a level; at most 3)</option>
                  <option value="off">Off-road only (3 DP a level; at most 3)</option>
                </select>
              )}{' '}
              <span className="muted">
                {e.source} p.{e.page}
              </span>
            </span>
          ))}
          <h3>Design modifications</h3>
          {toggles('modification')}
          <h3>Quality factors</h3>
          {toggles('quality')}

          <h3>Mods built in</h3>
          <p className="muted">Each costs 2 Design Points a mod slot; its nuyen is added to the price after the × 1,000.</p>
          {d.mods.map(x => {
            const e = entryOf(x, data),
              m = sheet.mods.find(y => y.uid === x.uid)
            const label = e ? entryLabel(e) : (x.name ?? 'Custom mod')
            return (
              <span key={x.uid} className="row">
                {label}
                {x.rating ? ` ${x.rating}` : ''} · {n(m?.slots ?? 0)} slot{m?.slots === 1 ? '' : 's'}, {n(m?.dp ?? 0)} DP · {n(m?.nuyen ?? 0)}¥
                <button
                  className="btn small quiet"
                  aria-label={`Take ${label} out of the design`}
                  onClick={() => update(y => void (y.mods = y.mods.filter(z => z.uid !== x.uid)))}
                >
                  ×
                </button>
              </span>
            )
          })}
          <span className="row">
            <button className="btn small quiet" onClick={() => setAdding(true)}>
              Add a mod…
            </button>
          </span>
        </fieldset>

        <section className="stack" aria-label="Totals">
          <h2>5–6. The vehicle, its Design Points and price</h2>
          <p>
            {STATS.map(([k, l]) => `${l} ${k === 'handling' && st.offRoad !== st.handling ? `${st.handling}/${st.offRoad}` : st[k]}`).join(' · ')} · Cargo{' '}
            {st.cargoText}
          </p>
          <p>
            Design Points <b>{n(sheet.dp)}</b>
            {sheet.multiplier !== 1 && (
              <>
                {' '}
                × {n(sheet.multiplier)} = <b>{n(sheet.dpv)}</b>
              </>
            )}{' '}
            · Price {n(sheet.dpv)} × 1,000¥{sheet.modsNuyen ? ` + ${n(sheet.modsNuyen)}¥ of mods` : ''}
            {d.diy ? ', halved (do it yourself)' : ''} = <b>{n(sheet.price)}¥</b> · Availability <b>{sheet.avail}</b>
          </p>
          {sheet.notes.map(t => (
            <p key={t} className="muted">
              {t}
            </p>
          ))}
          {sheet.warnings.length > 0 && (
            <ul aria-label="Design warnings">
              {sheet.warnings.map((w, i) => (
                <li key={i} className="warn">
                  {w.message}{' '}
                  <span className="muted">
                    ({w.source} p. {w.page})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {adding && (
        <CatalogPicker
          title={`Build a mod into ${name}`}
          open
          onClose={() => setAdding(false)}
          kinds={['gear']}
          filter={e => modKind(e) !== null}
          from={{ c, cr, data }}
          onAdd={p => {
            update(x => void x.mods.push({ uid: newId(), kind: 'gear', id: p.e.id, qty: 1, accessories: [], ...(p.rating ? { rating: p.rating } : {}) }))
            return null
          }}
        />
      )}
      <ConflictDialog s={save} name={name} />
    </>
  )
}

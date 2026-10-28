// The Designer (#/sr6/designs[/<id>]; owner 2026-10-16, BUILDER): vehicle and drone designs by Double Clutch's "Build
// Your Dream" (pp. 150-155), every account its own (the server's /api/sr6/designs). The list: New design (a vehicle or a
// drone), Import, Export, Copy, Delete (to the design trash, restorable). The editor follows the book's steps: chassis,
// powertrain and console; options by level (negative: in reverse; Improved Handling for on-road or off-road only), design
// modifications and quality factors; the mods built in (2 Design Points a mod slot, their nuyen added to the price);
// built yourself; and the live totals
// (src/sr6/runner-builder/domain/assets/design.ts): the stats, Design Points, price, Availability, notes and warnings (never refused). A GM's
// design is approved (a GM may tick or untick it); a player's, bought by a runner, is a Review warning a GM approves.
// A runner buys one on the Vehicles or Drones tab (the Ledger after finalising): useSr6Designs (src/sr6/runner-builder/ui/repo.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import { because, canEdit, useMe } from '../../../core/ui-kit/auth'
import { Brand, Modal, Stepper } from '../../../core/ui-kit/bits'
import { IconButton, IconLink } from '../../../core/ui-kit/icons'
import { arrange, ownerGroups } from '../../../features/runner-store/runnerList'
import { HeaderBars, PageHeader } from '../../../core/chrome/nav'
import { saveAsNew } from '../../../features/runner-store/repo'
import { type Stored, type Unreadable } from '../../../core/ui-kit/repoContext'
import { loadTrash } from '../../../features/runner-store/Trash'
import { ConflictDialog, SaveLine, useAutosave } from '../../../features/runner-store/useAutosave'
import { newId } from '../../../core/shared/types'
import { entryLabel } from '../../catalog/domain/categories'
import { effectText } from '../../catalog/domain/effects'
import type { CreationRules } from '../../table-setup/domain/creation'
import type { Sr6Data } from '../../catalog/domain/data'
import { designOf, designPart, multiplierOf, partDp, type DesignPart } from '../../runner-builder/domain/assets/design'
import { entryOf, modKind } from '../../runner-builder/domain/creation/purchases'
import { partsOf as factoryParts } from '../../runner-builder/domain/assets/vehiclemods'
import { blankSr6, type Sr6Character, type Sr6Design } from '../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry } from '../../formats/domain/types'
import { n } from '../../runner-builder/ui/editor'
import { CatalogPicker } from '../../runner-builder/ui/Picker'
import { exportSr6, readSr6DesignImport, sr6DesignRepo } from '../../runner-builder/ui/repo'

const designName = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed design'
const href = (id: string) => `#/sr6/designs/${id}`
/** The design parts of one kind, by name. */
const partsOf = (c: Sr6Catalog, p: DesignPart) =>
  [...c.entries.vehicledesign.values()].filter(e => designPart(e) === p).sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
/** A drone chassis (`Drone, Small`). */
const droneChassis = (e: Sr6Entry) => /drone/i.test(e.name)

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
  const [baseVeh, setBaseVeh] = useState<Sr6Entry | null>(null)
  const [pickingBase, setPickingBase] = useState(false)
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
    ch.identity.streetName = name.trim() || (baseVeh ? entryLabel(baseVeh) : '')
    ch.design = { kind, ...(baseVeh ? { base: baseVeh.id } : {}), options: [], mods: [], ...(gm ? { approved: true as const } : {}) }
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
            setBaseVeh(null)
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
        <div className="row" style={{ marginTop: '0.6rem', alignItems: 'center', gap: '0.5rem' }}>
          <span className="muted">Start from a known vehicle (optional):</span>
          {baseVeh ? (
            <>
              <b>{entryLabel(baseVeh)}</b>
              <button className="btn small quiet" onClick={() => setPickingBase(true)}>
                Change…
              </button>
              <button className="btn small quiet" aria-label="Clear the starting vehicle" onClick={() => setBaseVeh(null)}>
                Clear
              </button>
            </>
          ) : (
            <button className="btn small" onClick={() => setPickingBase(true)}>
              Pick a vehicle…
            </button>
          )}
        </div>
        <p className="muted" style={{ marginTop: '0.4rem' }}>
          With a starting vehicle, the design begins at that vehicle’s stats, price and Availability and you add mods on top. Leave it empty to build from
          scratch.
        </p>
      </Modal>
      {pickingBase && (
        <CatalogPicker
          title="Start from a known vehicle"
          open
          onClose={() => setPickingBase(false)}
          kinds={['vehicles']}
          from={{ c, cr, data }}
          onAdd={p => {
            setBaseVeh(p.e)
            setKind(/drone/i.test(p.e.attrs.category ?? p.e.name) ? 'drone' : 'vehicle')
            if (!name.trim()) setName(entryLabel(p.e))
            setPickingBase(false)
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
/** What a design part does, for the row's hover tooltip: its effects (effectText) and any notes, else its name. */
const descOf = (e: Sr6Entry): string =>
  [...e.parts.filter(p => p.tag === 'effect' || p.tag === 'link').map(effectText), ...(e.notes ?? []).map(x => x.text)].filter(Boolean).join('; ') ||
  entryLabel(e)

/** A part's Design Points as listed: `4 DP a level`, `+10 DP`, `×2`. */
const dpText = (e: Sr6Entry) => {
  const m = multiplierOf(e)
  if (m !== null) return `×${m}`
  const v = partDp(e, 1)
  return v === null ? `${e.attrs.dp ?? e.attrs.bp} DP` : `${v} DP${designPart(e) === 'option' ? ' a level' : ''}`
}

/** The facing terms by where a vehicle moves: the four faces, then the top and bottom. Ground vehicles say front/rear/
 *  left/right; aircraft, ships and spacecraft keep the nautical/aero words. (Standard usage; the owner can refine.) */
type FacingSet = { fore: string; aft: string; port: string; star: string; dorsal: string; ventral: string }
const FACING: Record<'ground' | 'air' | 'water' | 'space', FacingSet> = {
  ground: { fore: 'Front', aft: 'Rear', port: 'Left', star: 'Right', dorsal: 'Roof', ventral: 'Underside' },
  air: { fore: 'Nose', aft: 'Tail', port: 'Port', star: 'Starboard', dorsal: 'Dorsal', ventral: 'Ventral' },
  water: { fore: 'Bow', aft: 'Stern', port: 'Port', star: 'Starboard', dorsal: 'Topside', ventral: 'Keel' },
  space: { fore: 'Fore', aft: 'Aft', port: 'Port', star: 'Starboard', dorsal: 'Dorsal', ventral: 'Ventral' },
}
/** Where the vehicle moves, from the chassis and powertrain names: air, water, space, else ground. */
function vehicleDomain(d: Sr6Design, data: Sr6Data): keyof typeof FACING {
  const t =
    `${d.chassis ? (data.entry('vehicledesign', d.chassis)?.name ?? '') : ''} ${d.powertrain ? (data.entry('vehicledesign', d.powertrain)?.name ?? '') : ''}`.toLowerCase()
  if (/space|orbital|rocket|spacecraft/.test(t)) return 'space'
  if (/fixed[-\s]?wing|rotor|vtol|vstol|\blta\b|aircraft|flight|\bwing\b|glide|vectored|\bair\b/.test(t)) return 'air'
  if (/boat|\bship\b|\bsub\b|submarine|watercraft|naval|\bhull\b|hover|amphib|aquatic/.test(t)) return 'water'
  return 'ground'
}

/** The six faces of a vehicle, for placing armour and weapons later. A quartered compass with a silhouette in the
 *  middle and the top/bottom faces as a pair of chips; the words follow the vehicle's domain. A reference for now. */
function FacingCircle({ drone, set }: { drone: boolean; set: FacingSet }) {
  const arcs: [keyof FacingSet, string][] = [
    ['fore', 'M60 60 L60 6 A54 54 0 0 1 114 60 Z'],
    ['star', 'M60 60 L114 60 A54 54 0 0 1 60 114 Z'],
    ['aft', 'M60 60 L60 114 A54 54 0 0 1 6 60 Z'],
    ['port', 'M60 60 L6 60 A54 54 0 0 1 60 6 Z'],
  ]
  return (
    <section className="panel dsn-facing" aria-label="Facing">
      <h3>Facing</h3>
      <svg viewBox="0 0 120 120" role="img" aria-label={`${set.fore}, ${set.aft}, ${set.port} and ${set.star} faces`}>
        {arcs.map(([k, dPath]) => (
          <path key={k} className={`arc arc-${k}`} d={dPath}>
            <title>{set[k]}</title>
          </path>
        ))}
        <circle cx="60" cy="60" r="27" className="hub" />
        <g className="sil" aria-hidden>
          {drone ? (
            <>
              <circle cx="60" cy="60" r="8" />
              <circle cx="49" cy="49" r="3.5" />
              <circle cx="71" cy="49" r="3.5" />
              <circle cx="49" cy="71" r="3.5" />
              <circle cx="71" cy="71" r="3.5" />
            </>
          ) : (
            <>
              <rect x="52" y="44" width="16" height="32" rx="4" />
              <rect x="55" y="48" width="10" height="9" rx="2" className="glass" />
            </>
          )}
        </g>
        <text x="60" y="15" className="fl">
          {set.fore.toUpperCase()}
        </text>
        <text x="60" y="110" className="fl">
          {set.aft.toUpperCase()}
        </text>
        <text x="60" y="60" className="fl" transform="rotate(90 60 60)" dy="-46">
          {set.star.toUpperCase()}
        </text>
        <text x="60" y="60" className="fl" transform="rotate(-90 60 60)" dy="-46">
          {set.port.toUpperCase()}
        </text>
      </svg>
      <div className="dsn-dv">
        <span className="chip">{set.dorsal} (top)</span>
        <span className="chip">{set.ventral} (bottom)</span>
      </div>
    </section>
  )
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
      <label key={e.id} className="inline" title={descOf(e)}>
        <input type="checkbox" aria-label={entryLabel(e)} checked={levelOf(e.id) > 0} onChange={ev => setLevel(e.id, ev.target.checked ? 1 : 0)} />{' '}
        {entryLabel(e)} ({dpText(e)})
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
      <main className="lib dsn">
        <p>{back}</p>
        <fieldset className="bare" disabled={ro}>
          {/* the build parts, the worked-out vehicle and the facing circle stay pinned at the top while the rest scrolls */}
          <div className="dsn-sticky">
            {/* header band: name and kind, with the two flags side by side */}
            <div className="dsn-head">
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
              <div className="dsn-flags">
                <label className="inline">
                  <input type="checkbox" checked={!!d.diy} onChange={e => update(x => void (e.target.checked ? (x.diy = true) : delete x.diy))} /> Do it
                  yourself — half price
                </label>
                <label className="inline">
                  <input
                    type="checkbox"
                    disabled={!gm}
                    checked={!!d.approved}
                    onChange={e => update(x => void (e.target.checked ? (x.approved = true) : delete x.approved))}
                  />{' '}
                  Approved by a GM
                </label>
              </div>
            </div>

            {/* top row: build parts, the worked-out vehicle, and the facing circle */}
            <div className="dsn-top">
              {d.base ? (
                <section className="panel" aria-label="Starting vehicle">
                  <h3>Starting vehicle</h3>
                  <p>
                    {(e => (e ? <b>{entryLabel(e)}</b> : <span className="err">this vehicle is no longer in the catalog</span>))(
                      data.entry('vehicles', d.base),
                    )}
                  </p>
                  <p className="muted">
                    Its stats, price and Availability are the baseline; add mods below. Switch to a from-scratch build to pick a chassis instead.
                  </p>
                  {(fp =>
                    fp.length > 0 && (
                      <p aria-label="Factory parts of the starting vehicle">
                        Factory parts:{' '}
                        {[...fp]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map(fpart => (
                            <span key={fpart.id} className={fpart.removed ? 'chip muted' : 'chip'}>
                              {fpart.name}
                              {fpart.origin === 'synth' ? ' (synthesized)' : ''} · {fpart.hook.replace(/^vehicle-/, '')} {fpart.cost}
                              {fpart.removed ? ' (removed)' : ''}{' '}
                              {(!fpart.removed || (d.removedParts ?? []).includes(fpart.id)) && (
                                <button
                                  className="btn small quiet"
                                  aria-label={`${fpart.removed ? 'Restore' : 'Remove'} factory part ${fpart.name}`}
                                  onClick={() =>
                                    update(x => {
                                      const rest = (x.removedParts ?? []).filter(u => u !== fpart.id)
                                      x.removedParts = fpart.removed ? rest : [...rest, fpart.id]
                                      if (!x.removedParts.length) delete x.removedParts
                                    })
                                  }
                                >
                                  {fpart.removed ? 'restore' : '×'}
                                </button>
                              )}
                            </span>
                          ))}
                      </p>
                    ))(factoryParts({ uid: '', kind: 'vehicles', id: d.base, qty: 1, accessories: [], removedParts: d.removedParts }, data))}
                  <button className="btn small quiet" onClick={() => update(x => void delete x.base)}>
                    Build from scratch instead
                  </button>
                </section>
              ) : (
                <section className="panel" aria-label="Chassis, powertrain and console">
                  <h3>Chassis, powertrain &amp; console</h3>
                  <div className="dsn-picks">
                    {pick('chassis', chassisList, 'Chassis')}
                    {pick('powertrain', partsOf(c, 'powertrain'), 'Powertrain')}
                    {pick('console', partsOf(c, 'console'), 'Console')}
                  </div>
                </section>
              )}
              <section className="panel dsn-vehicle" aria-label="The vehicle">
                <h3>The vehicle</h3>
                <div className="statgrid">
                  {STATS.map(([k, l]) => (
                    <div className="stat" key={k}>
                      <span className="sl">{l}</span>
                      <b>{k === 'handling' && st.offRoad !== st.handling ? `${st.handling}/${st.offRoad}` : st[k]}</b>
                    </div>
                  ))}
                  <div className="stat">
                    <span className="sl">Cargo</span>
                    <b>{st.cargoText}</b>
                  </div>
                </div>
              </section>
              <FacingCircle drone={sheet.drone} set={FACING[vehicleDomain(d, data)]} />
            </div>
          </div>

          {/* options, modifications and quality factors — on a from-scratch design and a based one (customising a known vehicle) */}
          <section className="panel" aria-label="Options">
            <h3>Options</h3>
            <div className="dsn-opts">
              {partsOf(c, 'option').map(e => (
                <span key={e.id} className="row" title={descOf(e)}>
                  <Stepper label={`${entryLabel(e)} level`} value={levelOf(e.id)} min={-20} max={20} onChange={v => setLevel(e.id, v)} /> {entryLabel(e)} (
                  {dpText(e)})
                  {/^improved handling$/i.test(e.name) && levelOf(e.id) !== 0 && (
                    <select aria-label={`${entryLabel(e)}: on-road, off-road or both`} value={road(e.id)} onChange={ev => setRoad(e.id, ev.target.value)}>
                      <option value="">On- and off-road</option>
                      <option value="on">On-road only</option>
                      <option value="off">Off-road only</option>
                    </select>
                  )}
                </span>
              ))}
            </div>
            <h4>Design modifications</h4>
            <div className="dsn-toggles">{toggles('modification')}</div>
            <h4>Quality factors</h4>
            <div className="dsn-toggles">{toggles('quality')}</div>
          </section>

          {/* mods built in */}
          <section className="panel" aria-label="Mods built in">
            <h3>Mods built in</h3>
            {d.mods
              .map(x => ({ x, label: entryOf(x, data) ? entryLabel(entryOf(x, data)!) : (x.name ?? 'Custom mod') }))
              .sort((a, z) => a.label.localeCompare(z.label))
              .map(({ x, label }) => {
                const m = sheet.mods.find(y => y.uid === x.uid)
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
          </section>
        </fieldset>

        <section className="receipt dsn-totals" aria-label="Design Points and price">
          <h2>Design Points &amp; price</h2>
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

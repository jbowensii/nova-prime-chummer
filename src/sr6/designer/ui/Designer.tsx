// The Designer (#/sr6/designs[/<id>]; owner 2026-10-16, BUILDER): vehicle and drone designs by Double Clutch's "Build
// Your Dream" (pp. 150-155), every account its own (the server's /api/sr6/designs). The list: New design (a vehicle or a
// drone), Import, Export, Copy, Delete (to the design trash, restorable). The editor follows the book's steps: chassis,
// powertrain and console; options by level (negative: in reverse; Improved Handling for on-road or off-road only), design
// modifications and quality factors; the mods built in (2 Design Points a mod slot, their nuyen added to the price);
// built yourself; and the live totals
// (src/sr6/runner-builder/domain/assets/design.ts): the stats, Design Points, price, Availability, notes and warnings (never refused). A GM's
// design is approved (a GM may tick or untick it); a player's, bought by a runner, is a Review warning a GM approves.
// A runner buys one on the Vehicles or Drones tab (the Ledger after finalising): useSr6Designs (src/sr6/runner-builder/ui/repo.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import { entryKey } from '../../catalog/domain/names'
import type { CreationRules } from '../../table-setup/domain/creation'
import type { Sr6Data } from '../../catalog/domain/data'
import { basePowertrain, chassisOf, powertrainOf, designOf, designPart, multiplierOf, partDp, type DesignPart } from '../../runner-builder/domain/assets/design'
import { entryOf, isMount, modKind } from '../../runner-builder/domain/creation/purchases'
import { HARDPOINT_PARTS, hardpointCheck } from '../../runner-builder/domain/assets/milspec'
import { normName } from '../../catalog/domain/names'
import { partsOf as factoryParts } from '../../runner-builder/domain/assets/vehiclemods'
import { blankSr6, type PurchaseKind, type Sr6Character, type Sr6Design, type Sr6Purchase } from '../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry } from '../../formats/domain/types'
import { n } from '../../runner-builder/ui/editor'
import { sr6Row } from '../../runner-builder/ui/EntryRef'
import { EntryHover } from '../../../core/ui-kit/EntryHover'
import { ACCESSORY_KINDS, CatalogPicker, isAccessory } from '../../runner-builder/ui/Picker'
import { exportSr6, readSr6DesignImport, sr6DesignRepo } from '../../runner-builder/ui/repo'

const designName = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed design'
const href = (id: string) => `#/sr6/designs/${id}`
/** The design parts of one kind, by name. An option the catalog lists one entry per level (`Improved Body 1` … `4`, the
 *  one-item-per-level rule) is its family's one row again, taken in levels with its stepper. */
const partsOf = (c: Sr6Catalog, p: DesignPart) =>
  [
    ...new Map(
      [...c.entries.vehicledesign.values()].map(e => {
        const parent = e.attrs.family ? c.levels?.get(entryKey('vehicledesign', e.attrs.family))?.parent : undefined
        return [(parent ?? e).id, parent ?? e] as const
      }),
    ).values(),
  ]
    .filter(e => designPart(e) === p && !HARDPOINT_PARTS.test(partKey(e)))
    .sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
const partKey = (e: Sr6Entry) =>
  normName(e.name)
    .replace(/[^a-z]+/g, ' ')
    .trim()
/** Deadly Arts p. 151: one specialty armor; the mil-spec frame never with Increased Structural Integrity */
const SPECIALTY = /^(airframe ceramic plate|heavy mil spec plate|mil spec plate)$/
/** The weapons a hardpoint can take: vehicle weapons (DA's mil-spec ones among them) */
const vehicleWeapons = (c: Sr6Catalog) =>
  [...c.entries.weapons.values()].filter(w => /^WEAPON_VEHICLE/.test(w.attrs.class ?? '')).sort((a, z) => entryLabel(a).localeCompare(entryLabel(z)))
/** The custom-chassis form's fields: the chassis table's own columns (DP, Body, Armor, Handling, Seats, Size Class). */
const CUSTOM = '__custom'
const OWN = '__own'
const CHASSIS_FIELDS = [
  ['name', 'Chassis name'],
  ['dp', 'Chassis DP'],
  ['body', 'Chassis Body'],
  ['armor', 'Chassis Armor'],
  ['handling', 'Chassis Handling'],
  ['seats', 'Chassis Seats'],
  ['sizeClass', 'Chassis Size Class'],
] as const
/** The custom-powertrain form's fields: the powertrain table's own columns (DP, Acceleration, Speed Interval, Top Speed). */
const POWERTRAIN_FIELDS = [
  ['name', 'Powertrain name'],
  ['dp', 'Powertrain DP'],
  ['accel', 'Powertrain Acceleration'],
  ['interval', 'Powertrain Speed Interval'],
  ['topSpeed', 'Powertrain Top Speed'],
] as const
const CUSTOM_FIELDS = { chassis: CHASSIS_FIELDS, powertrain: POWERTRAIN_FIELDS }
type CustomPart = keyof typeof CUSTOM_FIELDS
const customKey = { chassis: 'customChassis', powertrain: 'customPowertrain' } as const
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

  // (weapon and cyberware designs, the item builders': their own list below, shared with everyone)
  const items = (list ?? []).filter(s => s.ch.itemDesign)
  const mine = (list ?? []).filter(s => !s.ch.itemDesign && (!me || !s.owner || s.owner === me.username))
  const others = ownerGroups(
    (list ?? []).filter(s => !s.ch.itemDesign && !mine.includes(s)),
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
    const chassis = d && chassisOf(d, data)
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
      <section aria-label="Weapon and cyberware designs">
        <h2>Weapon and cyberware designs</h2>
        <p className="muted">
          Saved from a runner’s weapon or cyberware builder (Customise on a weapon or an implant). Everyone sees them and any runner can buy one on the Gear or
          Augmentations tab; Review asks a GM to approve one a player made.
        </p>
        {items.length === 0 ? (
          <p className="muted">None yet.</p>
        ) : (
          arrange(items, 'az', '').map(({ ch, owner, ownerName }) => {
            const x = ch.itemDesign!.line,
              e = entryOf(x, data),
              mineToo = !me || !owner || owner === me.username
            return (
              <div className="dossier" key={ch.id}>
                <span className="face" aria-hidden>
                  {designName(ch)[0]}
                </span>
                <div>
                  <span className="title">{designName(ch)}</span>
                  <div className="meta">
                    {[
                      ch.itemDesign!.kind === 'weapon' ? 'Weapon' : 'Cyberware',
                      e ? entryLabel(e) : x.name,
                      `${x.accessories.length} add-ons`,
                      !mineToo && `by ${ownerName ?? owner}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {ch.itemDesign!.approved && <span className="noncanon"> GM approved</span>}
                  </div>
                </div>
                {mineToo && (
                  <div className="row">
                    <button className="btn small quiet" aria-label={`Delete ${designName(ch)}`} onClick={() => setToDelete(ch)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </section>
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
  ['accel', 'Accel'],
  ['interval', 'Speed interval'],
  ['topSpeed', 'Top speed'],
  ['pilot', 'Pilot'],
  ['sensor', 'Sensor'],
]
/** A design part's name with the app's hover card (the same one Game data shows: the book text, page, Design Points, maximum level and effects). */
const Hover = ({ c, e, children }: { c: Sr6Catalog; e: Sr6Entry; children: ReactNode }) => (
  <EntryHover row={() => sr6Row(c, e)} kind="Design part">
    {children}
  </EntryHover>
)

/** A part's Design Points as listed: `4 DP a level`, `+10 DP`, `×2`. */
const dpText = (e: Sr6Entry) => {
  const m = multiplierOf(e)
  if (m !== null) return `×${m}`
  const fp = /^\s*(\d+)\s*\+\s*(\d+)\s*x/i.exec(e.attrs.dp ?? '') // (`10+5 x Rating`: Mil-Spec Frame)
  if (fp) return `${fp[1]} DP + ${fp[2]} DP a level`
  if (/x\s*armor/i.test(e.attrs.dp ?? '')) return `${/\d+/.exec(e.attrs.dp!)![0]} DP × Armor`
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
  const t = `${chassisOf(d, data)?.name ?? ''} ${powertrainOf(d, data)?.name ?? ''}`.toLowerCase()
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
  // a weapon picked for a mount mod (`mount`: its uid), or an accessory for a weapon in one (`weapon`: its uid)
  const [arming, setArming] = useState<{ mount: string } | { weapon: string } | null>(null)
  const [makingC, setMakingC] = useState<{ what: CustomPart; f: Record<string, string> } | null>(null)
  const [making, setMaking] = useState<Record<'name' | 'cost' | 'slots' | 'rating' | 'avail', string> | null>(null)
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
  // an older design may hold a level entry (`improved-body.4`): it counts toward its option's stepper, and folds into it on change
  const stepOf = (o: { id: string; level: number }, pid: string) => {
    const e = data.entry('vehicledesign', o.id)
    return e?.attrs.level && data.family?.('vehicledesign', o.id)?.parent?.id === pid ? o.level * Number(e.attrs.level) : 0
  }
  const levelOf = (pid: string) => d.options.reduce((n, o) => n + (o.id === pid ? o.level : stepOf(o, pid)), 0)
  const setLevel = (pid: string, level: number) =>
    update(x => {
      x.options = x.options.filter(y => !stepOf(y, pid))
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
      <select
        value={what !== 'console' && d[customKey[what]] ? CUSTOM : (d[what] ?? '')}
        onChange={e => {
          if (what !== 'console' && e.target.value === CUSTOM) return setMakingC({ what, f: Object.fromEntries(CUSTOM_FIELDS[what].map(([k]) => [k, ''])) })
          update(x => {
            if (what !== 'console') delete x[customKey[what]]
            if (e.target.value) x[what] = e.target.value
            else delete x[what]
          })
        }}
      >
        <option value="">None yet</option>
        {what !== 'console' && (cc => <option value={CUSTOM}>{cc ? `${cc.name} (custom, ${cc.dp} DP)` : `Custom ${what}…`}</option>)(d[customKey[what]])}
        {list.map(e => (
          <option key={e.id} value={e.id}>
            {entryLabel(e)} ({dpText(e)})
          </option>
        ))}
      </select>
    </label>
  )
  // a based design's powertrain (owner 2026-10-30): its own type's Double Clutch row preselected; another swaps it in
  // (its factory part taken off, the chosen one built in), None takes it off, its own row puts it back
  const own = basePowertrain(d, data),
    ownIds = own.parts.map(p => p.attrs.id),
    ownOff = ownIds.length > 0 && ownIds.every(i => (d.removedParts ?? []).includes(i))
  const setOff = (x: Sr6Design, off: boolean) => {
    const rest = (x.removedParts ?? []).filter(u => !ownIds.includes(u))
    x.removedParts = off ? [...rest, ...ownIds] : rest
    if (!x.removedParts.length) delete x.removedParts
  }
  const basePick = (
    <label>
      Powertrain
      <select
        value={d.customPowertrain ? CUSTOM : (d.powertrain ?? (ownOff ? '' : own.row ? own.row.id : ownIds.length ? OWN : ''))}
        onChange={e => {
          const v = e.target.value
          if (v === CUSTOM) return setMakingC({ what: 'powertrain', f: Object.fromEntries(POWERTRAIN_FIELDS.map(([k]) => [k, ''])) })
          update(x => {
            delete x.customPowertrain
            delete x.powertrain
            if (v === OWN || (own.row && v === own.row.id)) setOff(x, false)
            else {
              setOff(x, true)
              if (v) x.powertrain = v
            }
          })
        }}
      >
        <option value="">None</option>
        {ownIds.length > 0 && !own.row && <option value={OWN}>{own.type ?? 'Its own'} (its own; no Double Clutch powertrain row)</option>}
        {(cc => <option value={CUSTOM}>{cc ? `${cc.name} (custom, ${cc.dp} DP)` : 'Custom powertrain…'}</option>)(d.customPowertrain)}
        {partsOf(c, 'powertrain').map(e => (
          <option key={e.id} value={e.id}>
            {entryLabel(e)} ({dpText(e)}){own.row?.id === e.id ? ' (its own)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
  // the custom chassis/powertrain: Edit and Remove when one is set, its form while making one
  const customsUi = (whats: CustomPart[]) => (
    <>
      {!makingC &&
        whats.map(what =>
          (cc =>
            cc && (
              <p className="row" key={what}>
                <button
                  className="btn small quiet"
                  type="button"
                  onClick={() =>
                    setMakingC({
                      what,
                      f: Object.fromEntries(
                        [...CUSTOM_FIELDS[what].map(([k]) => k), 'cargoFrom', 'cargo'].map(k => [k, String((cc as Record<string, unknown>)[k] ?? '')]),
                      ),
                    })
                  }
                >
                  Edit custom {what}
                </button>
                <button
                  className="btn small quiet"
                  type="button"
                  onClick={() =>
                    update(x => {
                      delete x[customKey[what]]
                      if (x.base && what === 'powertrain') setOff(x, false) // (its factory powertrain back, not none)
                    })
                  }
                >
                  Remove custom {what}
                </button>
              </p>
            ))(d[customKey[what]]),
        )}
      {makingC && (
        <form
          className="row"
          aria-label={`Custom ${makingC.what}`}
          onSubmit={e => {
            e.preventDefault()
            const { what, f } = makingC
            if (!f.name.trim()) return
            const vals: Record<string, unknown> = Object.fromEntries(CUSTOM_FIELDS[what].map(([k]) => [k, k === 'name' ? f.name.trim() : Number(f[k]) || 0]))
            if (what === 'chassis') {
              if (f.cargoFrom === 'size') vals.cargoFrom = 'size'
              if ((f.cargo ?? '').trim() !== '' && Number.isFinite(Number(f.cargo))) vals.cargo = Number(f.cargo)
            }
            update(x => {
              delete x[what]
              x[customKey[what]] = vals as never
              if (x.base && what === 'powertrain') setOff(x, true) // (swapped in: its own taken off)
            })
            setMakingC(null)
          }}
        >
          {CUSTOM_FIELDS[makingC.what].map(([k, label]) => (
            <label key={k}>
              {label}
              <input value={makingC.f[k]} onChange={e => setMakingC({ ...makingC, f: { ...makingC.f, [k]: e.target.value } })} />
            </label>
          ))}
          {makingC.what === 'chassis' && (
            <>
              <label>
                Chassis Cargo from
                <select value={makingC.f.cargoFrom ?? ''} onChange={e => setMakingC({ ...makingC, f: { ...makingC.f, cargoFrom: e.target.value } })}>
                  <option value="">Seats (Commlink6)</option>
                  <option value="size">Size Class table (Double Clutch)</option>
                </select>
              </label>
              <label>
                Chassis Cargo (CF, over either)
                <input value={makingC.f.cargo ?? ''} onChange={e => setMakingC({ ...makingC, f: { ...makingC.f, cargo: e.target.value } })} />
              </label>
            </>
          )}
          <button className="btn small" type="submit" disabled={!makingC.f.name.trim()}>
            Save {makingC.what}
          </button>
          <button className="btn small quiet" type="button" onClick={() => setMakingC(null)}>
            Cancel
          </button>
        </form>
      )}
    </>
  )
  // blocked combos (DA p. 151): a second specialty armor; the frame beside Increased Structural Integrity
  const isi = d.mods.some(m => /increased structural integrity/i.test(entryOf(m, data)?.name ?? m.name ?? ''))
  const blocked = (e: Sr6Entry) => {
    const k = partKey(e)
    if (levelOf(e.id) !== 0) return undefined
    if (k === 'mil spec frame' && isi) return 'not with Increased Structural Integrity'
    if (SPECIALTY.test(k) && partsOf(c, 'option').some(o => o.id !== e.id && SPECIALTY.test(partKey(o)) && levelOf(o.id) !== 0))
      return 'only one specialty armor'
    return undefined
  }
  const frameOn = partsOf(c, 'option').some(o => partKey(o) === 'mil spec frame' && levelOf(o.id) > 0)
  const setHp = (i: number, fn: (h: NonNullable<Sr6Design['hardpoints']>[number]) => void) =>
    update(x => {
      fn(x.hardpoints![i])
    })
  const toggles = (p: DesignPart) =>
    partsOf(c, p).map(e => (
      <label key={e.id} className="inline">
        <input type="checkbox" aria-label={entryLabel(e)} checked={levelOf(e.id) > 0} onChange={ev => setLevel(e.id, ev.target.checked ? 1 : 0)} />{' '}
        <Hover c={c} e={e}>
          {entryLabel(e)} ({dpText(e)})
        </Hover>
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
                      delete x.customChassis
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
                  {/* its chassis (the vehicle's own type) and its powertrain, swappable, by the chassis */}
                  <div className="dsn-picks" aria-label="Chassis and powertrain of the starting vehicle">
                    <p>Chassis: {data.entry('vehicles', d.base)?.attrs.category ?? '—'}</p>
                    {basePick}
                  </div>
                  {ownIds.length > 0 && !own.row && (
                    <p className="err">
                      Its powertrain ({own.type ?? ownIds.join(', ')}) is no Double Clutch powertrain row: a swap uses the new one’s starting values.
                    </p>
                  )}
                  {customsUi(['powertrain'])}
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
                                      if (fpart.removed && fpart.hook === 'vehicle-powertrain') {
                                        delete x.powertrain // (its own powertrain back: no swap)
                                        delete x.customPowertrain
                                      }
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
                  {customsUi(['chassis', 'powertrain'])}
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
                  {sheet.milspec.damageReduction > 0 && (
                    <div className="stat" title="Mil-spec plate: incoming attacks' DV reduced by its Rating (DA p. 151)">
                      <span className="sl">Damage reduction</span>
                      <b>−{sheet.milspec.damageReduction} DV</b>
                    </div>
                  )}
                  {sheet.milspec.resistBody > 0 && (
                    <div className="stat" title="Mil-Spec Frame: Body when resisting damage (DA p. 151)">
                      <span className="sl">Body resisting damage</span>
                      <b>+{sheet.milspec.resistBody}</b>
                    </div>
                  )}
                  {sheet.milspec.armorPool > 0 && (
                    <div className="stat" title="Airframe Ceramic Plate: half the Armor as a dice pool bonus (DA p. 151)">
                      <span className="sl">Armor dice</span>
                      <b>+{sheet.milspec.armorPool}</b>
                    </div>
                  )}
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
                <span key={e.id} className="row">
                  <Stepper
                    label={`${entryLabel(e)} level`}
                    value={levelOf(e.id)}
                    min={blocked(e) ? 0 : -20}
                    max={blocked(e) ? 0 : 20}
                    onChange={v => setLevel(e.id, v)}
                  />{' '}
                  <Hover c={c} e={e}>
                    {entryLabel(e)} ({dpText(e)})
                  </Hover>
                  {blocked(e) && <span className="muted"> — {blocked(e)}</span>}
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

          {/* mil-spec hardpoints and the weapons on them (DA pp. 151-153) */}
          <section className="panel" aria-label="Mil-spec hardpoints">
            <h3>Mil-spec hardpoints</h3>
            {(d.hardpoints ?? []).map((h, i) => {
              const r = sheet.milspec.hardpoints[i] ?? hardpointCheck(h, st.body)
              return (
                <div key={i} className="row" aria-label={`Hardpoint ${i + 1}`}>
                  <Stepper label={`Hardpoint ${i + 1} Grade`} value={h.grade} min={0} max={12} onChange={v => setHp(i, x => void (x.grade = v))} /> Grade
                  <select
                    aria-label={`Hardpoint ${i + 1} weapon`}
                    value={h.weapon ?? ''}
                    onChange={e => setHp(i, x => void (e.target.value ? (x.weapon = e.target.value) : delete x.weapon))}
                  >
                    <option value="">(no weapon)</option>
                    {vehicleWeapons(c).map(w => (
                      <option key={w.id} value={w.id}>
                        {entryLabel(w)}
                      </option>
                    ))}
                  </select>
                  <label className="inline">
                    Size{r.size !== undefined && !r.sizeTyped ? ` ${r.size} (catalog)` : ''}, override
                    <input
                      aria-label={`Hardpoint ${i + 1} weapon Size`}
                      type="number"
                      min={0}
                      max={12}
                      value={h.size ?? ''}
                      onChange={e => setHp(i, x => void (e.target.value === '' ? delete x.size : (x.size = Number(e.target.value))))}
                    />
                  </label>
                  <select
                    aria-label={`Hardpoint ${i + 1} mount`}
                    value={h.mount ?? ''}
                    onChange={e => setHp(i, x => void (e.target.value ? (x.mount = e.target.value as 'inline' | 'open') : delete x.mount))}
                  >
                    <option value="">Turreted</option>
                    <option value="inline">Inline (−2)</option>
                    <option value="open">Open (−2)</option>
                  </select>
                  <label className="inline">
                    <input type="checkbox" checked={!!h.popOut} onChange={e => setHp(i, x => void (e.target.checked ? (x.popOut = true) : delete x.popOut))} />{' '}
                    Pop-out (+1)
                  </label>
                  <select
                    aria-label={`Hardpoint ${i + 1} linked`}
                    value={h.link ?? ''}
                    onChange={e => setHp(i, x => void (e.target.value ? (x.link = e.target.value as 'twin' | 'quad') : delete x.link))}
                  >
                    <option value="">Single</option>
                    <option value="twin">Twin linked (+1)</option>
                    <option value="quad">Quad linked (+2)</option>
                  </select>
                  <label className="inline">
                    <input
                      type="checkbox"
                      checked={!!h.dedicated}
                      onChange={e => setHp(i, x => void (e.target.checked ? (x.dedicated = true) : delete x.dedicated))}
                    />{' '}
                    Dedicated primary
                  </label>{' '}
                  · {n(r.dp)} DP · Body {r.minBody}+ <b className={r.ok ? 'ok' : 'err'}>{r.ok ? 'fits' : 'does not fit'}</b>
                  {r.reasons.map(t => (
                    <span key={t} className="err">
                      {' '}
                      {t}
                    </span>
                  ))}
                  {r.notes.map(t => (
                    <span key={t} className="muted">
                      {' '}
                      {t}
                    </span>
                  ))}
                  <button
                    className="btn small quiet"
                    aria-label={`Remove hardpoint ${i + 1}`}
                    onClick={() =>
                      update(x => {
                        x.hardpoints = x.hardpoints!.filter((_, j) => j !== i)
                        if (!x.hardpoints.length) delete x.hardpoints
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              )
            })}
            <button className="btn small quiet" onClick={() => update(x => void (x.hardpoints = [...(x.hardpoints ?? []), { grade: 1 }]))}>
              Add a hardpoint
            </button>
          </section>

          {/* mods built in */}
          <section className="panel" aria-label="Mods built in">
            <h3>Mods built in</h3>
            {d.mods
              .filter(x => x.kind !== 'weapons') // (a weapon is shown under the mount it is in)
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
                    {(e => e && isMount(e))(entryOf(x, data)) && <MountWeapon mount={x} />}
                  </span>
                )
              })}
            <span className="row">
              <button className="btn small quiet" onClick={() => setAdding(true)}>
                Add a mod…
              </button>
              <button className="btn small quiet" onClick={() => setMaking({ name: '', cost: '', slots: '', rating: '', avail: '' })}>
                Create a mod…
              </button>
            </span>
            {making && (
              <form
                className="row"
                aria-label="Create a mod"
                onSubmit={e => {
                  e.preventDefault()
                  const f = making,
                    nm = f.name.trim()
                  if (!nm) return
                  update(
                    y =>
                      void y.mods.push({
                        uid: newId(),
                        kind: 'gear',
                        name: nm,
                        qty: 1,
                        accessories: [],
                        cost: Math.max(0, Number(f.cost) || 0),
                        avail: Math.max(0, Number(f.avail) || 0),
                        ...(Number(f.slots) > 0 ? { slots: Number(f.slots) } : {}),
                        ...(Number(f.rating) > 0 ? { rating: Number(f.rating) } : {}),
                      }),
                  )
                  setMaking(null)
                }}
              >
                {(['name', 'cost', 'slots', 'rating', 'avail'] as const).map(k => (
                  <label key={k}>
                    {{ name: 'Mod name', cost: 'Mod price ¥', slots: 'Mod slots', rating: 'Mod rating', avail: 'Mod avail' }[k]}
                    <input value={making[k]} onChange={e => setMaking({ ...making, [k]: e.target.value })} />
                  </label>
                ))}
                <button className="btn small" type="submit" disabled={!making.name.trim()}>
                  Save mod
                </button>
                <button className="btn small quiet" type="button" onClick={() => setMaking(null)}>
                  Cancel
                </button>
              </form>
            )}
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
          filter={e => modKind(e) !== null && !(frameOn && /increased structural integrity/i.test(e.name))}
          from={{ c, cr, data }}
          onAdd={p => {
            update(x => void x.mods.push({ uid: newId(), kind: 'gear', id: p.e.id, qty: 1, accessories: [], ...(p.rating ? { rating: p.rating } : {}) }))
            return null
          }}
        />
      )}
      {arming && (
        <CatalogPicker
          title={'mount' in arming ? `Put a weapon in the mount` : `Fit an accessory to the weapon`}
          open
          onClose={() => setArming(null)}
          kinds={'mount' in arming ? ['weapons'] : ACCESSORY_KINDS}
          filter={'mount' in arming ? e => !isAccessory(e) : isAccessory}
          from={{ c, cr, data }}
          onAdd={p => {
            const line = { uid: newId(), kind: p.e.kind as PurchaseKind, id: p.e.id, qty: 1, accessories: [], ...(p.rating ? { rating: p.rating } : {}) }
            update(y => {
              if ('mount' in arming) y.mods.push({ ...line, mount: arming.mount })
              else y.mods.find(z => z.uid === arming.weapon)?.accessories.push(line)
            })
            setArming(null)
            return null
          }}
        />
      )}
      <ConflictDialog s={save} name={name} />
    </>
  )

  /** A mount mod's weapon (part of the design: its price and Availability count) and the weapon's accessories, each removable. */
  function MountWeapon({ mount }: { mount: Sr6Purchase }) {
    const w = d.mods.find(z => z.kind === 'weapons' && z.mount === mount.uid)
    const label = (x: Sr6Purchase) => (e => (e ? entryLabel(e) : (x.name ?? 'Weapon')))(entryOf(x, data))
    if (!w)
      return (
        <button className="btn small quiet" aria-label={`Put a weapon in ${label(mount)}`} onClick={() => setArming({ mount: mount.uid })}>
          Weapon…
        </button>
      )
    return (
      <span className="row" aria-label={`Weapon in ${label(mount)}`}>
        holds {label(w)}
        <button
          className="btn small quiet"
          aria-label={`Take ${label(w)} out of ${label(mount)}`}
          onClick={() => update(y => void (y.mods = y.mods.filter(z => z.uid !== w.uid)))}
        >
          ×
        </button>
        {w.accessories.map(a => (
          <span key={a.uid} className="chip">
            {label(a)}{' '}
            <button
              className="btn small quiet"
              aria-label={`Remove ${label(a)} from ${label(w)}`}
              onClick={() => update(y => void (y.mods.find(z => z.uid === w.uid)!.accessories = w.accessories.filter(z => z.uid !== a.uid)))}
            >
              ×
            </button>
          </span>
        ))}
        <button className="btn small quiet" aria-label={`Add an accessory to ${label(w)}`} onClick={() => setArming({ weapon: w.uid })}>
          Accessory…
        </button>
      </span>
    )
  }
}

// The Shadowrun 6 runners page (#/sr6): your runners (and, for the admin and editors, other accounts' as Anarchy's list
// shows them), New runner (a creation method whose settings aren't all set can't be picked and says what's missing), Import
// file (an Anarchy runner is refused with where it belongs), Export, Delete (to the SR6 trash), sort and search, and the
// files that can't be read with Download and Try to repair; each runner's SR6 campaign tag, Add to campaign… and Remove from
// campaign (Anarchy's dialog; no campaign filter or duplicates finder, R); Load example characters copies the imported
// books' sample runners (custom/sr6/imported/samples.xml) not loaded yet.
import { useEffect, useMemo, useRef, useState } from 'react'
import { because, isAdmin, savesSettled, send, useMe } from '../../ui/auth'
import { joined, loadCampaigns, type Campaign } from '../../ui/Campaigns'
import { Modal, StateBadge } from '../../ui/bits'
import { IconButton, IconLink } from '../../ui/icons'
import { arrange, ownerGroups, type SortBy } from '../../ui/Library'
import { PageHeader } from '../../ui/nav'
import { Face } from '../../ui/Portrait'
import { saveAsNew, type Stored, type Unreadable } from '../../ui/repo'
import { loadTrash } from '../../ui/Trash'
import { expandKeys, missingFor, type CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { ExportRunnersDialog } from '../../ui/Foundry'
import { validateSr6 } from '../engine/rules'
import { newId } from '../../model/types'
import { xmlToSr6 } from '../engine/charxml'
import { blankSr6, SR6_METHOD_LABELS, SR6_METHODS, type Sr6Character, type Sr6Method } from '../model/character'
import type { Sr6Catalog } from '../model/types'
import { rulesForRunner } from './Creation'
import { withSampleFixes } from '../engine/samplefix'
import { SR6_FINAL_TIP } from './editor'
import { downloadSr6Runners, SR6_FOUNDRY_ABOUT } from './Foundry'
import { exportSr6, readSr6Import, repairSr6, sr6Repo } from './repo'

const SORT_KEY = 'ca2.sr6.library.sort'
/** The legacy server's answer (an account called sr6 from before holds the SR6 folder). */
export const LEGACY = 'An account called sr6 is in the way: the admin renames it on the Users page.'
const shownName = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'

/** The imported books' sample runners (custom/sr6/imported/samples.xml, the importer's list): each file's url, name and
 *  key (`<source>|<sample id>`, recorded on a copy as sampleKey); none before an import or when it can't be read. */
export async function sr6Samples(): Promise<{ url: string; name: string; key: string }[]> {
  const res = await fetch('./custom/sr6/imported/samples.xml', { cache: 'no-cache' }).catch(() => null)
  const xml = res?.ok ? new DOMParser().parseFromString(await res.text(), 'text/xml') : null
  if (xml?.documentElement.localName !== 'samples') return []
  return [...xml.documentElement.getElementsByTagName('sample')].map(s => {
    const href = s.getAttribute('href') ?? ''
    return {
      url: `./custom/sr6/imported/${href}`,
      name: s.getAttribute('name') ?? '',
      key: `${s.getAttribute('source') ?? ''}|${href
        .split('/')
        .pop()!
        .replace(/\.xml$/, '')}`,
    }
  })
}
/** The samples Load example characters adds: those whose key isn't the sampleKey of one of `mine` (a renamed copy counts). */
export function samplesToLoad<T extends { key: string }>(rows: T[], mine: Sr6Character[]): T[] {
  const have = new Set(mine.map(ch => ch.sampleKey))
  return rows.filter(r => !have.has(r.key))
}

/** What `method` still needs, in the Game data form's words. */
export function missingLabels(method: Sr6Method, cr: CreationRules, data: Sr6Data): string[] {
  const labels = new Map(expandKeys(data).map(k => [k.key, k.label]))
  return missingFor(method, cr, data).map(k => labels.get(k) ?? k)
}

export function Sr6Runners({ c, data, cr }: { c: Sr6Catalog; data: Sr6Data; cr: CreationRules }) {
  const repo = useMemo(() => sr6Repo(), [])
  const me = useMe(),
    admin = isAdmin(me)
  const [list, setList] = useState<Stored<Sr6Character>[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [banner, setBanner] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [sort, setSortState] = useState<SortBy>(() => {
    try {
      const v = localStorage.getItem(SORT_KEY)
      return v === 'za' || v === 'recent' ? v : 'az'
    } catch {
      return 'az'
    }
  })
  const setSort = (v: SortBy) => {
    setSortState(v)
    try {
      localStorage.setItem(SORT_KEY, v)
    } catch {
      /* not remembered */
    }
  }
  const [q, setQ] = useState('')
  const [trashed, setTrashed] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [street, setStreet] = useState('')
  const missing = useMemo(() => Object.fromEntries(SR6_METHODS.map(m => [m, missingLabels(m, cr, data)])) as Record<Sr6Method, string[]>, [cr, data])
  const [method, setMethod] = useState<Sr6Method | ''>('')
  const [toDelete, setToDelete] = useState<Sr6Character | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [joining, setJoining] = useState<Sr6Character | null>(null)
  const [target, setTarget] = useState('')
  const [foundry, setFoundry] = useState(false)
  const [repairing, setRepairing] = useState<{ u: Unreadable; ch: Sr6Character; changes: string[] } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const refresh = () => {
    loadCampaigns('sr6').then(setCampaigns, () => setCampaigns([]))
    loadTrash(undefined, false, 'sr6').then(
      t => setTrashed(t.items.length),
      () => setTrashed(null),
    )
    return savesSettled()
      .then(() => repo.listAll())
      .then(
        r => {
          setList(r.stored)
          setUnreadable(r.unreadable)
          setBanner(null)
        },
        e => {
          const m = (e as Error).message ?? String(e)
          setBanner(/\b409\b/.test(m) ? LEGACY : because('Couldn’t load your runners', m))
          setList([])
        },
      )
  }
  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const mine = (list ?? []).filter(s => !me || !s.owner || s.owner === me.username)
  const rows = arrange(mine, sort, q)
  const others = ownerGroups(
    (list ?? []).filter(s => !mine.includes(s)),
    unreadable.filter(u => u.owner && u.owner !== me?.username),
    sort,
    q,
  )
  const campaignOf = (ch: Sr6Character) => campaigns.find(x => x.id === ch.campaign)
  // a runner in a campaign with its own creation settings is checked and exported with those
  const rulesOf = (ch: Sr6Character) => rulesForRunner(cr, campaignOf(ch), ch)
  const errorsOf = (ch: Sr6Character) => validateSr6(data, rulesOf(ch), withSampleFixes(c, ch).ch).filter(v => v.severity === 'error' && !v.approved).length

  const open = campaigns.filter(x => !x.archived && joined(x, me)) // the ones a runner of yours can join
  const assign = async (ch: Sr6Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch)
      await send(
        cid ? `sr6/campaigns/${cid}/runners` : `sr6/campaigns/${ch.campaign}/runners/${encodeURIComponent(ch.id)}`,
        cid ? { id: ch.id } : undefined,
        cid ? 'POST' : 'DELETE',
      )
      setMsg(cid ? `${shownName(ch)} is in ${x?.name} now.` : `${shownName(ch)} left ${x?.name ?? 'its campaign'}.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
    setJoining(null)
    void refresh()
  }
  /** saved: null; else why not */
  const saveError = async (ch: Sr6Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    return r.ok ? null : (r.error ?? `${shownName(ch)} changed elsewhere; open it to sort it out.`)
  }
  const store = async (ch: Sr6Character, rev?: number) => {
    const err = await saveError(ch, rev)
    if (err) setMsg(err)
    return !err
  }
  /** an imported runner, under a new id if its own turns out taken: the runner saved, and why not (null: saved) */
  const saveImport = async (x: Sr6Character) => {
    const { ch, r } = await saveAsNew(c => repo.save(c), x, newId)
    return { ch, err: r.ok ? null : (r.error ?? `${shownName(ch)} changed elsewhere; open it to sort it out.`) }
  }
  const openNew = () => {
    setStreet('')
    setMethod(SR6_METHODS.find(m => !missing[m].length) ?? '')
    setCreating(true)
  }
  const create = async () => {
    if (!method) return
    const ch = blankSr6(method)
    ch.identity.streetName = street.trim()
    if (await store(ch)) {
      setCreating(false)
      location.hash = `#/sr6/c/${ch.id}/concept`
    }
  }
  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = [...files],
      have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [],
      bad: string[] = []
    for (const f of picked) {
      const r = readSr6Import(await f.text(), have)
      if (!r.ok) {
        bad.push(`${f.name}: ${r.reason}`)
        continue
      }
      const { ch, err } = await saveImport(r.ch) // the summary below replaces the message: a failed save goes in it
      if (err) bad.push(`${f.name}: ${err}`)
      else {
        done.push(shownName(ch))
        have.add(ch.id)
      }
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }
  // a copy of each sample not loaded yet (a new id, its key as sampleKey), saved as any runner of yours
  const loadExamples = async () => {
    try {
      const rows = await sr6Samples()
      if (!rows.length) return setMsg('No example characters yet: they come with an imported core rulebook.')
      let n = 0
      const bad: string[] = []
      for (const s of samplesToLoad(
        rows,
        mine.map(r => r.ch),
      )) {
        const res = await fetch(s.url).catch(() => null)
        const r = res?.ok ? xmlToSr6(await res.text()) : { ok: false as const, reason: 'couldn’t be fetched.' }
        if (!r.ok || r.character.npc) {
          bad.push(`${s.name}: ${r.ok ? 'this is an NPC.' : r.reason}`)
          continue
        }
        const err = await saveError({ ...r.character, id: newId(), sampleKey: s.key, lastExportedAt: r.character.updatedAt })
        if (err) bad.push(`${s.name}: ${err}`)
        else n++
      }
      setMsg(
        [n ? `Added ${n} example character${n === 1 ? '' : 's'}.` : bad.length ? '' : 'The example characters are already in your runners.', ...bad]
          .filter(Boolean)
          .join(' '),
      )
    } catch (e) {
      setMsg(because('Couldn’t load the example characters', (e as Error).message ?? String(e)))
    }
    void refresh()
  }
  const download = (u: Unreadable) => {
    const url = URL.createObjectURL(new Blob([u.xml], { type: 'application/xml' }))
    Object.assign(document.createElement('a'), { href: url, download: u.file }).click()
    URL.revokeObjectURL(url)
  }
  const tryRepair = (u: Unreadable) => {
    const r = repairSr6(u.xml)
    if (!r.ok) return setMsg(`${u.name} can’t be repaired here: ${r.reason} Download the file to keep it.`)
    setRepairing({ u, ch: r.ch, changes: r.changes })
  }
  const saveRepaired = async () => {
    if (!repairing) return
    if (await store(repairing.ch, repairing.u.rev)) setMsg(`Repaired ${repairing.u.name}.`)
    setRepairing(null)
    void refresh()
  }

  const brokenRow = (u: Unreadable) => {
    const own = !u.owner || u.owner === me?.username
    return (
      <div className="dossier unreadable" key={`${u.owner}/${u.file}`}>
        <span className="face" aria-hidden>
          !
        </span>
        <div>
          <span className="title">Couldn’t open {u.name}</span>
          <div className="meta err">{u.error}</div>
        </div>
        <div className="row">
          {(own || admin) && (
            <button className="btn small" onClick={() => download(u)}>
              Download file
            </button>
          )}
          {own && (
            <button className="btn small quiet" onClick={() => tryRepair(u)}>
              Try to repair
            </button>
          )}
        </div>
      </div>
    )
  }
  const dossier = ({ ch, rev }: Stored<Sr6Character>, own: boolean) => {
    const errors = errorsOf(ch)
    return (
      <div className="dossier" key={ch.id}>
        <Face ch={ch} />
        <div>
          <a className="title" href={`#/sr6/c/${ch.id}/concept`}>
            {shownName(ch)}
          </a>
          <div className="meta">
            {[data.metatypes[ch.build.metatype]?.name ?? (ch.build.metatype || 'No metatype yet'), SR6_METHOD_LABELS[ch.build.method]].join(', ')}{' '}
            <StateBadge finalized={!!ch.finalizedAt} finalTip={SR6_FINAL_TIP} />
            {errors > 0 && (
              <>
                {' '}
                <a className="noncanon overspent" href={`#/sr6/c/${ch.id}/review`}>
                  {errors} {errors === 1 ? 'error' : 'errors'}
                </a>
              </>
            )}
            {campaignOf(ch) && (
              <>
                {' '}
                <a className="ctag" href={`#/sr6/campaigns/${ch.campaign}`} title="Campaign">
                  {campaignOf(ch)!.name}
                </a>
              </>
            )}
          </div>
        </div>
        {own ? (
          <div className="row">
            <button
              className="btn small"
              aria-label={`Export ${shownName(ch)}`}
              onClick={async () => {
                await store(exportSr6(c, ch), rev)
                void refresh()
              }}
            >
              Export
            </button>
            <button className="btn small quiet" aria-label={`Export ${shownName(ch)} for Foundry`} onClick={() => downloadSr6Runners(c, data, rulesOf, [ch])}>
              Export for Foundry
            </button>
            {campaignOf(ch) ? (
              <button className="btn small quiet" onClick={() => void assign(ch, null)}>
                Remove from campaign
              </button>
            ) : (
              open.length > 0 && (
                <button
                  className="btn small quiet"
                  onClick={() => {
                    setTarget(open[0].id)
                    setJoining(ch)
                  }}
                >
                  Add to campaign…
                </button>
              )
            )}
            <button className="btn small quiet" aria-label={`Delete ${shownName(ch)}`} onClick={() => setToDelete(ch)}>
              Delete
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn small" aria-label={`Export ${shownName(ch)}`} onClick={() => exportSr6(c, ch)}>
              Export
            </button>
            <button className="btn small quiet" aria-label={`Export ${shownName(ch)} for Foundry`} onClick={() => downloadSr6Runners(c, data, rulesOf, [ch])}>
              Export for Foundry
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <main className="lib">
      <PageHeader title="Your runners">
        <IconButton className="primary" icon="runner-add" label="New runner" onClick={openNew} disabled={banner === LEGACY} />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} disabled={banner === LEGACY} />
        <IconButton icon="examples" label="Load example characters" onClick={() => void loadExamples()} disabled={banner === LEGACY} />
        <IconButton icon="foundry" label="Export for Foundry…" onClick={() => setFoundry(true)} disabled={!list?.length} />
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
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/sr6/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">Shadowrun 6 runners, saved on the server (appdata/chummer-anarchy2/characters/sr6).</p>
      {banner && (
        <p className="banner err" role="alert">
          {banner}
        </p>
      )}
      {msg && (
        <p className="banner" role="status">
          {msg}
        </p>
      )}
      {list !== null && (list.length > 0 || unreadable.length > 0) && (
        <div className="row listtools">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Street name or real name" aria-label="Search runners" />
          <label className="inline">
            Sort
            <select value={sort} onChange={e => setSort(e.target.value as SortBy)}>
              <option value="az">A–Z</option>
              <option value="za">Z–A</option>
              <option value="recent">Recently edited</option>
            </select>
          </label>
        </div>
      )}
      {list === null ? (
        <p className="muted">Loading runners…</p>
      ) : (
        <>
          {others.length > 0 && <h2>My runners</h2>}
          {unreadable.filter(u => !u.owner || u.owner === me?.username).map(brokenRow)}
          {mine.length === 0 ? (
            !banner && (
              <div className="empty">
                <p>No runners yet. Start a new one, import a runner file or load the example characters.</p>
              </div>
            )
          ) : (
            <>
              {rows.map(s => dossier(s, true))}
              {q && rows.length === 0 && <p className="muted">No runner’s name contains “{q.trim()}”.</p>}
            </>
          )}
          {others.map(({ owner, name, rows, broken }) => (
            <section key={owner} aria-label={`${name}’s runners`}>
              <h2>{name}’s runners</h2>
              {broken.map(brokenRow)}
              {rows.map(s => dossier(s, false))}
            </section>
          ))}
        </>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New runner"
        actions={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!method} onClick={() => void create()}>
              Create runner
            </button>
          </>
        }
      >
        <div className="grid2">
          <label>
            Street name
            <input value={street} onChange={e => setStreet(e.target.value)} autoFocus />
          </label>
          <label>
            Creation method
            <select value={method} onChange={e => setMethod(e.target.value as Sr6Method)}>
              {!method && <option value="">None can be picked yet</option>}
              {SR6_METHODS.map(m => (
                <option key={m} value={m} disabled={missing[m].length > 0}>
                  {SR6_METHOD_LABELS[m]}
                  {missing[m].length ? ` (needs ${missing[m].length} ${missing[m].length === 1 ? 'setting' : 'settings'})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <MissingList missing={missing} />
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          Both can be changed later: the street name on Concept, the method on Creation method.
        </p>
      </Modal>

      <Modal
        open={!!repairing}
        onClose={() => setRepairing(null)}
        title={`Repair ${repairing?.u.name ?? 'this runner'}?`}
        actions={
          <>
            <button className="btn" onClick={() => setRepairing(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void saveRepaired()}>
              Save repaired runner
            </button>
          </>
        }
      >
        <p>It reads with these changes:</p>
        <ul>
          {repairing?.changes.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
        <p className="muted">Saving replaces the file with the repaired runner. Download the file first to keep the original.</p>
      </Modal>

      <Modal
        open={!!joining}
        onClose={() => setJoining(null)}
        title={`Add ${joining ? shownName(joining) : 'this runner'} to a campaign`}
        actions={
          <>
            <button className="btn" onClick={() => setJoining(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!target} onClick={() => void assign(joining!, target)}>
              Add to campaign
            </button>
          </>
        }
      >
        <label>
          Campaign
          <select value={target} onChange={e => setTarget(e.target.value)}>
            {open.map(x => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          A runner plays in one campaign at a time; its GM can read and print it. To play it in another one too, export it and import the copy.
        </p>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete ? shownName(toDelete) : 'this runner'}?`}
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
                  setMsg(because('Couldn’t delete the runner', (e as Error).message ?? String(e)))
                }
                setToDelete(null)
                void refresh()
              }}
            >
              Delete runner
            </button>
          </>
        }
      >
        <p>It moves to your Shadowrun 6 trash, where you can restore it or delete it for good.</p>
      </Modal>

      <ExportRunnersDialog
        runners={(list ?? []).map(s => s.ch)}
        campaigns={campaigns}
        open={foundry}
        onClose={() => setFoundry(false)}
        download={chs => downloadSr6Runners(c, data, rulesOf, chs)}
        about={SR6_FOUNDRY_ABOUT}
      />
    </main>
  )
}

/** Each method that can't be picked yet, with the settings it still needs. */
export function MissingList({ missing }: { missing: Record<Sr6Method, string[]> }) {
  const blocked = SR6_METHODS.filter(m => missing[m].length)
  if (!blocked.length) return null
  return (
    <div className="missing">
      <p className="muted">These need creation settings first (Table setup → Creation rules):</p>
      <ul>
        {blocked.map(m => (
          <li key={m}>
            <b>{SR6_METHOD_LABELS[m]}</b>: {missing[m].join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

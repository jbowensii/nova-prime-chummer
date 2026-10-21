import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PageHeader } from '../../../core/chrome/nav'
import { IconButton, IconLink } from '../../../core/ui-kit/icons'
import { isCanonSource } from '../../formats/domain/canon'
import { balance } from '../../runner-builder/domain/career'
import { characterToXml, xmlToCharacter } from '../../formats/domain/charxml'
import { blankCharacter, snapshotEntries } from '../../formats/domain/file'
import type { Catalog, Character } from '../../formats/domain/types'
import { newId } from '../../formats/domain/types'
import { because, canEdit, isAdmin, savesSettled, send, useMe } from '../../../core/ui-kit/auth'
import { Modal, NonCanon, OverspentChip, StateBadge, UserDefined } from '../../../core/ui-kit/bits'
import { downloadFile } from '../../../core/ui-kit/download'
import { saveAsNew } from '../../../features/runner-store/repo'
import { useRepo, type Stored, type Unreadable } from '../../../core/ui-kit/repoContext'
import { arrange, ownerGroups, type SortBy } from '../../../features/runner-store/runnerList'
import { loadTrash } from '../../../features/runner-store/Trash'
import { needsExportReminder } from '../../../core/ui-kit/storage'
import { joined, loadCampaigns, type Campaign } from '../../../features/campaigns/campaignsStore'
import {
  bookSamples,
  chooseExamples,
  extraCopies,
  keyOf,
  sameRunners,
  readCharacterFile,
  readSample,
  type Example,
  type Sources,
} from '../../runner-builder/ui/samples'
import { Face } from '../../../core/ui-kit/Portrait'
import { downloadRunners } from '../../foundry/ui/Foundry'
import { ExportRunnersDialog } from '../../../features/foundry-kit/foundryKit'

/** Download the runner as an XML file (same format as the files on the server). Returns it stamped as exported. */
export function exportCharacter(c: Catalog, ch: Character): Character {
  const out = { ...snapshotEntries(c, ch), lastExportedAt: new Date().toISOString() }
  downloadFile(`${(ch.identity.streetName || ch.identity.name || 'runner').replace(/[^\w\- ]+/g, '')}.xml`, characterToXml(out), 'application/xml')
  return out
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Find duplicates (server only: the copies not kept go to the trash, where they can be restored): the page's own runners
 *  or NPCs with the same street name, real name and metatype (samples.ts sameRunners), each copy shown with what tells it
 *  apart. The kept copy is picked per group (the edited, else the newest, to start with); nothing moves before the confirm.
 *  chips: the list's own chips for a copy (state, canon, error, campaign). */
export function FindDuplicates({
  rows,
  noun,
  remove,
  done,
  chips,
}: {
  rows: Stored[]
  noun: string
  remove: (id: string) => Promise<void>
  done: (msg: string) => void
  chips: (ch: Character) => ReactNode
}) {
  const [groups, setGroups] = useState<Stored[][] | null>(null)
  const [keep, setKeep] = useState<string[]>([]) // per group, the id of the copy that stays ('': all of them)
  const [sure, setSure] = useState(false) // the confirm step
  const name = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed'
  const extra = (groups ?? []).flatMap((g, i) => (keep[i] ? g.filter(r => r.ch.id !== keep[i]).map(r => r.ch) : [])) // '': keep every copy
  const find = () => {
    const g = sameRunners(rows)
    setGroups(g)
    setKeep(g.map(x => x[0].ch.id))
    setSure(false)
  }
  const close = () => {
    setGroups(null)
    setSure(false)
  }
  const move = async () => {
    const moved: string[] = []
    try {
      for (const ch of extra) {
        await remove(ch.id)
        moved.push(name(ch))
      } // stops at the first that fails
      done(`Moved to your trash: ${moved.join(', ')}.`)
    } catch (e) {
      done(
        [
          moved.length ? `Moved to your trash: ${moved.join(', ')}.` : '',
          because(`Couldn’t move ${name(extra[moved.length])}`, (e as Error).message ?? String(e)),
        ]
          .filter(Boolean)
          .join(' '),
      )
    }
    close()
  }
  const edited = (r: Stored) => ((r.rev ?? 1) > 1 ? `edited (rev ${r.rev})` : 'unedited (rev 1)')
  return (
    <>
      <IconButton icon="copies" label="Find duplicates" onClick={find} disabled={rows.length < 2} />
      <Modal
        open={!!groups}
        onClose={close}
        title={`Duplicate ${noun}`}
        className="dupes"
        actions={
          !groups?.length ? (
            <button className="btn" onClick={close}>
              Close
            </button>
          ) : sure ? (
            <>
              <button className="btn" onClick={() => setSure(false)}>
                Back
              </button>
              <button className="btn primary" onClick={() => void move()}>
                Move {extra.length} to trash
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={close}>
                Keep them all
              </button>
              <button className="btn primary" disabled={!extra.length} onClick={() => setSure(true)}>
                Move {extra.length} to trash…
              </button>
            </>
          )
        }
      >
        {!groups?.length ? (
          <p>No duplicates: none of your {noun} shares a street name, real name and metatype with another.</p>
        ) : sure ? (
          <>
            <p>Move {extra.length === 1 ? 'this copy' : `these ${extra.length} copies`} to your trash?</p>
            <ul>
              {extra.map(ch => (
                <li key={ch.id}>
                  {name(ch)}, last edited {when(ch.updatedAt)}
                </li>
              ))}
            </ul>
            <p className="muted">They can be restored from the trash.</p>
          </>
        ) : (
          <>
            <p>
              These {noun} share a street name, real name and metatype. Pick the copy to keep in each; the others move to your trash, where they can be
              restored.
            </p>
            {groups!.map((g, i) => (
              <fieldset key={g[0].ch.id} className="dupe-group">
                <legend>{name(g[0].ch)}</legend>
                {g.map(r => (
                  <label key={r.ch.id} className="check">
                    <input
                      type="radio"
                      name={`dupe-${i}`}
                      checked={keep[i] === r.ch.id}
                      onChange={() => setKeep(k => k.map((x, j) => (j === i ? r.ch.id : x)))}
                    />
                    <span>
                      Last edited {when(r.ch.updatedAt)}, {edited(r)} {chips(r.ch)}
                    </span>
                  </label>
                ))}
                <label className="check">
                  <input type="radio" name={`dupe-${i}`} checked={keep[i] === ''} onChange={() => setKeep(k => k.map((x, j) => (j === i ? '' : x)))} />
                  <span>Keep every copy</span>
                </label>
              </fieldset>
            ))}
          </>
        )}
      </Modal>
    </>
  )
}

/** Every example character there is: the imported books' sample runners (none before any import) and, on the server,
 *  its example sets (GET /api/samples). Canon: the book's source, or the set's flag. The books' rows still come when the
 *  sets can't be read (`error`: why). */
async function exampleList(sources: Sources, server: boolean): Promise<{ rows: Example[]; error?: string }> {
  const books = await bookSamples(sources)
  if (!server) return { rows: books }
  try {
    const r = await fetch('./api/samples', { cache: 'no-store' })
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `the server answered ${r.status}`)
    const { sets }: { sets: { name: string; canon: boolean; samples: { name: string; href: string }[] }[] } = await r.json()
    return { rows: [...books, ...sets.flatMap(set => set.samples.map(s => ({ url: `./custom/${s.href}`, name: s.name, set: set.name, canon: set.canon })))] }
  } catch (e) {
    return { rows: books, error: because('Couldn’t read the server’s example sets', (e as Error).message ?? String(e)) }
  }
}

const SORT_KEY = 'ca2.library.sort'
const shownName = (ch: Character) => ch.identity.streetName || ch.identity.name || 'Unnamed runner'

export { initial } from '../../../core/ui-kit/Portrait'

export function Library({ c }: { c: Catalog }) {
  const repo = useRepo()
  const me = useMe(),
    admin = isAdmin(me)
  const [list, setList] = useState<Stored[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [repairing, setRepairing] = useState<{ u: Unreadable; ch: Character; changes: string[] } | null>(null)
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
      /* this browser won't remember it */
    }
  }
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [level, setLevel] = useState('runner')
  const [meta, setMeta] = useState('human')
  const [toDelete, setToDelete] = useState<Character | null>(null)
  const [tidying, setTidying] = useState(false)
  const [foundry, setFoundry] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const [noBookFiles, setNoBooks] = useState(false)
  const noBooks = repo.mode === 'server' ? noBookFiles : c.amps.size === 0
  // a fresh install: no book uploaded (server), or no amps at all (a static host has no Books page)
  useEffect(() => {
    if (repo.mode !== 'server' || !admin) return // only the admin uploads books
    fetch('./api/books', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(
        b => setNoBooks(Array.isArray(b) && b.length === 0),
        () => {},
      )
  }, [repo.mode, c, admin])
  const [trashed, setTrashed] = useState<number | null>(null) // server only: the browser's storage has no trash
  // server only: the caller's campaigns (the admin: all), for each runner's tag, Add to campaign… and the filter
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [only, setOnly] = useState('') // the filter: '' every runner, '-' none in a campaign, else a campaign's id
  const [joining, setJoining] = useState<Character | null>(null)
  const [target, setTarget] = useState('')
  const refresh = () => {
    if (repo.mode === 'server') {
      loadTrash().then(
        t => setTrashed(t.items.length),
        () => setTrashed(null),
      )
      loadCampaigns().then(setCampaigns, () => setCampaigns([]))
    }
    // a runner just left in the editor may still be sending its last change: list it as saved
    return savesSettled()
      .then(() => repo.listAll())
      .then(
        r => {
          setList(r.stored.filter(s => !s.ch.npc)) // the runner list never shows an NPC
          setUnreadable(r.unreadable)
        },
        e => {
          setMsg(because('Couldn’t load your runners', (e as Error).message ?? String(e)))
          setList([])
        },
      )
  }
  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const where = repo.mode === 'server' ? 'the server' : 'this browser'
  // the admin also gets everyone else's runners, an editor those in the campaigns they GM (read-only): theirs first, then one group per owner
  const mine = (list ?? []).filter(s => !me || !s.owner || s.owner === me.username)
  const sources: Sources = id => {
    const k = id.toLowerCase()
    return [...c.sources.values()].find(s => s.id.toLowerCase() === k)
  }

  /** saved: null; else why not */
  const saveError = async (ch: Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    return r.ok ? null : (r.error ?? `${ch.identity.streetName || 'That runner'} changed elsewhere; open it to sort it out.`)
  }
  const store = async (ch: Character, rev?: number) => {
    const err = await saveError(ch, rev)
    if (err) setMsg(err)
    return !err
  }
  /** an imported runner, under a new id if its own turns out taken: the runner saved, and why not (null: saved) */
  const saveImport = async (x: Character) => {
    const { ch, r } = await saveAsNew(c => repo.save(c), x, newId)
    return { ch, err: r.ok ? null : (r.error ?? `${ch.identity.streetName || 'That runner'} changed elsewhere; open it to sort it out.`) }
  }

  const create = async () => {
    const ch = blankCharacter(level, meta)
    if (await store(ch)) location.hash = `#/c/${ch.id}/concept`
  }

  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = [...files] // before the first await: the input is cleared right after this call, and its FileList with it
    const have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [],
      bad: string[] = []
    for (const f of picked) {
      const r = readCharacterFile(await f.text())
      if (!r.ok) {
        bad.push(`${f.name}: ${r.reason}`)
        continue
      }
      if (r.character.npc) {
        bad.push(`${f.name}: this is an NPC, not a runner. ${canEdit(me) ? 'Import it on NPCs & Critters.' : 'Only GMs keep NPCs.'}`)
        continue
      }
      const { ch, err } = await saveImport({
        ...r.character,
        id: have.has(r.character.id) ? newId() : r.character.id,
        lastExportedAt: new Date().toISOString(),
      })
      if (err) bad.push(`${f.name}: ${err}`)
      else {
        done.push(ch.identity.streetName || ch.identity.name)
        have.add(ch.id)
      }
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }

  // each account gets copies of its own (new ids): one per character and canon-ness, whatever ids a re-import gave
  const loadExamples = async () => {
    try {
      const have = new Set(mine.flatMap(s => [keyOf(s.ch, sources), s.ch.sampleKey])) // as recorded too: a set's copy of a book's runner
      let n = 0
      const bad: string[] = []
      const { rows, error } = await exampleList(sources, repo.mode === 'server')
      const examples = chooseExamples(rows, sources)
      if (error) bad.push(error)
      if (!examples.length)
        return setMsg(
          error ?? 'No example characters yet: they come with imported books (the core rulebook and Daegann’s pregen booklet) and the server’s example sets.',
        )
      for (const { url, key } of examples.filter(s => !have.has(s.key))) {
        const r = await readSample(url)
        if (!r.ok) {
          bad.push(`${url.split('/').pop()}: ${r.reason}`)
          continue
        }
        const err = await saveError({ ...r.character, id: newId(), sampleKey: key, lastExportedAt: r.character.updatedAt })
        if (err) bad.push(`${url.split('/').pop()}: ${err}`)
        else {
          n++
          have.add(key)
        }
      }
      setMsg(
        [n ? `Added ${n} example character${n === 1 ? '' : 's'}.` : bad.length ? '' : 'The example characters are already in your library.', ...bad]
          .filter(Boolean)
          .join(' '),
      )
      void refresh()
    } catch (e) {
      setMsg(because('Couldn’t load the example characters', (e as Error).message ?? String(e)))
    }
  }

  // extra copies of an example character in your own library (loaded twice, or both a book's and a set's version): to your trash
  const dupes = extraCopies(mine, sources)
  const from = (ch: Character) =>
    ch.origin
      ? (c.sources.get(ch.origin)?.name ?? ch.origin)
      : ch.sampleKey?.includes('.')
        ? ch.sampleKey.split('.')[0].toUpperCase()
        : ch.id.startsWith('sample-')
          ? 'built-in, first release'
          : 'example set'
  const tidy = async () => {
    const moved: string[] = [],
      name = (ch: Character) => ch.identity.streetName || ch.identity.name
    const done = () => (moved.length ? `${repo.mode === 'server' ? 'Moved to your trash' : 'Removed'}: ${moved.join(', ')}.` : '')
    try {
      for (const ch of dupes) {
        await repo.remove(ch.id)
        moved.push(name(ch))
      } // stops at the first that fails
      setMsg(done())
    } catch (e) {
      const left = dupes.length - moved.length
      setMsg(
        [
          done(),
          because(`Couldn’t move ${left === 1 ? 'the last copy' : `the other ${left} copies`}`, (e as Error).message ?? String(e)),
          'Try Tidy up again in a moment.',
        ]
          .filter(Boolean)
          .join(' '),
      )
    } finally {
      setTidying(false)
      void refresh()
    }
  }

  const duplicate = async (ch: Character) => {
    await store({
      ...structuredClone(ch),
      id: newId(),
      sampleKey: undefined,
      campaign: undefined,
      identity: { ...ch.identity, streetName: `${ch.identity.streetName || ch.identity.name} (copy)` },
      lastExportedAt: undefined,
      updatedAt: new Date().toISOString(),
    })
    void refresh()
  }

  const campaignOf = (ch: Character) => campaigns.find(x => x.id === ch.campaign)
  const open = campaigns.filter(x => !x.archived && joined(x, me)) // the ones a runner of yours can join
  const shown = (s: Stored) => !only || (only === '-' ? !campaignOf(s.ch) : s.ch.campaign === only)
  const assign = async (ch: Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch),
        name = ch.identity.streetName || ch.identity.name || 'The runner'
      await send(
        cid ? `campaigns/${cid}/runners` : `campaigns/${ch.campaign}/runners/${encodeURIComponent(ch.id)}`,
        cid ? { id: ch.id } : undefined,
        cid ? 'POST' : 'DELETE',
      )
      setMsg(cid ? `${name} is in ${x?.name} now.` : `${name} left ${x?.name ?? 'its campaign'}.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
    setJoining(null)
    void refresh()
  }

  // a file that couldn't be read: listed with why; its owner or the admin can download it, its owner can try to repair it
  const download = (u: Unreadable) => downloadFile(u.file, u.xml, 'application/xml')
  const tryRepair = (u: Unreadable) => {
    const changes: string[] = []
    const r = xmlToCharacter(u.xml, { repair: changes })
    if (!r.ok) return setMsg(`${u.name} can’t be repaired here: ${r.reason} Download the file to keep it.`)
    setRepairing({ u, ch: r.character, changes })
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
  const rows = arrange(mine.filter(shown), sort, q)

  const others = ownerGroups(
    (list ?? []).filter(s => shown(s) && !mine.includes(s)),
    unreadable.filter(u => u.owner && u.owner !== me?.username),
    sort,
    q,
  )
  /** a runner's chips: draft or finalized, non-canon or user defined, overspent */
  const chips = (ch: Character) => {
    const bal = balance(c, ch)
    return (
      <>
        <StateBadge finalized={!!ch.finalizedAt} />
        {ch.origin
          ? !isCanonSource(c, ch.origin) && (
              <>
                {' '}
                <NonCanon source={c.sources.get(ch.origin)?.name ?? ch.origin} />
              </>
            )
          : !ch.sampleKey && (
              <>
                {' '}
                <UserDefined />
              </>
            )}
        {bal < 0 && (
          <>
            {' '}
            <OverspentChip by={-bal} />
          </>
        )}
      </>
    )
  }
  const dossier = ({ ch, rev }: Stored, own: boolean) => (
    <div className="dossier" key={ch.id}>
      <Face ch={ch} />
      <div>
        <a className="title" href={`#/c/${ch.id}/concept`}>
          {shownName(ch)}
        </a>
        <div className="meta">
          {[c.metatypes.get(ch.identity.metatype)?.name ?? ch.identity.metatype, c.levels.get(ch.level)?.name ?? ch.level].filter(Boolean).join(', ')}{' '}
          {chips(ch)}
          {repo.mode === 'browser' && needsExportReminder(ch) && <span className="warn"> Not exported since it changed</span>}
          {campaignOf(ch) && (
            <>
              {' '}
              <a className="ctag" href={`#/campaigns/${ch.campaign}`} title="Campaign">
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
              await store(exportCharacter(c, ch), rev)
              void refresh()
            }}
          >
            Export
          </button>
          <button className="btn small quiet" onClick={() => void duplicate(ch)}>
            Duplicate
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
          <button className="btn small" aria-label={`Export ${shownName(ch)}`} onClick={() => exportCharacter(c, ch)}>
            Export
          </button>
        </div>
      )}
    </div>
  )

  return (
    <main className="lib">
      <PageHeader title="Your runners">
        <IconButton className="primary" icon="runner-add" label="New runner" onClick={() => setCreating(true)} />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} />
        <input
          ref={file}
          type="file"
          accept=".xml,.json,application/xml,application/json"
          multiple
          hidden
          onChange={e => {
            void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <IconButton icon="foundry" label="Export for Foundry…" onClick={() => setFoundry(true)} disabled={!list?.length} />
        <IconButton icon="examples" label="Load example characters" onClick={loadExamples} />
        {repo.mode === 'server' && (
          <FindDuplicates
            rows={mine}
            noun="runners"
            remove={repo.remove}
            done={m => {
              setMsg(m)
              void refresh()
            }}
            chips={ch => (
              <>
                {chips(ch)}
                {campaignOf(ch) && (
                  <>
                    {' '}
                    <span className="ctag">{campaignOf(ch)!.name}</span>
                  </>
                )}
              </>
            )}
          />
        )}
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">
        Saved on {where}
        {repo.mode === 'server' ? ' (appdata/nova-prime-chummer/characters)' : '. Export files to keep them safe.'}
      </p>
      {noBooks && (
        <p className="banner">
          Upload your books to add amps, spells and gear. <a href="#/books">Open the Books page</a>
        </p>
      )}
      {msg && (
        <p className="banner" role="status">
          {msg}
        </p>
      )}
      {dupes.length > 0 && (
        <p className="banner">
          {dupes.length === 1 ? 'An example character is in your library twice' : `${dupes.length} example characters are extra copies`}, unchanged since they
          were loaded.{' '}
          <button className="btn small" onClick={() => setTidying(true)}>
            Tidy up
          </button>
        </p>
      )}

      {campaigns.length > 0 && (
        <label className="filter">
          Show
          <select value={only} onChange={e => setOnly(e.target.value)}>
            <option value="">Every runner</option>
            <option value="-">Not in a campaign</option>
            {campaigns.map(x => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
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
          {only && mine.length > 0 && !mine.some(shown) ? (
            <p className="muted">None of your runners is {only === '-' ? 'outside a campaign' : 'in that campaign'}.</p>
          ) : mine.length === 0 ? (
            <div className="empty">
              <p>No runners yet. Start a new one, import a character file, or load the example characters to look around.</p>
            </div>
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
            <button className="btn primary" onClick={() => void create()}>
              Create runner
            </button>
          </>
        }
      >
        <div className="grid2">
          <label>
            Level of play
            <select value={level} onChange={e => setLevel(e.target.value)}>
              {[...c.levels.values()].map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}: {l.nuyen.toLocaleString('en-US')}¥
                </option>
              ))}
            </select>
          </label>
          <label>
            Metatype
            <select value={meta} onChange={e => setMeta(e.target.value)}>
              {[...c.metatypes.values()].map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          Both can be changed later on the Concept tab.
        </p>
      </Modal>

      <Modal
        open={!!joining}
        onClose={() => setJoining(null)}
        title={`Add ${joining?.identity.streetName || joining?.identity.name || 'this runner'} to a campaign`}
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
          A runner plays in one campaign at a time; its GM can read and print it. To play it in another one too, duplicate it.
        </p>
      </Modal>

      <Modal
        open={tidying}
        onClose={() => setTidying(false)}
        title="Tidy up the example characters"
        actions={
          <>
            <button className="btn" onClick={() => setTidying(false)}>
              Keep them
            </button>
            <button className="btn primary" onClick={() => void tidy()}>
              {repo.mode === 'server' ? 'Move to trash' : 'Remove copies'}
            </button>
          </>
        }
      >
        <p>Your library keeps one copy of each example character (one canon, one non-canon). These extra copies are unchanged since they were loaded:</p>
        <ul>
          {dupes.map(ch => (
            <li key={ch.id}>
              {ch.identity.streetName || ch.identity.name} ({from(ch)})
            </li>
          ))}
        </ul>
        <p className="muted">
          {repo.mode === 'server'
            ? 'They move to your trash, so they can still be restored from there. Copies you changed stay.'
            : 'They’re removed from this browser. Copies you changed stay.'}
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
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete?.identity.streetName || toDelete?.identity.name || 'this runner'}?`}
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
        <p>
          {repo.mode === 'server'
            ? 'It moves to your trash, where you can restore it or delete it for good.'
            : 'This removes the runner from this browser. Exported files are not affected.'}
        </p>
      </Modal>

      <ExportRunnersDialog
        download={chs => downloadRunners(c, chs)}
        runners={(list ?? []).map(s => s.ch)}
        campaigns={campaigns}
        open={foundry}
        onClose={() => setFoundry(false)}
      />
    </main>
  )
}

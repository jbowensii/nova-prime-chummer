// SR6 Compendiums (#/sr6/compendiums[/<id>[/<entry id>]], admin and editors): the shell both games share
// (src/features/compendiums/CompendiumShell.tsx) with SR6's store (compendiumStore.ts), catalog and pages. A compendium's entries are grouped by
// kind in COMP_KINDS order, then its NPCs; its owner adds, edits and deletes entries with Sr6EntryFields (EditEntry.tsx),
// which fills what common.xsd requires, so the file always validates, and moves an NPC back out to NPCs & Critters. A
// book (#/sr6/compendiums/<book source id>) and another GM's compendium are read only, with Copy to… into one of yours
// (copySr6Entry: the stats, no description). Never Anarchy's: the adapter lists, saves and checks only SR6 compendiums, campaigns and sources.
import { useEffect, useMemo, useState } from 'react'
import { because } from '../../../core/ui-kit/auth'
import { Modal } from '../../../core/ui-kit/bits'
import {
  CompendiumShell,
  CopyButton,
  CopyDialog,
  Entries,
  entries,
  sharingOf,
  type BookProps,
  type CompGame,
  type PageProps,
  type ShellRow,
} from '../../../features/compendiums/CompendiumShell'
import { deleteCompendium } from '../../../features/compendiums/compendiumStore'
import { IconButton } from '../../../core/ui-kit/icons'
import { PageHeader } from '../../../core/chrome/nav'
import { blankSr6Entry, COMP_KINDS, copySr6Entry, entryProblem, newEntryId } from '../../formats/domain/compendium'
import type { CreationRules } from '../../table-setup/domain/creation'
import type { Sr6Data } from '../../catalog/domain/data'
import type { Sr6Character } from '../../formats/domain/character'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind } from '../../formats/domain/types'
import type { Sr6Compendium } from '../../formats/domain/character'
import { listSr6Compendiums, moveNpcOut, parseSr6Rows, saveSr6Compendium } from './compendiumStore'
import { Sr6EntryFields } from '../../game-data/ui/EditEntry'
import { downloadSr6Compendium } from '../../foundry/ui/Foundry'
import { npcChip } from '../../runner-builder/ui/editor'
import { sr6NpcRepo } from '../../runner-builder/ui/repo'

/** One listed entry or NPC. */
export interface Sr6Row extends ShellRow {
  entry?: Sr6Entry
  npc?: Sr6Character
}
const KINDS = Object.keys(COMP_KINDS) as Sr6Kind[]
/** The group a compendium's own NPCs (moved in from NPCs & Critters) list under, after the kinds. */
export const NPC_GROUP = 'NPCs & Critters'
const nameOf = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed NPC'
/** "category zappers · dv 3P · skills: Sneaking 3": the values and lines as printed */
const details = (e: Sr6Entry) =>
  [
    ...Object.entries(e.attrs)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${v}`),
    ...e.parts.filter(p => p.text).map(p => `${p.tag}: ${p.text}`),
  ].join(' · ')

/** The rows, one group per compendium kind (SR6_KINDS label, COMP_KINDS order), then the NPCs; each by name. Entries of
 *  other kinds aren't listed. */
export function sr6Rows(list: Sr6Entry[], npcs: Sr6Character[]): Map<string, Sr6Row[]> {
  const out = new Map<string, Sr6Row[]>([...KINDS.map(k => [SR6_KINDS[k].label, []] as [string, Sr6Row[]]), [NPC_GROUP, []]])
  for (const e of list)
    if (COMP_KINDS[e.kind])
      out
        .get(SR6_KINDS[e.kind].label)!
        .push({ key: `${e.kind}/${e.id}`, entry: e, name: e.name, detail: details(e), text: e.text, source: e.source, page: e.page })
  for (const n of npcs)
    out.get(NPC_GROUP)!.push({
      key: n.id,
      npc: n,
      name: nameOf(n),
      detail: n.npc?.group ?? '',
      text: '',
      chips: n.npc && <span className="noncanon npckind">{npcChip(n.npc)}</span>,
    })
  for (const rows of out.values()) rows.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/** "STREET p.1 House": a compendium's source is a GM's house source */
const Cite = ({ c, source, page }: { c: Sr6Catalog; source: string; page: number }) => (
  <span className="srcline">
    <span className="src">
      {source} p.{page}
    </span>
    {c.sources.get(source)?.origin === 'user' && <span className="noncanon">House</span>}
  </span>
)

export function Sr6Compendiums({
  c,
  data,
  cr,
  id,
  edit,
  reload,
}: {
  c: Sr6Catalog
  data: Sr6Data
  cr: CreationRules
  id?: string
  edit?: string
  reload: () => Promise<void>
}) {
  const g = useMemo(
    (): CompGame<Sr6Compendium> => ({
      game: 'sr6',
      href: '#/sr6/compendiums',
      intro:
        'Your own Shadowrun 6 entries and NPCs, in collections you can share with an SR6 campaign’s GMs or the whole table. Their entries are house content and show in your SR6 pickers and Game data. Books are listed as read-only compendiums.',
      list: () =>
        listSr6Compendiums().then(rows => {
          const p = parseSr6Rows(rows)
          return { comps: p.comps, bad: p.bad.map(b => `${b.row.ownerName}’s ${b.row.file}: ${b.error}`) }
        }),
      blank: meta => ({ ...meta, updatedAt: '', entries: [], npcs: [] }),
      save: saveSr6Compendium,
      remove: id => deleteCompendium(id, 'sr6'),
      books: [...c.sources.values()].filter(s => !s.compendium),
      taken: source => c.sources.has(source),
      loaded: comp => c.sources.get(comp.source)?.compendium?.id === comp.id,
      count: x => x.entries.length,
      cite: (source, page) => <Cite c={c} source={source} page={page} />,
    }),
    [c],
  )
  return (
    <CompendiumShell
      g={g}
      id={id}
      reload={reload}
      page={p => <CompendiumPage key={p.comp.id} c={c} data={data} cr={cr} g={g} {...p} edit={edit} />}
      book={p => <BookPage c={c} g={g} {...p} />}
    />
  )
}

/** the compendium with a copy of the row's entry added: its stats, no description */
const into =
  (c: Sr6Catalog) =>
  (comp: Sr6Compendium, r: Sr6Row): Sr6Compendium => ({ ...comp, entries: [...comp.entries, copySr6Entry(c, r.entry!, comp)] })

/** A message that clears itself after a while. */
function useToast() {
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(''), 5000)
      return () => clearTimeout(t)
    }
  }, [msg])
  return [msg, setMsg] as const
}

function CompendiumPage({
  c,
  data,
  cr,
  g,
  comp,
  own,
  campaigns,
  changed,
  edit,
  targets,
}: PageProps<Sr6Compendium> & { c: Sr6Catalog; data: Sr6Data; cr: CreationRules; g: CompGame<Sr6Compendium>; edit?: string }) {
  const [q, setQ] = useState('')
  const [copying, setCopying] = useState<Sr6Row | null>(null)
  const [form, setForm] = useState<{ entry?: Sr6Entry } | null>(() => {
    const e = own && comp.entries.find(x => x.id === edit)
    return e ? { entry: e } : null
  })
  const [msg, setMsg] = useToast()
  /** the compendium saved with these entries; throws why it couldn't */
  const store = async (list: Sr6Entry[]) => {
    const r = await saveSr6Compendium({ ...comp, entries: list }, comp.rev)
    if (!r.ok) throw new Error(r.conflict ? 'it changed elsewhere since this page loaded (reload the page)' : r.error)
  }
  const put = async (e: Sr6Entry) => {
    const same = (x: Sr6Entry) => x.kind === e.kind && x.id === e.id
    await store(comp.entries.some(same) ? comp.entries.map(x => (same(x) ? e : x)) : [...comp.entries, e])
  }
  const remove = async (r: Sr6Row) => {
    if (!confirm(`Delete ${r.name} from ${comp.name}? Runners and NPCs that use it keep their copy.`)) return
    try {
      await store(comp.entries.filter(x => x !== r.entry))
      await changed()
      setMsg(`Deleted ${r.name}.`)
    } catch (e) {
      setMsg(because('Couldn’t delete it', (e as Error).message))
    }
  }
  const moveOut = async (r: Sr6Row) => {
    const m = await moveNpcOut(comp, r.key, sr6NpcRepo())
    if (!m.ok) return setMsg(because('Couldn’t move it', m.error))
    await changed()
    setMsg(`Moved ${r.name} to your NPCs.`)
  }
  const sharing = sharingOf(comp, campaigns).replace(/^./, ch => ch.toLowerCase())

  return (
    <main className="lib">
      <PageHeader title={comp.name}>
        <IconButton icon="foundry" label="Export for Foundry" onClick={() => downloadSr6Compendium(c, data, cr, comp)} />
      </PageHeader>
      <p className="muted">
        Source {comp.source} · {own ? 'yours' : `${comp.ownerName}’s, read only`} · {sharing} · {entries(g.count(comp))}
        {comp.npcs.length ? `, ${comp.npcs.length} NPC${comp.npcs.length === 1 ? '' : 's'}` : ''}
      </p>
      {own && (
        <div className="row">
          <button className="btn" onClick={() => setForm({})}>
            Add entry
          </button>
        </div>
      )}
      <div className="row listtools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search entries" />
      </div>
      <Entries
        rows={sr6Rows(comp.entries, comp.npcs)}
        q={q}
        cite={g.cite}
        actions={
          own
            ? r =>
                r.entry ? (
                  <div className="row">
                    <button className="btn small quiet" aria-label={`Edit ${r.name}`} onClick={() => setForm({ entry: r.entry })}>
                      Edit
                    </button>
                    <button className="btn small quiet" aria-label={`Delete ${r.name}`} onClick={() => void remove(r)}>
                      Delete
                    </button>
                  </div>
                ) : (
                  <button className="btn small quiet" aria-label={`Move ${r.name} to my NPCs`} onClick={() => void moveOut(r)}>
                    Move to my NPCs
                  </button>
                )
            : targets.length
              ? r => r.entry && <CopyButton r={r} copy={setCopying} />
              : undefined
        }
      />
      {copying && (
        <CopyDialog
          g={g}
          row={copying}
          targets={targets}
          into={into(c)}
          onClose={() => setCopying(null)}
          done={async m => {
            setCopying(null)
            await changed()
            setMsg(m)
          }}
        />
      )}
      <Modal open={!!form} onClose={() => setForm(null)} actions={<></>} title={form?.entry ? `Edit ${form.entry.name}` : 'Add entry'}>
        {form && (
          <EntryForm
            key={form.entry ? `${form.entry.kind}/${form.entry.id}` : 'new'}
            c={c}
            comp={comp}
            entry={form.entry}
            save={put}
            onDone={async text => {
              await changed()
              setForm(null)
              setMsg(text)
            }}
            onCancel={() => setForm(null)}
          />
        )}
      </Modal>
      {msg && (
        <p className="toast" role="status">
          {msg}
        </p>
      )}
    </main>
  )
}

/** Add (no entry: a kind first) or edit one of the compendium's entries. Saves only what validates (entryProblem). */
function EntryForm({
  c,
  comp,
  entry,
  save,
  onDone,
  onCancel,
}: {
  c: Sr6Catalog
  comp: Sr6Compendium
  entry?: Sr6Entry
  save: (e: Sr6Entry) => Promise<void>
  onDone: (msg: string) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Sr6Entry>(() => entry ?? blankSr6Entry(c, 'weapons', comp, ''))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const k = COMP_KINDS[draft.kind]!,
    problem = entryProblem(draft)
  const submit = async () => {
    const name = draft.name.trim()
    const e: Sr6Entry = {
      ...draft,
      name,
      id: entry?.id ?? newEntryId(c, draft.kind, comp, name),
      attrs: Object.fromEntries(Object.entries(draft.attrs).map(([f, v]) => [f, v.trim()])),
    }
    setBusy(true)
    setErr('')
    try {
      await save(e)
      await onDone(`${entry ? 'Saved' : 'Added'} ${name}.`)
    } catch (x) {
      setErr(because('Couldn’t save', (x as Error).message))
      setBusy(false)
    }
  }
  return (
    <form
      className="stack"
      onSubmit={x => {
        x.preventDefault()
        if (!busy && !problem) void submit()
      }}
    >
      {entry ? (
        <p className="muted">
          {SR6_KINDS[entry.kind].label} · {entry.source} p.{entry.page} · {entry.id}
        </p>
      ) : (
        <label>
          Kind
          <select value={draft.kind} onChange={x => setDraft({ ...blankSr6Entry(c, x.target.value as Sr6Kind, comp, draft.name), text: draft.text })}>
            {KINDS.map(kind => (
              <option key={kind} value={kind}>
                {SR6_KINDS[kind].label}
              </option>
            ))}
          </select>
        </label>
      )}
      <Sr6EntryFields entry={draft} fields={k.fields} lines={k.lines} onChange={setDraft} descPlaceholder="Your own words: what it is and does" />
      {problem && <p className="muted">{problem}</p>}
      <div role="alert">{err && <p className="err">{err}</p>}</div>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary" disabled={busy || !!problem}>
          {entry ? 'Save changes' : 'Add entry'}
        </button>
      </div>
    </form>
  )
}

function BookPage({ c, g, id, targets, changed }: BookProps<Sr6Compendium> & { c: Sr6Catalog; g: CompGame<Sr6Compendium> }) {
  const [q, setQ] = useState('')
  const [copying, setCopying] = useState<Sr6Row | null>(null)
  const [msg, setMsg] = useToast()
  const s = c.sources.get(id)!
  const list = KINDS.flatMap(k => [...c.entries[k].values()].filter(e => e.source === id))
  return (
    <main className="lib">
      <PageHeader title={s.name} />
      <p className="muted">
        Book {id}
        {s.publisher ? ` · ${s.publisher}` : ''} · {s.canon ? 'canon' : 'non-canon'} · read only
      </p>
      <div className="row listtools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search entries" />
      </div>
      <Entries rows={sr6Rows(list, [])} q={q} cite={g.cite} actions={targets.length ? r => <CopyButton r={r} copy={setCopying} /> : undefined} />
      {copying && (
        <CopyDialog
          g={g}
          row={copying}
          targets={targets}
          into={into(c)}
          onClose={() => setCopying(null)}
          done={async m => {
            setCopying(null)
            await changed()
            setMsg(m)
          }}
        />
      )}
      {msg && (
        <p className="toast" role="status">
          {msg}
        </p>
      )}
    </main>
  )
}

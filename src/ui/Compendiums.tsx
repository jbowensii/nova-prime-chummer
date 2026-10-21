// Compendiums (#/compendiums): the GMs' own collections of amps, gear, spells, vehicles and NPCs (spec 2026-10-02 §1,
// plan phase 2). Yours (edit, share, delete), the ones shared with you (read only), and the books as read-only
// compendiums. The list, details, routing, entry table and Copy to… are the shell both games share (CompendiumShell.tsx);
// here: Anarchy's adapter, rows and pages. A compendium's entries are saved into its file (compendiumStore.ts) with the
// catalog's own entry form.
import { PageHeader } from './nav'
import { IconButton } from './icons'
import { useEffect, useMemo, useState } from 'react'
import { compendiumSource } from '../engine/compendium'
import type { AmpTemplate, Catalog, Character, Compendium, Item, VehicleBase } from '../model/types'
import { newId } from '../model/types'
import { because } from './auth'
import { Modal, NpcChips } from './bits'
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
} from './CompendiumShell'
import { deleteCompendium, listCompendiums, parseRows, saveCompendium, type StoredCompendium } from './compendiumStore'
import { EntryForm, NOUN, nameOf, slug, type Entry, type FormKind } from './EditEntry'
import { ca2Codec } from '../engine/charxml'
import { npcRepoFor } from './repo'
import { useRepo } from './repoContext'
import { downloadCompendium } from './Foundry'
import { SourceLabel } from './SourceLabel'

/** One listed entry; `kind` and `entry` only for what the form edits (not NPCs). */
interface Row extends ShellRow {
  kind?: FormKind
  entry?: Entry
  npc?: Character
}
const GROUPS = ['Amps', 'Weapons', 'Armor', 'Gear', 'Spells', 'Complex forms', 'Vehicles', 'NPCs'] as const
const ITEM_GROUP: Record<Item['kind'], (typeof GROUPS)[number]> = {
  weapon: 'Weapons',
  armor: 'Armor',
  gear: 'Gear',
  spell: 'Spells',
  'complex-form': 'Complex forms',
}

function groupRows(c: Catalog, amps: AmpTemplate[], items: Item[], vehicles: VehicleBase[], npcs: Character[]) {
  const out = new Map<string, Row[]>(GROUPS.map(g => [g, []]))
  const ref = (e: Entry) => ({ key: e.id, entry: e, source: e.source, page: e.page })
  for (const a of amps)
    out.get('Amps')!.push({
      ...ref(a),
      kind: 'amps',
      name: a.name,
      text: a.narrative,
      detail: [c.ampTypes.get(a.type)?.name ?? a.type, a.printedRating ? `rating ${a.printedRating}` : ''].filter(Boolean).join(', '),
    })
  for (const i of items)
    out.get(ITEM_GROUP[i.kind])!.push({
      ...ref(i),
      kind: 'items',
      name: i.name,
      text: i.text,
      detail: [i.dv && `DV ${i.dv}${i.ranges ? ` [${i.ranges}]` : ''}`, i.specialist && 'specialist', i.armor && `Armor ${i.armor}`, i.category]
        .filter(Boolean)
        .join(', '),
    })
  for (const v of vehicles)
    out.get('Vehicles')!.push({
      ...ref(v),
      kind: 'vehicles',
      name: v.name,
      text: '',
      detail: `Body ${v.body}, Handling ${v.handling}, Speed ${v.speed}${v.flyingSpeed != null ? `, Flying ${v.flyingSpeed}` : ''}, Pilot ${v.pilot}, Armor ${v.armor}, mount ${v.mount}`,
    })
  for (const n of npcs)
    out.get('NPCs')!.push({
      key: n.id,
      npc: n,
      chips: n.npc && <NpcChips npc={n.npc} />,
      name: n.identity.streetName || n.identity.name || 'Unnamed NPC',
      text: '',
      detail: '',
    })
  for (const rows of out.values()) rows.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

type ListKey = 'amps' | 'items' | 'vehicles'
const listOf = (k: FormKind): ListKey => (k === 'amps' ? 'amps' : k === 'items' ? 'items' : 'vehicles')

/** A book's (or another compendium's) entry as a new entry of `to`: a new id and its source, page 1, and no description:
 *  book text never enters a compendium (the GM writes their own). */
export function copyEntry(c: Catalog, kind: FormKind, e: Entry, to: Compendium): Entry {
  const l = listOf(kind),
    base = `${to.source.toLowerCase()}.${slug(nameOf(e))}`
  const taken = (id: string) => c[l].has(id) || (to[l] as Entry[]).some(x => x.id === id)
  let id = base
  for (let n = 2; taken(id); n++) id = `${base}-${n}`
  const { edited: _, ...rest } = e as Entry & { edited?: boolean }
  const out = { ...rest, id, source: to.source, page: 1 }
  return kind === 'amps' ? ({ ...out, narrative: '' } as AmpTemplate) : kind === 'items' ? ({ ...out, text: '' } as Item) : (out as VehicleBase)
}

/** #/compendiums and #/compendiums/<id or book source id>[/<entry id>: its form open (a picker's Edit)]: the shared shell
 *  (CompendiumShell.tsx) with Anarchy's store, catalog and pages. reload: the catalog again (after a save). */
export function CompendiumsScreen({ c, id, edit, reload }: { c: Catalog; id?: string; edit?: string; reload: () => Promise<void> }) {
  const g = useMemo(
    (): CompGame<Compendium> => ({
      game: 'ca2',
      href: '#/compendiums',
      intro:
        'Your own amps, gear, spells, vehicles and NPCs, in collections you can share with a campaign’s GMs or the whole table. Their entries are house content (Non-canon) and show in your pickers. Books are listed as read-only compendiums.',
      list: () =>
        listCompendiums().then(rows => {
          const p = parseRows(rows)
          return { comps: p.comps, bad: p.bad.map(b => `${b.row.ownerName}’s ${b.row.file}: ${b.error}`) }
        }),
      blank: meta => ({ ...meta, updatedAt: '', amps: [], items: [], vehicles: [], npcs: [] }),
      save: saveCompendium,
      remove: id => deleteCompendium(id),
      books: [...c.sources.values()].filter(s => !s.compendium),
      taken: source => c.sources.has(source),
      loaded: comp => c.sources.get(comp.source)?.compendium?.id === comp.id,
      count: x => x.amps.length + x.items.length + x.vehicles.length,
      cite: (source, page) => <SourceLabel c={c} source={source} page={page} />,
    }),
    [c],
  )
  return (
    <CompendiumShell
      g={g}
      id={id}
      reload={reload}
      page={p => <CompendiumPage key={p.comp.id} c={c} g={g} {...p} edit={edit} />}
      book={p => <BookPage c={c} g={g} {...p} />}
    />
  )
}

/** the compendium with a copy of the row's entry added */
const into =
  (c: Catalog) =>
  (comp: StoredCompendium, row: Row): Compendium => {
    const l = listOf(row.kind!)
    return { ...comp, [l]: [...comp[l], copyEntry(c, row.kind!, row.entry!, comp)] }
  }

function CompendiumPage({
  c,
  g,
  comp,
  own,
  campaigns,
  changed,
  edit,
  targets,
}: PageProps<Compendium> & { c: Catalog; g: CompGame<Compendium>; edit?: string }) {
  const npcs = npcRepoFor(useRepo(), ca2Codec)
  const [copying, setCopying] = useState<Row | null>(null)
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ kind: FormKind; entry?: Entry } | null>(() => {
    const a = comp.amps.find(x => x.id === edit),
      i = comp.items.find(x => x.id === edit),
      v = comp.vehicles.find(x => x.id === edit)
    return !own ? null : a ? { kind: 'amps', entry: a } : i ? { kind: 'items', entry: i } : v ? { kind: 'vehicles', entry: v } : null
  })
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(''), 5000)
      return () => clearTimeout(t)
    }
  }, [msg])
  const rows = groupRows(c, comp.amps, comp.items, comp.vehicles, comp.npcs)
  /** the compendium with `e` put in (or, with no e, `drop` taken out), saved; throws why it couldn't */
  const store = async (k: FormKind, e: Entry | null, drop?: string) => {
    const l = listOf(k),
      have = comp[l] as Entry[],
      id = e?.id ?? drop
    const next = e ? (have.some(x => x.id === id) ? have.map(x => (x.id === id ? e : x)) : [...have, e]) : have.filter(x => x.id !== id)
    const r = await saveCompendium({ ...comp, [l]: next }, comp.rev)
    if (!r.ok) throw new Error(r.conflict ? 'it changed elsewhere since this page loaded (reload the page)' : r.error)
  }
  // the entry form's save: the Description is the entry's own text
  const put = (k: FormKind) => (e: Entry, desc: string) =>
    store(k, k === 'amps' ? ({ ...e, narrative: desc } as AmpTemplate) : k === 'items' ? ({ ...e, text: desc } as Item) : e)
  const remove = async (r: Row) => {
    if (!confirm(`Delete ${r.name} from ${comp.name}? Runners and NPCs that use it keep their copy.`)) return
    try {
      await store(r.kind!, null, r.key)
      await changed()
      setMsg(`Deleted ${r.name}.`)
    } catch (e) {
      setMsg(because('Couldn’t delete it', (e as Error).message))
    }
  }
  // out to the NPC area under a new id (the old one may still be in the NPC trash), then out of the compendium; a failed
  // compendium save takes the new NPC back out
  const moveOut = async (r: Row) => {
    const ch = { ...r.npc!, id: newId(), campaign: undefined }
    try {
      const put = await npcs.save(ch)
      if (!put.ok) throw new Error(put.error ?? 'the NPC area refused it')
      const s = await saveCompendium({ ...comp, npcs: comp.npcs.filter(n => n.id !== r.key) }, comp.rev)
      if (!s.ok) {
        await npcs.remove(ch.id).catch(() => {})
        throw new Error(s.conflict ? 'it changed elsewhere since this page loaded (reload the page)' : s.error)
      }
      await changed()
      setMsg(`Moved ${r.name} to your NPCs.`)
    } catch (e) {
      setMsg(because('Couldn’t move it', (e as Error).message))
    }
  }
  const sharing = sharingOf(comp, campaigns).replace(/^./, ch => ch.toLowerCase())
  const count = g.count(comp)

  return (
    <main className="lib">
      <PageHeader title={comp.name}>
        <IconButton icon="foundry" label="Export for Foundry" onClick={() => downloadCompendium(c, comp)} />
      </PageHeader>
      <p className="muted">
        Source {comp.source} · {own ? 'yours' : `${comp.ownerName}’s, read only`} · {sharing} · {entries(count)}
        {comp.npcs.length ? `, ${comp.npcs.length} NPC${comp.npcs.length === 1 ? '' : 's'}` : ''}
      </p>
      {own && (
        <div className="row">
          <button className="btn" onClick={() => setForm({ kind: 'amps' })}>
            Add an amp
          </button>
          <button className="btn" onClick={() => setForm({ kind: 'items' })}>
            Add an item
          </button>
          <button className="btn" onClick={() => setForm({ kind: 'vehicles' })}>
            Add a vehicle
          </button>
        </div>
      )}
      <div className="row listtools">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label="Search entries" />
      </div>
      <Entries
        rows={rows}
        q={q}
        cite={g.cite}
        actions={
          own
            ? r =>
                r.kind ? (
                  <div className="row">
                    <button className="btn small quiet" aria-label={`Edit ${r.name}`} onClick={() => setForm({ kind: r.kind!, entry: r.entry })}>
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
              ? r => r.kind && <CopyButton r={r} copy={setCopying} />
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
      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        actions={<></>}
        title={form?.entry ? `Edit ${nameOf(form.entry)}` : form ? `Add ${form.kind === 'items' ? 'an' : 'a'} ${NOUN[form.kind]}` : ''}
      >
        {form && (
          <EntryForm
            key={`${form.kind} ${form.entry?.id}`}
            c={c}
            kind={form.kind}
            entry={form.entry}
            sources={[compendiumSource(comp)]}
            save={put(form.kind)}
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

function BookPage({ c, g, id, targets, changed }: BookProps<Compendium> & { c: Catalog; g: CompGame<Compendium> }) {
  const [q, setQ] = useState('')
  const [copying, setCopying] = useState<Row | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (msg) {
      const t = setTimeout(() => setMsg(''), 5000)
      return () => clearTimeout(t)
    }
  }, [msg])
  const s = c.sources.get(id)!
  const of = <T extends { source: string }>(m: Map<string, T>) => [...m.values()].filter(e => e.source === id)
  const rows = groupRows(c, of(c.amps), of(c.items), of(c.vehicles), [])
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
      <Entries rows={rows} q={q} cite={g.cite} actions={targets.length ? r => <CopyButton r={r} copy={setCopying} /> : undefined} />
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

// Shadowrun 6 NPCs & Critters (#/sr6/npcs): the GMs' own area (admin and editors), as Anarchy's NpcsScreen. Two sections,
// each its own tab, search and list grouped by kind and rating (npcGroups): NPCs (grunts and contacts, #/sr6/npcs) and
// Critters (critters, spirits and sprites, #/sr6/npcs/critters); New NPC / New critter offer that section's kinds. An SR6 NPC
// is an SR6 runner file with an <npc> block (server: /api/sr6/npcs, which refuses players and runner files). New NPC copies
// a catalog grunt, contact, critter, spirit or sprite (src/sr6/engine/npc.ts) or starts blank; Load book NPCs copies the
// catalog's npcs, critters, spirits and sprites not loaded yet (one printed in several books: once if the stat blocks
// match, else each version as "<Name> #1", "#2"… in publication order); Tidy book copies (R: a banner with a confirm, as
// Anarchy's Tidy up) does the same to the copies already loaded; Import file takes SR6 NPC files only; a GM shares one with
// an SR6 campaign they run; Move to
// compendium… puts one into an SR6 compendium of yours (compendiumStore.ts moveNpcsIn); Copy duplicates one. A new
// critter opens on its Design tab (tabs/Design.tsx, owner 2026-10-16 BUILDER Q11); Copy to compendium as a critter… puts
// a critter into a compendium of yours as a critters entry (compendium.ts critterAsEntry), which a runner at a table the
// compendium is shared with can own on their Critters tab: GM-made NPCs themselves are never shown to players.
// Export for Foundry: the header's dialog and each row's button (Foundry.tsx). Left out (R): the duplicates finder.
// Load book NPCs and Tidy book copies save a few at a time (inBatches), counting in the status line, then sum up.
import { useEffect, useMemo, useRef, useState } from 'react'
import { because, savesSettled, send, useMe } from '../../ui/auth'
import { inBatches, Modal, Working, type Busy } from '../../ui/bits'
import { loadCampaigns, type Campaign } from '../../ui/campaignsStore'
import { ExportRunnersDialog } from '../../ui/foundryKit'
import { IconButton, IconLink } from '../../ui/icons'
import { arrange, ownerGroups, type SortBy, unedited } from '../../ui/runnerList'
import { PageHeader } from '../../ui/nav'
import { Face } from '../../ui/Portrait'
import type { Stored as StoredComp } from '../../ui/compendiumStore'
import { newId } from '../../shared/types'
import { saveAsNew, type Stored, type Unreadable } from '../../ui/repo'
import { loadTrash } from '../../ui/Trash'
import type { CreationRules } from '../engine/creation'
import type { Sr6Data } from '../engine/data'
import { critterAsEntry } from '../engine/compendium'
import { designCritter } from '../engine/critterdesign'
import { blankSr6Npc, bookNpc, bookNpcKey, bookNpcVersions, NPC_KINDS, npcFromEntry, npcKindOf, type BookNpcVersion } from '../engine/npc'
import { SR6_NPC_KINDS, type Sr6Character, type Sr6Npc, type Sr6NpcKind } from '../model/character'
import type { Sr6Catalog, Sr6Entry } from '../model/types'
import type { Sr6Compendium } from '../model/character'
import { listSr6Compendiums, moveNpcsIn, parseSr6Rows, saveSr6Compendium } from './compendiumStore'
import { npcSection, sr6NpcHref } from './editor'
import { downloadSr6Runners, SR6_FOUNDRY_ABOUT } from './Foundry'
import { exportSr6, readSr6NpcImport, sr6NpcRepo } from './repo'

const SORT_KEY = 'ca2.sr6.npcs.sort'
type Section = ReturnType<typeof npcSection>
const SECTIONS: Record<Section, { label: string; href: string; kinds: Sr6NpcKind[]; noun: string }> = {
  npcs: { label: 'NPCs', href: '#/sr6/npcs', kinds: ['grunt', 'contact'], noun: 'NPC' },
  critters: { label: 'Critters', href: '#/sr6/npcs/critters', kinds: ['critter', 'spirit', 'sprite'], noun: 'critter' },
}
const nameOf = (ch: Sr6Character) => ch.identity.streetName || ch.identity.name || 'Unnamed NPC'

/** The book NPCs' versions (bookNpcVersions); a compendium's (a source of origin user) never: those are moved, not copied. */
const versionsOf = (entries: Sr6Entry[], sources: Sr6Catalog['sources']) =>
  bookNpcVersions(
    entries.filter(e => sources.get(e.source)?.origin !== 'user'),
    sources,
  )

/** The book NPCs Load book NPCs adds, each with the name it loads under: per version, its earliest printing, unless the
 *  book key of one of its printings is the sampleKey of one of `mine` (a renamed copy counts). */
export function bookNpcsToLoad(entries: Sr6Entry[], mine: Sr6Character[], sources: Sr6Catalog['sources']): { e: Sr6Entry; name: string }[] {
  const have = new Set(mine.map(ch => ch.sampleKey))
  return versionsOf(entries, sources)
    .filter(v => !v.entries.some(e => have.has(bookNpcKey(e))))
    .map(v => ({ e: v.entries[0], name: v.name }))
}

/** Tidy book copies: among `mine`'s untouched book copies (a book key the catalog has, unedited since loaded: saved once),
 *  one per version stays, the copy of its earliest printing (then the oldest); the others go to the NPC trash. The one
 *  that stays is renamed when its name isn't its version's ("Fuzzbeast #2"). NPCs the GM made or changed never count. */
export function tidyBookCopies(mine: Stored<Sr6Character>[], entries: Sr6Entry[], sources: Sr6Catalog['sources']) {
  const at = new Map(versionsOf(entries, sources).flatMap(v => v.entries.map((e, i) => [bookNpcKey(e), { v, i }] as const)))
  const copies = new Map<BookNpcVersion, { s: Stored<Sr6Character>; i: number }[]>()
  for (const s of mine) {
    const a = s.ch.sampleKey ? at.get(s.ch.sampleKey) : undefined
    if (a && unedited(s.ch, s.rev)) copies.set(a.v, [...(copies.get(a.v) ?? []), { s, i: a.i }])
  }
  const trash: Stored<Sr6Character>[] = [],
    rename: { s: Stored<Sr6Character>; name: string }[] = []
  for (const [v, cs] of copies) {
    const [keep, ...extra] = cs.sort((a, b) => a.i - b.i || a.s.ch.updatedAt.localeCompare(b.s.ch.updatedAt))
    trash.push(...extra.map(x => x.s))
    if (nameOf(keep.s.ch) !== v.name) rename.push({ s: keep.s, name: v.name })
  }
  return { trash, rename }
}

/** Where a book copy came from: "WL p.112". */
const fromOf = (ch: Sr6Character) => (ch.npc?.from ? `${ch.npc.from.source} p.${ch.npc.from.page}` : (ch.sampleKey?.split('|')[0] ?? ''))

/** A copy of a book sample contact that 0.9.0 loaded as a grunt of group Contact. */
export const oldContact = (ch: Sr6Character) => !!ch.sampleKey && ch.npc?.kind === 'grunt' && ch.npc.group === 'Contact' && ch.npc.rating == null

/** Grunts by Professional Rating, lowest first; null (none printed) last. */
export function byRating(entries: Sr6Entry[]): [number | null, Sr6Entry[]][] {
  const groups = new Map<number | null, Sr6Entry[]>()
  for (const e of entries) {
    const r = Number(e.attrs.rating) || null
    groups.set(r, [...(groups.get(r) ?? []), e])
  }
  return [...groups].sort(([a], [b]) => (a ?? Infinity) - (b ?? Infinity))
}

/** The row chip: "Grunt PR 2", "Spirit F 4", "Sprite L 3", "Critter", "Contact". */
export function npcChip(npc: Sr6Npc): string {
  const k = NPC_KINDS[npc.kind],
    short = k.rating?.letter ?? (k.rating ? 'PR' : '')
  return npc.rating != null && short ? `${k.label} ${short} ${npc.rating}` : k.label
}

/** The list's groups, in kind order then rating (none last), each keeping the list's order: "Grunts, Professional Rating 2",
 *  "Contacts", "Critters", "Spirits, Force 4", "Sprites, Level 3". */
export function npcGroups<T extends { ch: Sr6Character }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, { at: number; r: number; rows: T[] }>()
  for (const x of rows) {
    const npc = x.ch.npc,
      kind = npc?.kind ?? 'grunt',
      k = NPC_KINDS[kind],
      r = npc?.rating
    const label = `${k.label}s${k.rating ? (r != null ? `, ${k.rating.label} ${r}` : `, no ${k.rating.label}`) : ''}`
    const g = groups.get(label) ?? { at: SR6_NPC_KINDS.indexOf(kind), r: r ?? Infinity, rows: [] }
    groups.set(label, { ...g, rows: [...g.rows, x] })
  }
  return [...groups].sort(([, a], [, b]) => a.at - b.at || a.r - b.r).map(([label, g]) => [label, g.rows])
}

/** The Professional Ratings the grunts in the list have, lowest first (the picker beside the search). */
export const gruntRatings = (rows: { ch: Sr6Character }[]) =>
  [...new Set(rows.flatMap(({ ch }) => (ch.npc?.kind === 'grunt' && ch.npc.rating != null ? [ch.npc.rating] : [])))].sort((a, b) => a - b)
/** The rows at a Professional Rating ('': all of them); a rating leaves out whatever has none (contacts, critters). */
export const atRating = <T extends { ch: Sr6Character }>(rows: T[], pr: string): T[] =>
  pr === '' ? rows : rows.filter(({ ch }) => ch.npc?.rating === Number(pr) && ch.npc.kind === 'grunt')

export function Sr6Npcs({
  c,
  data,
  cr,
  section = 'npcs',
  reload,
}: {
  c: Sr6Catalog
  data: Sr6Data
  cr: CreationRules
  section?: Section
  /** the catalog loaded again (a critter copied into a compendium) */
  reload?: () => void
}) {
  const repo = useMemo(() => sr6NpcRepo(), [])
  const me = useMe()
  const [list, setList] = useState<Stored<Sr6Character>[] | null>(null)
  const [unreadable, setUnreadable] = useState<Unreadable[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [note, setNote] = useState<{ text: string; failed: string[] } | null>(null)
  const setMsg = (text: string | null, failed: string[] = []) => setNote(text === null ? null : { text, failed })
  const [busy, setBusy] = useState<Busy | null>(null) // Load book NPCs or Tidy book copies, while it runs
  const [qs, setQs] = useState<Record<Section, string>>({ npcs: '', critters: '' }) // each section its own search
  const q = qs[section],
    setQ = (v: string) => setQs(x => ({ ...x, [section]: v }))
  const sec = SECTIONS[section]
  const [pr, setPr] = useState('') // the Professional Rating shown on the NPCs tab ('': all)
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
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<Sr6NpcKind>('grunt')
  const [from, setFrom] = useState('')
  const [rating, setRating] = useState('1')
  const [sharing, setSharing] = useState<Sr6Character | null>(null)
  const [target, setTarget] = useState('')
  const [toDelete, setToDelete] = useState<Sr6Character | null>(null)
  const [trashed, setTrashed] = useState<number | null>(null)
  const [comps, setComps] = useState<StoredComp<Sr6Compendium>[]>([]) // yours, where an NPC can move
  const [moving, setMoving] = useState<Sr6Character | null>(null)
  const [asCritter, setAsCritter] = useState<Sr6Character | null>(null)
  const [into, setInto] = useState('')
  const [foundry, setFoundry] = useState(false)
  const [tidying, setTidying] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const refresh = () => {
    loadCampaigns('sr6').then(setCampaigns, () => setCampaigns([]))
    loadTrash(undefined, true, 'sr6').then(
      t => setTrashed(t.items.length),
      () => setTrashed(null),
    )
    listSr6Compendiums().then(
      rows => setComps(parseSr6Rows(rows).comps.filter(x => x.owner === me?.username)),
      () => setComps([]),
    )
    return savesSettled()
      .then(() => repo.listAll())
      .then(
        r => {
          setList(r.stored)
          setUnreadable(r.unreadable)
        },
        e => {
          setMsg(because('Couldn’t load your NPCs', (e as Error).message ?? String(e)))
          setList([])
        },
      )
  }
  useEffect(() => {
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const own = (s: { owner?: string }) => !me || !s.owner || s.owner === me.username
  const mine = (list ?? []).filter(own)
  const here = (s: Stored<Sr6Character>) => npcSection(s.ch.npc) === section
  const count = (k: Section) => (list ?? []).filter(s => npcSection(s.ch.npc) === k).length
  // a file that won't open has no kind: it shows under NPCs
  const others = ownerGroups(
    (list ?? []).filter(s => !own(s) && here(s)),
    section === 'npcs' ? unreadable.filter(u => !own(u)) : [],
    sort,
    q,
  )
  const ratings = section === 'npcs' ? gruntRatings((list ?? []).filter(here)) : []
  const shown = section === 'npcs' && ratings.includes(Number(pr)) ? pr : ''
  const rows = atRating(arrange(mine.filter(here), sort, q), shown)
  const gmOf = campaigns.filter(x => x.you === 'gm' && !x.archived)
  const campaignOf = (ch: Sr6Character) => campaigns.find(x => x.id === ch.campaign)
  const entriesOf = (k: Sr6NpcKind) => [...c.entries[NPC_KINDS[k].kind].values()].filter(e => npcKindOf(e) === k).sort((a, b) => a.name.localeCompare(b.name))
  const rated = !!NPC_KINDS[kind].rating?.letter
  const all = useMemo(() => (['npcs', 'critters', 'spirits', 'sprites'] as const).flatMap(k => [...c.entries[k].values()]), [c])
  const plan = useMemo(() => tidyBookCopies(mine, all, c.sources), [list, all]) // eslint-disable-line react-hooks/exhaustive-deps

  /** saved: null; else why not */
  const saveError = async (ch: Sr6Character, rev?: number) => {
    const r = await repo.save(ch, rev)
    return r.ok ? null : (r.error ?? `${nameOf(ch)} changed elsewhere; open it to sort it out.`)
  }
  const store = async (ch: Sr6Character, rev?: number) => {
    const err = await saveError(ch, rev)
    if (err) setMsg(err)
    return !err
  }
  const pickKind = (k: Sr6NpcKind) => {
    setKind(k)
    setFrom(entriesOf(k)[0]?.id ?? '')
  }
  const openNew = () => {
    pickKind(sec.kinds[0])
    setRating('1')
    setCreating(true)
  }
  const level = Math.max(1, Math.floor(Number(rating)) || 1)
  const create = async () => {
    const e = from ? c.entries[NPC_KINDS[kind].kind].get(from) : undefined
    const ch = e ? npcFromEntry(e, rated ? level : undefined) : blankSr6Npc(kind, rated ? level : undefined)
    if (kind === 'critter') designCritter(ch.npc!, data, cr)
    if (await store(ch)) {
      setCreating(false)
      location.hash = sr6NpcHref(ch.id, kind === 'critter' ? 'design' : undefined)
    }
  }
  // a copy is the GM's own: not shared, not a book copy (Tidy book copies never touches it)
  const copy = async (ch: Sr6Character) => {
    const { campaign: _c, sampleKey: _k, ...rest } = structuredClone(ch)
    const x: Sr6Character = { ...rest, id: newId(), identity: { ...ch.identity, streetName: `${nameOf(ch)} (copy)` }, updatedAt: new Date().toISOString() }
    const err = await saveError(x)
    setMsg(err ?? `Copied ${nameOf(ch)}.`)
    void refresh()
  }
  const copyAsCritter = async () => {
    const comp = comps.find(x => x.id === into)!,
      ch = asCritter!
    setAsCritter(null)
    const r = await saveSr6Compendium({ ...comp, entries: [...comp.entries, critterAsEntry(c, ch, comp)] }, comp.rev)
    if (!r.ok) return setMsg(because('Couldn’t copy it', r.conflict ? `${comp.name} changed elsewhere; reload the page` : (r.error ?? 'the server refused it')))
    setMsg(`Copied ${nameOf(ch)} to ${comp.name} as a critter: runners at a table it’s shared with can own it on their Critters tab.`)
    reload?.()
    void refresh()
  }

  const importFiles = async (files: FileList | null) => {
    if (!files) return
    const picked = [...files],
      have = new Set((list ?? []).map(s => s.ch.id))
    const done: string[] = [],
      bad: string[] = []
    for (const f of picked) {
      const r = readSr6NpcImport(await f.text(), have)
      if (!r.ok) {
        bad.push(`${f.name}: ${r.reason}`)
        continue
      }
      // its id taken after all (the list hadn't loaded yet): saved under a new one
      const { ch, r: saved } = await saveAsNew(x => repo.save(x), r.ch, newId)
      const err = saved.ok ? null : (saved.error ?? `${nameOf(ch)} changed elsewhere; open it to sort it out.`) // the summary below replaces the message
      if (err) bad.push(`${f.name}: ${err}`)
      else {
        done.push(nameOf(ch))
        have.add(ch.id)
      }
    }
    setMsg([done.length ? `Imported ${done.join(', ')}.` : '', ...bad].filter(Boolean).join(' '))
    void refresh()
  }

  // the catalog's grunts, sample contacts, critters, spirits and sprites (bookNpc: a spirit or sprite at a default rating),
  // each under its book key so a renamed copy still counts as loaded, once per version (bookNpcsToLoad); 0.9.0's copies
  // of the sample contacts (grunts of group Contact) become contacts. A few saves at a time, counted as they go.
  const loadBook = async () => {
    if (!all.length) return setMsg('No book NPCs yet: they come with an imported core rulebook.')
    const old = mine.filter(s => oldContact(s.ch)),
      todo = bookNpcsToLoad(
        all,
        mine.map(s => s.ch),
        c.sources,
      )
    const there = versionsOf(all, c.sources).length - todo.length
    let n = 0,
      numbered = 0,
      fixed = 0
    const bad: string[] = []
    const step = () => setBusy(b => b && { ...b, done: b.done + 1 })
    setMsg(null)
    setBusy({ what: 'Loading book NPCs', done: 0, total: old.length + todo.length })
    await inBatches(
      old,
      async s => {
        const { group: _g, ...npc } = s.ch.npc!
        const err = await saveError({ ...s.ch, npc: { ...npc, kind: 'contact' } }, s.rev).catch((e: Error) => e.message ?? String(e))
        if (err) bad.push(`${nameOf(s.ch)}: ${err}`)
        else fixed++
      },
      step,
    )
    await inBatches(
      todo,
      async ({ e, name }) => {
        const ch = bookNpc(e)
        ch.identity.streetName = name
        const err = await saveError(ch).catch((x: Error) => x.message ?? String(x))
        if (err) bad.push(`${name}: ${err}`)
        else {
          n++
          if (name !== e.name) numbered++
        }
      },
      step,
    )
    setBusy(null)
    setMsg(
      [
        `Loaded ${n} · already there ${there} · versions numbered ${numbered} · failed ${bad.length}.`,
        fixed ? `${fixed} sample contact${fixed === 1 ? ' is a contact' : 's are contacts'} now.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      bad,
    )
    void refresh()
  }

  // what the confirm listed: the extra copies to the NPC trash, then the renames, a few at a time; a failure is reported,
  // the rest go on
  const tidy = async () => {
    setTidying(false)
    const moved: string[] = [],
      renamed: string[] = [],
      bad: string[] = []
    const step = () => setBusy(b => b && { ...b, done: b.done + 1 })
    setMsg(null)
    setBusy({ what: 'Tidying book copies', done: 0, total: plan.trash.length + plan.rename.length })
    await inBatches(
      plan.trash,
      async ({ ch }) => {
        try {
          await repo.remove(ch.id)
          moved.push(nameOf(ch))
        } catch (e) {
          bad.push(because(`Couldn’t move ${nameOf(ch)}`, (e as Error).message ?? String(e)))
        }
      },
      step,
    )
    await inBatches(
      plan.rename,
      async ({ s, name }) => {
        const err = await saveError({ ...s.ch, identity: { ...s.ch.identity, streetName: name } }, s.rev).catch((e: Error) => e.message ?? String(e))
        if (err) bad.push(`${nameOf(s.ch)}: ${err}`)
        else renamed.push(name)
      },
      step,
    )
    setBusy(null)
    setMsg(
      [
        moved.length ? `Moved to the NPC trash: ${moved.join(', ')}.` : '',
        renamed.length ? `Renamed: ${renamed.join(', ')}.` : '',
        bad.length ? `Failed: ${bad.length}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      bad,
    )
    void refresh()
  }

  // saved into the compendium first (unshared), then deleted here (to the NPC trash); a failed save moves nothing
  const moveIn = async () => {
    const comp = comps.find(x => x.id === into)!,
      ch = moving!
    setMoving(null)
    const r = await moveNpcsIn(comp, [ch], id => repo.remove(id))
    setMsg(
      !r.ok
        ? because('Couldn’t move it', r.error)
        : r.left.length
          ? `Moved ${nameOf(ch)} to ${comp.name}, but couldn’t take it out of your NPCs: delete it here.`
          : `Moved ${nameOf(ch)} to ${comp.name}.`,
    )
    void refresh()
  }

  const share = async (ch: Sr6Character, cid: string | null) => {
    try {
      const x = cid ? campaigns.find(k => k.id === cid) : campaignOf(ch)
      await send(
        cid ? `sr6/campaigns/${cid}/npcs` : `sr6/campaigns/${ch.campaign}/npcs/${encodeURIComponent(ch.id)}`,
        cid ? { id: ch.id } : undefined,
        cid ? 'POST' : 'DELETE',
      )
      setMsg(cid ? `${nameOf(ch)} is shared with ${x?.name}.` : `${nameOf(ch)} is no longer shared with ${x?.name ?? 'its campaign'}.`)
    } catch (e) {
      setMsg((e as Error).message)
    }
    setSharing(null)
    void refresh()
  }

  const row = ({ ch, rev }: Stored<Sr6Character>, mineToo: boolean) => (
    <div className="dossier" key={ch.id}>
      <Face ch={ch} />
      <div>
        <a className="title" href={sr6NpcHref(ch.id)}>
          {nameOf(ch)}
        </a>
        <div className="meta">
          {ch.npc && <span className="noncanon npckind">{npcChip(ch.npc)}</span>}
          {ch.npc?.group && <> {ch.npc.group}</>}
          {campaignOf(ch) && (
            <>
              {' '}
              <a className="ctag" href={`#/sr6/campaigns/${ch.campaign}`} title="Shared with this campaign">
                {campaignOf(ch)!.name}
              </a>
            </>
          )}
        </div>
      </div>
      <div className="row">
        {!mineToo && (
          <a className="btn small" href={sr6NpcHref(ch.id, 'print')} aria-label={`Print ${nameOf(ch)}`}>
            Print
          </a>
        )}
        <button
          className="btn small"
          aria-label={`Export ${nameOf(ch)}`}
          onClick={async () => {
            const out = exportSr6(c, ch)
            if (mineToo) {
              await store(out, rev)
              void refresh()
            }
          }}
        >
          Export
        </button>
        <button className="btn small quiet" aria-label={`Export ${nameOf(ch)} for Foundry`} onClick={() => downloadSr6Runners(c, data, cr, [ch])}>
          Export for Foundry
        </button>
        {mineToo &&
          (ch.campaign ? (
            <button className="btn small quiet" aria-label={`Unshare ${nameOf(ch)}`} onClick={() => void share(ch, null)}>
              Unshare
            </button>
          ) : (
            gmOf.length > 0 && (
              <button
                className="btn small quiet"
                aria-label={`Share ${nameOf(ch)}…`}
                onClick={() => {
                  setTarget(gmOf[0].id)
                  setSharing(ch)
                }}
              >
                Share with campaign…
              </button>
            )
          ))}
        {mineToo && comps.length > 0 && (
          <button
            className="btn small quiet"
            aria-label={`Move ${nameOf(ch)} to a compendium…`}
            onClick={() => {
              setInto(comps[0].id)
              setMoving(ch)
            }}
          >
            Move to compendium…
          </button>
        )}
        {mineToo && comps.length > 0 && ch.npc?.kind === 'critter' && (
          <button
            className="btn small quiet"
            aria-label={`Copy ${nameOf(ch)} to a compendium as a critter…`}
            onClick={() => {
              setInto(comps[0].id)
              setAsCritter(ch)
            }}
          >
            Copy to compendium as a critter…
          </button>
        )}
        {mineToo && (
          <button className="btn small quiet" aria-label={`Copy ${nameOf(ch)}`} onClick={() => void copy(ch)}>
            Copy
          </button>
        )}
        {mineToo && (
          <button className="btn small quiet" aria-label={`Delete ${nameOf(ch)}`} onClick={() => setToDelete(ch)}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
  const broken = (u: Unreadable) => (
    <div className="dossier unreadable" key={`${u.owner}/${u.file}`}>
      <span className="face" aria-hidden>
        !
      </span>
      <div>
        <span className="title">Couldn’t open {u.name}</span>
        <div className="meta err">{u.error}</div>
      </div>
    </div>
  )
  const entries = entriesOf(kind),
    plural = `${NPC_KINDS[kind].label.toLowerCase()}s`
  const mineHere = mine.filter(here)

  return (
    <main className="lib">
      <PageHeader title="NPCs & Critters">
        <IconButton className="primary" icon="npc-add" label={`New ${sec.noun}`} onClick={openNew} />
        <IconButton icon="upload" label="Import file" onClick={() => file.current?.click()} />
        <IconButton
          icon="book"
          label="Load book NPCs"
          onClick={() => void loadBook()}
          disabled={!!busy || list === null}
          aria-busy={busy?.what === 'Loading book NPCs'}
        />
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
        {trashed !== null && <IconLink icon="trash" label={`Trash (${trashed})`} href="#/sr6/npcs/trash" badge={trashed || undefined} />}
      </PageHeader>
      <p className="muted">
        Your NPCs, critters, spirits and sprites, for GMs only: players never see them. Share one with a campaign you run and its other GMs can read and print
        it.
      </p>
      <nav className="tabs sections" aria-label="NPCs or critters">
        {(Object.keys(SECTIONS) as Section[]).map(k => (
          <a key={k} href={SECTIONS[k].href} aria-current={k === section ? 'page' : undefined}>
            {SECTIONS[k].label}
            {list !== null && <span className="badge">{count(k)}</span>}
          </a>
        ))}
      </nav>
      {(busy || note) && (
        <p className="banner" role="status">
          {busy ? <Working busy={busy} /> : note!.text}
        </p>
      )}
      {!busy && !!note?.failed.length && (
        <ul className="banner bad" aria-label="Failed">
          {note.failed.map(f => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      {plan.trash.length + plan.rename.length > 0 && (
        <p className="banner">
          Some book NPCs are printed in more than one book:{' '}
          {[
            plan.trash.length > 0 && `${plan.trash.length} ${plan.trash.length === 1 ? 'copy is' : 'copies are'} the same as another`,
            plan.rename.length > 0 && `${plan.rename.length} to number`,
          ]
            .filter(Boolean)
            .join(', ')}
          .{' '}
          <button className="btn small" disabled={!!busy} onClick={() => setTidying(true)}>
            Tidy book copies
          </button>
        </p>
      )}
      {list !== null && list.length > 0 && (
        <div className="row listtools">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Name" aria-label={`Search ${sec.label.toLowerCase()}`} />
          {ratings.length > 0 && (
            <label className="inline">
              Professional Rating
              <select value={shown} onChange={e => setPr(e.target.value)}>
                <option value="">All</option>
                {ratings.map(r => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}
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
        <p className="muted">Loading NPCs…</p>
      ) : (
        <>
          {others.length > 0 && <h2>My {sec.label}</h2>}
          {section === 'npcs' && unreadable.filter(own).map(broken)}
          {mineHere.length === 0 ? (
            <div className="empty">
              <p>
                {section === 'npcs'
                  ? 'No NPCs yet. Make one, import an NPC file, or load the book’s NPCs.'
                  : 'No critters yet. Make one (a critter, spirit or sprite), import a file, or load the book’s NPCs.'}
              </p>
            </div>
          ) : (
            <>
              {npcGroups(rows).map(([label, rs]) => (
                <section key={label} aria-label={label}>
                  <h3 className="npcgroup">
                    {label} <span className="muted">({rs.length})</span>
                  </h3>
                  {rs.map(s => row(s, true))}
                </section>
              ))}
              {q && rows.length === 0 && (
                <p className="muted">
                  No {sec.noun}’s name contains “{q.trim()}”.
                </p>
              )}
            </>
          )}
          {others.map(({ owner, name, rows, broken: bad }) => (
            <section key={owner} aria-label={`${name}’s ${sec.label}`}>
              <h2>
                {name}’s {sec.label}
              </h2>
              {bad.map(broken)}
              {npcGroups(atRating(rows, shown)).map(([label, rs]) => (
                <section key={label} aria-label={`${name}’s ${label}`}>
                  <h3 className="npcgroup">
                    {label} <span className="muted">({rs.length})</span>
                  </h3>
                  {rs.map(s => row(s, false))}
                </section>
              ))}
            </section>
          ))}
        </>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={`New ${sec.noun}`}
        actions={
          <>
            <button className="btn" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button className="btn primary" onClick={() => void create()}>
              Create {sec.noun}
            </button>
          </>
        }
      >
        <div className="grid2">
          <label>
            Kind
            <select value={kind} onChange={e => pickKind(e.target.value as Sr6NpcKind)}>
              {sec.kinds.map(k => (
                <option key={k} value={k}>
                  {NPC_KINDS[k].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            From the catalog
            <select value={from} onChange={e => setFrom(e.target.value)}>
              {kind === 'grunt'
                ? byRating(entries).map(([r, es]) => (
                    <optgroup key={r ?? ''} label={r == null ? 'No Professional Rating' : `Professional Rating ${r}`}>
                      {es.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  ))
                : entries.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              <option value="">Blank</option>
            </select>
          </label>
          {rated && (
            <label>
              {NPC_KINDS[kind].rating!.label}
              <input type="number" min={1} step={1} value={rating} onChange={e => setRating(e.target.value)} />
            </label>
          )}
        </div>
        {!entries.length && (
          <p className="muted" style={{ marginTop: '0.8rem' }}>
            No {plural} in the imported books yet.
          </p>
        )}
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          {kind === 'critter'
            ? 'It opens on its Design tab: attributes, powers and weaknesses from the catalog (0 Karma), skills, and the values worked out from them.'
            : `The stat block is a copy: change it on the ${sec.noun}’s Stat block tab.`}
        </p>
      </Modal>

      <Modal
        open={!!sharing}
        onClose={() => setSharing(null)}
        title={`Share ${sharing ? nameOf(sharing) : 'this NPC'} with a campaign`}
        actions={
          <>
            <button className="btn" onClick={() => setSharing(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!target} onClick={() => void share(sharing!, target)}>
              Share
            </button>
          </>
        }
      >
        <label>
          Campaign
          <select value={target} onChange={e => setTarget(e.target.value)}>
            {gmOf.map(x => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          The campaign’s other GMs can read and print it; its players can’t see it. An NPC is shared with one campaign at a time.
        </p>
      </Modal>

      <Modal
        open={!!moving}
        onClose={() => setMoving(null)}
        title={`Move ${moving ? nameOf(moving) : 'this NPC'} to a compendium`}
        actions={
          <>
            <button className="btn" onClick={() => setMoving(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!into} onClick={() => void moveIn()}>
              Move
            </button>
          </>
        }
      >
        <label>
          Compendium
          <select value={into} onChange={e => setInto(e.target.value)}>
            {comps.map(x => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          It leaves your NPCs (to the NPC trash) and any campaign it’s shared with. Move it back out on the compendium’s page to edit it.
        </p>
      </Modal>

      <Modal
        open={!!asCritter}
        onClose={() => setAsCritter(null)}
        title={`Copy ${asCritter ? nameOf(asCritter) : 'this critter'} to a compendium as a critter`}
        actions={
          <>
            <button className="btn" onClick={() => setAsCritter(null)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!into} onClick={() => void copyAsCritter()}>
              Copy
            </button>
          </>
        }
      >
        <label>
          Compendium
          <select value={into} onChange={e => setInto(e.target.value)}>
            {comps.map(x => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted" style={{ marginTop: '0.8rem' }}>
          Its stat block becomes one of the compendium’s critters; it stays here too. Share the compendium with a campaign or the table and its runners can own
          one on their Critters tab, priced by Wild Life’s table (p. 180). Later changes here don’t change the copy.
        </p>
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title={`Delete ${toDelete ? nameOf(toDelete) : 'this NPC'}?`}
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
                  setMsg(because('Couldn’t delete the NPC', (e as Error).message ?? String(e)))
                }
                setToDelete(null)
                void refresh()
              }}
            >
              Delete NPC
            </button>
          </>
        }
      >
        <p>It moves to your Shadowrun 6 NPC trash, where you can restore it or delete it for good.</p>
      </Modal>

      <Modal
        open={tidying}
        onClose={() => setTidying(false)}
        title="Tidy book copies"
        actions={
          <>
            <button className="btn" onClick={() => setTidying(false)}>
              Keep them
            </button>
            <button className="btn primary" onClick={() => void tidy()}>
              Tidy up
            </button>
          </>
        }
      >
        <p>
          A book NPC printed the same in several books stays once, from the earliest book; printed differently, each version is numbered in the order the books
          came out.
        </p>
        {plan.trash.length > 0 && (
          <>
            <p>To the NPC trash (the same as a copy that stays):</p>
            <ul aria-label="To the NPC trash">
              {plan.trash.map(({ ch }) => (
                <li key={ch.id}>
                  {nameOf(ch)} ({fromOf(ch)})
                </li>
              ))}
            </ul>
          </>
        )}
        {plan.rename.length > 0 && (
          <>
            <p>Renamed:</p>
            <ul aria-label="Renamed">
              {plan.rename.map(({ s, name }) => (
                <li key={s.ch.id}>
                  {nameOf(s.ch)} ({fromOf(s.ch)}) → {name}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="muted">Only copies unchanged since they were loaded: NPCs you made or changed stay as they are. The NPC trash can restore them.</p>
      </Modal>

      <ExportRunnersDialog
        runners={(list ?? []).map(s => s.ch)}
        campaigns={campaigns}
        open={foundry}
        onClose={() => setFoundry(false)}
        noun="NPC"
        download={chs => downloadSr6Runners(c, data, cr, chs)}
        about={SR6_FOUNDRY_ABOUT}
      />
    </main>
  )
}

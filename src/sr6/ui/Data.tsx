// SR6 Game data (everyone), in the layout both games share (src/ui/GameData.tsx): the catalog browser by kind with the book
// a filter (CatalogBrowser), the sources, the Foundry export, the catalog edits (editors:
// each entry's Edit button opens Sr6EditEntry; a compendium entry's is a link to it in its compendium, for its owner only), a pointer to the creation rules (on Table setup) and the files that didn't load. Kept apart from Anarchy's page, which is
// bound to its own catalog type.
import { useMemo, useState } from 'react'
import { canEdit, isAdmin, useMe } from '../../ui/auth'
import { NonCanon } from '../../ui/bits'
import { GameDataPage } from '../../ui/GameData'
import { useRepo } from '../../ui/repoContext'
import type { Sr6Data as Sr6DataView } from '../engine/data'
import { catalogFind, resolveEntry, SR6_NS, sr6EntryXml } from '../engine/load'
import { entryKey } from '../engine/names'
import { OverrideFiles } from '../../ui/OverrideFiles'
import { SR6_KINDS, type Sr6Catalog, type Sr6Entry, type Sr6Kind, type Sr6SampleFix } from '../model/types'
import { Sr6EditEntry } from './EditEntry'
import { Sr6ExportBooksPanel } from './Foundry'
import { groupOf as pickerGroup } from './Picker'
import { entryLabel } from '../engine/categories'
import { sr6Row } from './EntryRef'

const KINDS = Object.keys(SR6_KINDS) as Sr6Kind[]
// (samplefix: a book sample runner's printed line corrected, engine/samplefix.ts: the override file carries them too)
const TAGS = { ...Object.fromEntries(KINDS.map(k => [SR6_KINDS[k].tag, k])), samplefix: 'samplefixes' }
const attrX = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
/** A sample fix as the edits layer writes it (for Import edits' comparison). */
const fixXml = (f: Sr6SampleFix) =>
  `<samplefix id="${attrX(f.id)}" source="${attrX(f.source)}" page="${f.page}"><name>${attrX(f.name)}</name>${f.corrects
    .map(k => `<correct item="${attrX(k.item)}" field="${k.field}" from="${attrX(k.from)}" to="${attrX(k.to)}"${k.note ? ` note="${attrX(k.note)}"` : ''}/>`)
    .join('')}</samplefix>`
/** an entry's sub-category inside its kind: its category (weapons by type, spells, gear by book section…), else these */
const GROUP: Partial<Record<Sr6Kind, (e: Sr6Entry) => string | undefined>> = {
  augmentations: pickerGroup, // cyberware, bioware, geneware…, then body area or table
  qualities: e => e.attrs.kind,
  programs: e => e.attrs.type,
  martialarts: e => e.attrs.categories,
  critterpowers: e => (e.attrs.weakness ? 'weakness' : e.attrs.type),
  lifemodules: e => e.attrs.stage,
  rules: e => e.attrs.chapter,
  priorities: () => undefined,
  attributes: e => e.attrs.group,
  skills: e => e.attrs.attr?.toUpperCase(),
}
const groupOf = (e: Sr6Entry) => (GROUP[e.kind] ? GROUP[e.kind]!(e) : e.attrs.category) || undefined

export function Sr6Data({ c, data, reload }: { c: Sr6Catalog; data: Sr6DataView; reload: () => Promise<void> }) {
  const me = useMe(),
    server = useRepo().mode === 'server'
  const editor = canEdit(me) && server
  const all = KINDS.flatMap(k => [...c.entries[k].values()])
  const [editing, setEditing] = useState<{ kind: Sr6Kind; id: string } | null>(null)
  const [msg, setMsg] = useState('')
  const counts = useMemo(() => {
    const n = new Map<string, number>()
    for (const e of all) n.set(e.source, (n.get(e.source) ?? 0) + 1)
    return n
  }, [c]) // eslint-disable-line react-hooks/exhaustive-deps
  const perSource = (id: string) => counts.get(id) ?? 0
  const edits = all.filter(e => e.edited)
  const compOf = (e: Sr6Entry) => c.sources.get(e.source)?.compendium
  // a compendium's entry is edited in its compendium (the edits layer loads before it, so an edit would never show)
  const editButton = (e: Sr6Entry) =>
    editor &&
    (compOf(e) ? (
      compOf(e)!.owner === me?.username && (
        <a className="btn small quiet" aria-label={`Edit ${entryLabel(e)}`} href={`#/sr6/compendiums/${compOf(e)!.id}/${encodeURIComponent(e.id)}`}>
          Edit
        </a>
      )
    ) : (
      <button
        type="button"
        className="btn small quiet"
        aria-label={`Edit ${entryLabel(e)}`}
        onClick={() => {
          setMsg('')
          setEditing({ kind: e.kind, id: e.id })
        }}
      >
        Edit
      </button>
    ))

  // (thousands of rows: worked out once per catalog, not on every message or edit drawer)
  const kinds = useMemo(() => {
    const find = catalogFind(c)
    return KINDS.map(k => ({
      id: k,
      label: SR6_KINDS[k].label,
      rows: [...c.entries[k].values()].map(e => ({
        ...sr6Row(c, e, find),
        group: groupOf(e),
        action: editButton(e),
      })),
    }))
  }, [c, editor, me?.username]) // eslint-disable-line react-hooks/exhaustive-deps
  const books = [...c.sources.values()].filter(s => perSource(s.id)).map(s => ({ id: s.id, name: s.compendium ? `${s.name} (House)` : s.name }))

  return (
    <GameDataPage
      game="sr6"
      kinds={kinds}
      books={books}
      banner={
        <>
          {all.length === 0 && (
            <p className="banner">
              No SR6 data yet.{' '}
              {isAdmin(me) ? (
                <>
                  Upload the core rulebook on the <a href="#/sr6/books">Books page</a>.
                </>
              ) : (
                'The admin hasn’t imported the core rulebook yet.'
              )}
            </p>
          )}
          <div role="status" aria-live="polite">
            {msg && <p className="banner">{msg}</p>}
          </div>
        </>
      }
      sourcesIntro={
        <p className="muted">
          The Shadowrun 6 catalog, kept apart from Anarchy’s. Books add to it; descriptions are private, one file per source in
          <code> custom/sr6/texts/</code>, never part of the app itself.
        </p>
      }
      sources={[...c.sources.values()].map(s => ({
        id: s.id,
        name: s.name,
        publisher: s.publisher,
        entries: perSource(s.id),
        file: s.file,
        status: s.compendium ? `House · ${s.publisher}` : s.canon ? 'Canon' : <NonCanon />,
        sha256: s.sha256,
        hash: s.sha256 && `${s.sha256.slice(0, 12)}…`,
        texts: s.compendium ? (
          'its own'
        ) : !s.texts ? (
          <span className="muted">none</span>
        ) : c.files.some(f => f.file === `custom/sr6/${s.texts}`) ? (
          'installed'
        ) : (
          <span className="muted">not installed</span>
        ),
      }))}
      foundry={canEdit(me) && <Sr6ExportBooksPanel c={c} data={data} />}
      edits={
        editor
          ? {
              rows: edits.map(e => ({
                key: entryKey(e.kind, e.id),
                name: entryLabel(e),
                kind: SR6_KINDS[e.kind].label,
                action: editButton(e),
                state: c.original.has(entryKey(e.kind, e.id)) ? 'changed' : 'orphan',
                source: (
                  <span className="src">
                    {e.source} p.{e.page}
                  </span>
                ),
              })),
              intro: (
                <>
                  <p>
                    Fix a book entry with its Edit button. Edits are kept apart from the imported book, so a re-import never touches them; Restore book version
                    drops one.
                  </p>
                  <OverrideFiles
                    reload={reload}
                    g={{
                      dir: 'custom/sr6/edits/',
                      api: 'sr6/edits',
                      ns: SR6_NS,
                      prefix: 'sr6',
                      file: 'sr6-edits',
                      books: books.filter(b => !c.sources.get(b.id)?.compendium),
                      tags: TAGS,
                      descTag: () => 'text',
                      strip: ['issue'],
                      current: (kind, id) => {
                        if (kind === 'samplefixes') {
                          const f = c.sampleFixes?.get(id)
                          return f && { xml: fixXml(f), edited: true, text: f.text }
                        }
                        const e = resolveEntry(c, kind as Sr6Kind, id)
                        return e && { xml: sr6EntryXml(e), edited: !!e.edited, text: e.text }
                      },
                    }}
                  />
                </>
              ),
            }
          : undefined
      }
      errors={c.errors}
      docs={
        <>
          The file format and schemas are documented in <code>docs/sr6-data-format.md</code> and <code>data/sr6/schema/</code>.
        </>
      }
    >
      <h2 style={{ marginTop: '1.5rem' }}>Creation rules</h2>
      <p>
        The creation settings (starting karma, caps, prices…) are on the Table setup page: <a href="#/sr6/table">open the creation settings</a>. A campaign with
        its own shows them on its page.
      </p>
      <Sr6EditEntry
        c={c}
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={async text => {
          await reload()
          setEditing(null)
          setMsg(text)
        }}
      />
    </GameDataPage>
  )
}

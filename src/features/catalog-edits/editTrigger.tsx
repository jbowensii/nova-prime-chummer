// The catalog-edit trigger both games share (spec §2): the context a page reads to open the edit form, and the Edit button,
// "Edited" mark and edit-state label built on it. The dialog itself (CatalogEdits) stays with Anarchy (EditEntry.tsx).
import { createContext, useContext } from 'react'
import type { AmpTemplate, Catalog, Item, Rule } from '../../ca2/formats/domain/types'
import { useMe } from '../../core/ui-kit/auth'

export type EditKind = 'amps' | 'items' | 'rules'
export type Target = { kind: EditKind; id?: string } // no id: add an entry

export const OpenEdit = createContext<((t: Target) => void) | null>(null)
export const EditCatalog = createContext<Catalog | null>(null)
/** Opens the edit form; null when there's no server to save to (browser storage). */
export const useOpenEdit = () => useContext(OpenEdit)

/** How an entry stands in the edits layer. An edit whose book is gone has no original and no house-rule source. */
export function editState(c: Catalog, kind: EditKind, e: AmpTemplate | Item | Rule): 'book' | 'changed' | 'added' | 'orphan' {
  if (!e.edited) return 'book'
  if (c.original[kind].has(e.id)) return 'changed'
  return c.sources.get(e.source)?.origin === 'user' ? 'added' : 'orphan'
}

export const EditedMark = () => (
  <span className="edited" title="Changed in this app (Game data lists your edits)">
    Edited
  </span>
)

/** A compendium's entry is edited in its compendium (its owner only), never in the edits layer. */
export function EditButton({ kind, id, name }: { kind: EditKind; id: string; name: string }) {
  const open = useOpenEdit(),
    c = useContext(EditCatalog),
    me = useMe()
  const comp = c?.sources.get(c[kind].get(id)?.source ?? '')?.compendium
  if (comp)
    return (
      open &&
      comp.owner === me?.username && (
        <a className="btn small quiet" aria-label={`Edit ${name}`} href={`#/compendiums/${comp.id}/${encodeURIComponent(id)}`}>
          Edit
        </a>
      )
    )
  return (
    open && (
      <button type="button" className="btn small quiet" aria-label={`Edit ${name}`} onClick={() => open({ kind, id })}>
        Edit
      </button>
    )
  )
}

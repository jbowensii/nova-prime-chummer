// Where an entry comes from (spec §4). Rendering, in order:
//   1. the source label "DHSA p.6", always; hover shows "full title — publisher — file …";
//   2. the Non-canon badge when the entry isn't canon (a GM compendium's: House and its name);
//   3. a book tag (its source id, full title on hover) only when dupeLabel says 'book', i.e. a duplicate
//      with the same canon status. A 'badge' duplicate needs nothing more: step 2 already tells it apart.
//   4. "Edited" when the catalog entry comes from the edits layer (EditEntry.tsx).
// Entries built in the Amp Builder or as custom items have no book: "Built by you".
import type { Catalog } from '../model/types'
import { dupeLabel, isCanonSource } from '../engine'
import { HouseChip, NonCanon } from './bits'
import { EditedMark } from './EditEntry'

type Props = { c: Catalog; source: string; page: number; id?: string } | { builtByYou: true }

export function SourceLabel(p: Props) {
  if ('builtByYou' in p) return <span className="src">Built by you</span>
  const { c, source, page, id } = p
  const s = c.sources.get(source)
  const title = s ? [s.name, s.publisher, s.file && `file ${s.file}`].filter(Boolean).join(' — ') : source
  const dupe = id ? dupeLabel(c, id) : null
  const edited = !!id && [c.amps, c.items, c.rules].some(m => m.get(id)?.edited)
  return (
    <span className="srcline">
      <span className="src" title={title}>{source} p.{page}</span>
      {s?.compendium ? <HouseChip name={s.name} /> : !isCanonSource(c, source) && <NonCanon source={source} />}
      {dupe?.kind === 'book' && <span className="booktag" title={dupe.title}>{dupe.text}</span>}
      {edited && <EditedMark />}
    </span>
  )
}

// Players' runners and GM compendiums (phase 3), SR6: a runner sees the compendiums shared with its own campaign and the
// table's (forSr6Campaign; a player's catalog holds every campaign they play in), keeps a copy of every compendium entry it
// uses in `house` (keepSr6House, on each change), and once a compendium is unshared or deleted those copies stand in for
// the gone entries (withSr6House), noted on Review (houseNotes). Book entries are never copied.
import type { Violation } from '../../../../core/shared/types'
import type { Sr6Character, Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { currentBuild } from './career'

const key = (kind: Sr6Kind, id: string) => `${kind}:${id}`

/** The catalog a runner in `campaign` sees: entries of compendiums shared with another campaign left out. The same
 *  catalog when there are none. */
export function forSr6Campaign(c: Sr6Catalog, campaign: string | undefined): Sr6Catalog {
  const other = new Set([...c.sources.values()].filter(s => s.compendium?.campaign && s.compendium.campaign !== campaign).map(s => s.id))
  if (!other.size) return c
  const entries = Object.fromEntries(
    Object.entries(c.entries).map(([k, m]) => [
      k,
      [...m.values()].some(e => other.has(e.source)) ? new Map([...m].filter(([, e]) => !other.has(e.source))) : m,
    ]),
  ) as Sr6Catalog['entries']
  return { ...c, entries }
}

/** Every catalog line the runner has (as it stands, its career spends included): qualities, magic picks, martial arts,
 *  purchases and their accessories, its SINs' lifestyles. */
function lines(ch: Sr6Character): [Sr6Kind, string][] {
  const b = currentBuild(ch),
    out: [Sr6Kind, string][] = []
  const buy = (x: Sr6Purchase) => {
    if (x.id) out.push([x.kind, x.id])
    x.accessories.forEach(buy)
  }
  for (const q of b.qualities) out.push(['qualities', q.id])
  for (const p of b.picks) out.push([p.kind, p.id])
  for (const m of b.martialArts) {
    out.push(['martialarts', m.id])
    for (const t of m.techniques) out.push(['martialtechniques', t.id])
  }
  b.purchases.forEach(buy)
  for (const s of b.sins) for (const l of s.lifestyles ?? []) out.push(['lifestyles', l.id])
  return out
}

const isHouse = (c: Sr6Catalog, e: Sr6Entry) => !!c.sources.get(e.source)?.compendium

/** The runner with `house` holding the compendium entries it uses: the live entry while the catalog has it, else the copy
 *  it had. The same runner when nothing changed. */
export function keepSr6House(c: Sr6Catalog, ch: Sr6Character): Sr6Character {
  const had = new Map((ch.house ?? []).map(e => [key(e.kind, e.id), e])),
    out = new Map<string, Sr6Entry>()
  for (const [kind, id] of lines(ch)) {
    const live = c.entries[kind]?.get(id),
      e = live ? (isHouse(c, live) ? live : undefined) : had.get(key(kind, id))
    if (e) out.set(key(kind, id), e)
  }
  const house = [...out.values()]
  if (house.length === (ch.house?.length ?? 0) && house.every((e, i) => e === ch.house![i])) return ch
  const { house: _, ...rest } = ch
  return house.length ? { ...rest, house } : rest
}

/** The catalog with a runner's copies (its house) standing in for the compendium entries it no longer has, and those copies. */
export function withSr6House(c: Sr6Catalog, house: Sr6Entry[] | undefined): { c: Sr6Catalog; gone: Sr6Entry[] } {
  const gone = (house ?? []).filter(e => !c.entries[e.kind]?.has(e.id))
  if (!gone.length) return { c, gone }
  const entries = { ...c.entries }
  for (const e of gone) {
    if (entries[e.kind] === c.entries[e.kind]) entries[e.kind] = new Map(c.entries[e.kind])
    entries[e.kind].set(e.id, e)
  }
  return { c: { ...c, entries }, gone }
}

/** Review's note for each copy standing in for a gone entry. */
export const houseNotes = (c: Sr6Catalog, gone: Sr6Entry[]): Violation[] =>
  gone.map(e => ({
    code: 'catalog.gone',
    severity: 'warning',
    path: 'review',
    message: `${e.name}: its source ${c.sources.get(e.source)?.name ?? e.source} is no longer available; the runner keeps its own copy.`,
  }))

// A saved runner's old catalog ids turned into the new ones (owner decision D2). When a re-import renames, moves or
// re-kinds an entry, its new entry carries <alias id kind> with the old id (importer/sr6/moved.py; the loader's
// Sr6Catalog.moved). On load (the editor's prepare) every line naming an id the catalog no longer has, and an alias
// moves, is pointed at the new entry, when its kind still fits the line (a purchase stays a purchase kind, a pick a pick
// kind); each change is recorded in `migrated`, once: the saved runner then holds the new ids. A line naming a rated or
// leveled entry the catalog now holds as one entry per level (levels.ts) becomes that level's entry: a purchase at its
// rating, a quality or pick at its level (the line's own rating or level then goes: the entry carries it); a rating or
// level the family doesn't have leaves the line as it is, so Review still flags it. A career level-up saved before levels
// were entries (no target: a pick one level up, a quality its line's levels up) becomes the level it reached, raising
// the line it raised (career.ts applyAdvance), worked out by replaying the ledger over the build as it stood.
import {
  PICK_KINDS,
  PURCHASE_KINDS,
  type PickKind,
  type PurchaseKind,
  type Sr6Advance,
  type Sr6Character,
  type Sr6Lifestyle,
  type Sr6MartialArt,
  type Sr6Pick,
  type Sr6Purchase,
  type Sr6Quality,
} from '../model/character'
import type { Sr6Catalog, Sr6Kind } from '../model/types'
import { entryKey } from './names'
import { applyAdvance, voidedIds } from './career'
import { atLevel, familyOf } from './levels'

export function migrateSr6Ids(ch: Sr6Character, c: Pick<Sr6Catalog, 'entries' | 'moved' | 'levels'>, at = new Date().toISOString()): Sr6Character {
  const done: NonNullable<Sr6Character['migrated']> = []
  /** where (kind, id) is now, when it's gone and an alias names it in one of `fits` */
  const isParent = (kind: Sr6Kind, id: string) => !!c.levels?.get(entryKey(kind, id))?.parent
  /** where (kind, id) is now, when it's gone and an alias names it in one of `fits` (an entry, or a family's parent) */
  const to = <K extends Sr6Kind>(kind: K, id: string | undefined, fits: readonly K[]) => {
    if (!id || c.entries[kind]?.has(id)) return undefined
    const m = c.moved.get(entryKey(kind, id))
    if (!m || !(fits as readonly Sr6Kind[]).includes(m.kind) || !(c.entries[m.kind].has(m.id) || isParent(m.kind, m.id))) return undefined
    if (!isParent(m.kind, m.id)) done.push({ from: entryKey(kind, id), to: entryKey(m.kind, m.id), at })
    return m as { kind: K; id: string }
  }
  /** the level's entry of a family's parent (an id now expanded into levels; `from`: the id the line names), at
   *  `level` (none: its lowest); undefined for a level the family doesn't have */
  const level = (kind: Sr6Kind, id: string | undefined, lv: number | undefined, from = id) => {
    const f = id && !c.entries[kind]?.has(id) ? familyOf(c, kind, id) : undefined
    if (!f?.parent) return undefined
    const e = atLevel(c, kind, id, lv ?? Math.min(...f.levels.keys()))
    if (e) done.push({ from: entryKey(kind, from!), to: entryKey(kind, e.id), at })
    return e
  }
  const purchase = (p: Sr6Purchase): Sr6Purchase => {
    const m = to<PurchaseKind>(p.kind, p.id, PURCHASE_KINDS),
      acc = p.accessories.map(purchase)
    const l = level(m?.kind ?? p.kind, m?.id ?? p.id, p.rating, p.id)
    if (l) {
      const { rating: _, ...rest } = p
      return { ...rest, kind: m?.kind ?? p.kind, id: l.id, accessories: acc }
    }
    return m || acc.some((a, i) => a !== p.accessories[i]) ? { ...p, ...m, accessories: acc } : p
  }
  const pick = <T extends Sr6Pick | undefined>(p: T): T => {
    const m = p && to<PickKind>(p.kind, p.id, PICK_KINDS)
    const l = p && level(m?.kind ?? p.kind, m?.id ?? p.id, p.level, p.id)
    if (!l) return m ? { ...p, ...m } : p
    const { level: _, ...rest } = p!
    return { ...rest, kind: m?.kind ?? p!.kind, id: l.id } as T
  }
  const quality = <T extends Sr6Quality | undefined>(q: T): T => {
    const m = q && to('qualities', q.id, ['qualities'])
    const l = q && level('qualities', m?.id ?? q.id, q.level, q.id)
    return l ? { ...q, id: l.id, level: 1 } : m ? { ...q, id: m.id } : q
  }
  const technique = <T extends { id: string }>(t: T): T => {
    const m = to('martialtechniques', t.id, ['martialtechniques'])
    return m ? { ...t, id: m.id } : t
  }
  const martial = (x: Sr6MartialArt): Sr6MartialArt => {
    const m = to('martialarts', x.id, ['martialarts'])
    return { ...x, ...(m ? { id: m.id } : {}), techniques: x.techniques.map(technique) }
  }
  const b = ch.build
  const lifestyle = (l: Sr6Lifestyle): Sr6Lifestyle => {
    const m = to('lifestyles', l.id, ['lifestyles'])
    return m ? { ...l, id: m.id } : l
  }
  const meta = to('metatypes', b.metatype, ['metatypes'])
  const sins = b.sins.map(s => (s.lifestyles ? { ...s, lifestyles: s.lifestyles.map(lifestyle) } : s))
  const build = {
    ...b,
    purchases: b.purchases.map(purchase),
    picks: b.picks.map(pick),
    qualities: b.qualities.map(quality),
    martialArts: b.martialArts.map(martial),
    sins,
    ...(meta ? { metatype: meta.id } : {}),
  }
  const lifestyleId = (id: string) => to('lifestyles', id, ['lifestyles'])?.id ?? id
  const state = structuredClone(b),
    voided = voidedIds(ch) // the build as it stood before each ledger line (old ids)
  /** a level-up without a target (from before levels were entries): the level it reached, on the line it raised */
  const relative = (a: Sr6Advance): Sr6Advance | undefined => {
    if ((a.op === 'pick' || a.op === 'initiate') && a.line && !a.target) {
      const had = state.picks.find(x => x.kind === a.line!.kind && x.id === a.line!.id)
      const lv = a.op === 'pick' ? (had?.level !== undefined ? had.level + 1 : undefined) : had && (had.level ?? 1) + 1
      const line = lv !== undefined ? pick({ ...a.line, level: lv }) : undefined
      return line && !('level' in line) ? { ...a, target: had!.uid, line } : undefined // (no level left: a level's entry)
    }
    if (a.op === 'quality' && !a.target) {
      const had = state.qualities.find(q => q.id === a.line.id && !q.free),
        lv = had && had.level + a.line.level
      const line = lv !== undefined ? quality({ ...a.line, level: lv }) : undefined
      return line && line.id !== (to('qualities', a.line.id, ['qualities'])?.id ?? a.line.id) ? { ...a, target: had!.uid, line } : undefined
    }
    return undefined
  }
  const ledger = ch.ledger.map(e => {
    if (e.type !== 'advance') return e
    const a = e.advance
    const advance =
      relative(a) ??
      (a.op === 'purchase' || a.op === 'upgrade'
        ? { ...a, line: purchase(a.line) }
        : a.op === 'drop' && a.line
          ? { ...a, line: purchase(a.line) }
          : a.op === 'pick'
            ? { ...a, line: pick(a.line) }
            : a.op === 'initiate' && a.line
              ? { ...a, line: pick(a.line) }
              : a.op === 'martialart'
                ? { ...a, line: martial(a.line) }
                : a.op === 'technique'
                  ? { ...a, line: technique(a.line) }
                  : a.op === 'quality'
                    ? { ...a, line: quality(a.line) }
                    : a.op === 'buyoff' && a.line
                      ? { ...a, line: quality(a.line) }
                      : a.op === 'lifestyle'
                        ? { ...a, id: lifestyleId(a.id) }
                        : a)
    if (!voided.has(e.id)) applyAdvance(state, a)
    return { ...e, advance }
  })
  return done.length
    ? { ...ch, build, ledger, identity: meta ? { ...ch.identity, metatype: meta.id } : ch.identity, migrated: [...(ch.migrated ?? []), ...done] }
    : ch
}

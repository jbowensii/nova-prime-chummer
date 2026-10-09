// A saved runner's old catalog ids turned into the new ones (owner decision D2). When a re-import renames, moves or
// re-kinds an entry, its new entry carries <alias id kind> with the old id (importer/sr6/moved.py; the loader's
// Sr6Catalog.moved). On load (the editor's prepare) every line naming an id the catalog no longer has, and an alias
// moves, is pointed at the new entry, when its kind still fits the line (a purchase stays a purchase kind, a pick a pick
// kind); each change is recorded in `migrated`, once: the saved runner then holds the new ids.
import { PICK_KINDS, PURCHASE_KINDS, type PickKind, type PurchaseKind, type Sr6Character, type Sr6Lifestyle, type Sr6MartialArt, type Sr6Pick, type Sr6Purchase, type Sr6Quality } from '../model/character'
import type { Sr6Catalog, Sr6Kind } from '../model/types'
import { entryKey } from './load'

export function migrateSr6Ids(ch: Sr6Character, c: Pick<Sr6Catalog, 'entries' | 'moved'>, at = new Date().toISOString()): Sr6Character {
  const done: NonNullable<Sr6Character['migrated']> = []
  /** where (kind, id) is now, when it's gone and an alias names it in one of `fits` */
  const to = <K extends Sr6Kind>(kind: K, id: string | undefined, fits: readonly K[]) => {
    if (!id || c.entries[kind]?.has(id)) return undefined
    const m = c.moved.get(entryKey(kind, id))
    if (!m || !(fits as readonly Sr6Kind[]).includes(m.kind) || !c.entries[m.kind].has(m.id)) return undefined
    done.push({ from: entryKey(kind, id), to: entryKey(m.kind, m.id), at })
    return m as { kind: K; id: string }
  }
  const purchase = (p: Sr6Purchase): Sr6Purchase => {
    const m = to<PurchaseKind>(p.kind, p.id, PURCHASE_KINDS), acc = p.accessories.map(purchase)
    return m || acc.some((a, i) => a !== p.accessories[i]) ? { ...p, ...m, accessories: acc } : p
  }
  const pick = <T extends Sr6Pick | undefined>(p: T): T => { const m = p && to<PickKind>(p.kind, p.id, PICK_KINDS); return m ? { ...p, ...m } : p }
  const quality = <T extends Sr6Quality | undefined>(q: T): T => { const m = q && to('qualities', q.id, ['qualities']); return m ? { ...q, id: m.id } : q }
  const technique = <T extends { id: string }>(t: T): T => { const m = to('martialtechniques', t.id, ['martialtechniques']); return m ? { ...t, id: m.id } : t }
  const martial = (x: Sr6MartialArt): Sr6MartialArt => { const m = to('martialarts', x.id, ['martialarts']); return { ...x, ...m ? { id: m.id } : {}, techniques: x.techniques.map(technique) } }
  const b = ch.build
  const lifestyle = (l: Sr6Lifestyle): Sr6Lifestyle => { const m = to('lifestyles', l.id, ['lifestyles']); return m ? { ...l, id: m.id } : l }
  const meta = to('metatypes', b.metatype, ['metatypes'])
  const sins = b.sins.map(s => (s.lifestyles ? { ...s, lifestyles: s.lifestyles.map(lifestyle) } : s))
  const build = { ...b, purchases: b.purchases.map(purchase), picks: b.picks.map(pick), qualities: b.qualities.map(quality),
    martialArts: b.martialArts.map(martial), sins, ...meta ? { metatype: meta.id } : {} }
  const ledger = ch.ledger.map(e => {
    if (e.type !== 'advance') return e
    const a = e.advance
    const advance = a.op === 'purchase' ? { ...a, line: purchase(a.line) } : a.op === 'drop' && a.line ? { ...a, line: purchase(a.line) }
      : a.op === 'pick' ? { ...a, line: pick(a.line) } : a.op === 'initiate' && a.line ? { ...a, line: pick(a.line) }
        : a.op === 'martialart' ? { ...a, line: martial(a.line) } : a.op === 'technique' ? { ...a, line: technique(a.line) }
        : a.op === 'quality' ? { ...a, line: quality(a.line) } : a.op === 'buyoff' && a.line ? { ...a, line: quality(a.line) } : a
    return { ...e, advance }
  })
  return done.length ? { ...ch, build, ledger, identity: meta ? { ...ch.identity, metatype: meta.id } : ch.identity,
    migrated: [...ch.migrated ?? [], ...done] } : ch
}

// One catalog item per level (owner decision 2026-10-11): an entry the book prints with a rating range (`rating="1–4"`)
// or taken by level up to a printed maximum (`perLevel="true" maxLevel="3"`) becomes one entry per level, `<Name> N`,
// id `<parent id>.<N>`, with the level's own values (`rating="N"`, so the printed `Rating × 500` prices at it; a
// quality's or power's Karma, power points and per-level effects worked out). Rows the book already prints one per
// level (`Cyberjack (Rating 2)`, `Wired Reflexes 3`) are grouped as a family without duplication. The parent leaves
// the entry lists (pickers and Game data list the levels) but stays reachable by id in Sr6Catalog.levels: formula
// ref()s and a saved runner's lines naming it still read, and migrate.ts turns those lines into the level's id. The
// expansion runs once at the end of buildSr6Catalog, after the edits layer, so an edit on the parent reaches every
// level; an edit keyed by a child id is kept as that level. docs/sr6-data-format.md, "Levels".
import type { Sr6Catalog, Sr6Entry, Sr6Kind, Sr6Part } from '../model/types'
import { effectValue } from './effects'
import { entryKey } from './names'
import { rated, ratingRange } from './values'

/** A family of levels: the parent (absent for rows the book prints apart) and each level's entry id. */
export interface Sr6Family { kind: Sr6Kind; family: string; parent?: Sr6Entry; levels: Map<number, string> }
type Levels = Pick<Sr6Catalog, 'entries' | 'levels'>

const round2 = (x: number) => Math.round(x * 100) / 100
/** a trailing printed range in a name: `Will to Live (1-3)`, `Blind (rating 1–3)` */
const RANGE = /\s*\((?:(?:rating|level|force)\s+)?(\d+)\s*[-–]\s*(\d+)\)\s*$/i
/** a name the book prints with its level: `Cyberjack (Rating 2)`, `Telescoping (Level 1)`, `Wired Reflexes 3` */
const PRINTED = /^(.+?)\s*(?:\((?:rating|level)\s+(\d{1,2})\)|\s(\d{1,2}))$/i
/** the fields a level multiplies: a quality's Karma (a range's both ends), a power's power points */
const SCALED = ['karma', 'karmaMax', 'cost']
const usesR = (e: Sr6Entry) => e.parts.some(p => p.tag === 'effect' && effectValue(p.attrs.value)?.perRating)
  || (e.formulas ?? []).some(f => /\bR\b/.test(f.expr))
const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** How an entry expands: by rating, by level, or not at all. */
function mode(e: Sr6Entry): { mode: 'rating' | 'level'; levels: number[] } | undefined {
  const range = ratingRange(e.attrs.rating)
  if (range.length > 1) return { mode: 'rating', levels: range }
  if (e.attrs.perLevel !== 'true') return undefined
  const max = Number(e.attrs.maxLevel)
  if (Number.isInteger(max) && max >= 2) return { mode: 'level', levels: Array.from({ length: max }, (_, i) => i + 1) }
  // (the range printed in the name, `Will to Live (1-3)`)
  const m = RANGE.exec(e.name), lo = m ? Number(m[1]) : NaN, hi = m ? Number(m[2]) : NaN
  if (m && lo >= 1 && hi > lo) return { mode: 'level', levels: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) }
  return undefined
}

/** A per-level effect value at level n: `R` → n, `R*2` → 2n; another value as it is. */
const scaled = (p: Sr6Part, n: number): Sr6Part => {
  const v = p.tag === 'effect' ? effectValue(p.attrs.value) : undefined
  return v?.perRating ? { ...p, attrs: { ...p.attrs, value: String(round2(v.value * n)) } } : p
}

/** The level-n child of `e`. */
function child(e: Sr6Entry, how: 'rating' | 'level', n: number): Sr6Entry {
  const attrs: Record<string, string> = { ...e.attrs, family: e.id, level: String(n) }
  if (how === 'rating') attrs.rating = String(n)
  else {
    delete attrs.perLevel; delete attrs.maxLevel
    for (const k of SCALED) { const v = rated(attrs[k]); if (attrs[k] !== undefined && v.ok && v.n !== null) attrs[k] = String(round2(v.n * n)) }
  }
  const parts = how === 'level' ? e.parts.map(p => scaled(p, n)) : e.parts.map(p => ({ ...p, attrs: { ...p.attrs } }))
  return { ...e, id: `${e.id}.${n}`, name: `${e.name.replace(RANGE, '')} ${n}`, attrs, parts,
    ...(e.formulas ? { formulas: e.formulas.map(f => ({ ...f })) } : {}), ...(e.issues ? { issues: e.issues.map(i => ({ ...i })) } : {}),
    aliases: [...new Set([...e.aliases ?? [], e.name])] }
}

/** Expand every rated or leveled entry into its levels, in place, and group the rows the book prints per level. */
export function expandLevels(c: Sr6Catalog): void {
  c.levels ??= new Map()
  for (const kind of Object.keys(c.entries) as Sr6Kind[]) {
    const map = c.entries[kind]
    for (const e of [...map.values()]) {
      const m = mode(e)
      if (!m) continue
      const fam: Sr6Family = { kind, family: e.id, parent: e, levels: new Map() }
      for (const n of m.levels) {
        const kid = child(e, m.mode, n), had = map.get(kid.id)
        // (an edit keyed by this level's id is that level; it takes the parent's text when it has none)
        map.set(kid.id, had ? { ...had, attrs: { family: e.id, level: String(n), ...had.attrs }, text: had.text || e.text } : kid)
        fam.levels.set(n, kid.id)
        const book = c.original.get(entryKey(kind, e.id))
        if (book) c.original.set(entryKey(kind, kid.id), child(book, m.mode, n))
      }
      map.delete(e.id)
      c.levels.set(entryKey(kind, e.id), fam)
    }
    // rows printed one per level: the same base name and source, levels 1..n (a bare number only where the row's
    // effects or formulas use the rating, so a model number, `Ares Predator VI`, is no level)
    const groups = new Map<string, { e: Sr6Entry; n: number; bare: boolean }[]>()
    for (const e of map.values()) {
      if (e.attrs.family) continue
      const m = PRINTED.exec(e.name)
      if (!m) continue
      const key = `${e.source}|${m[1].toLowerCase()}`
      groups.set(key, [...groups.get(key) ?? [], { e, n: Number(m[2] ?? m[3]), bare: m[2] === undefined }])
    }
    for (const rows of groups.values()) {
      const ns = rows.map(r => r.n).sort((a, b) => a - b)
      if (rows.length < 2 || new Set(ns).size !== rows.length) continue
      if (rows.some(r => r.bare) && (ns.some((n, i) => n !== i + 1) || !rows.every(r => usesR(r.e)))) continue
      const base = PRINTED.exec(rows[0].e.name)![1], family = `${rows[0].e.source.toLowerCase()}.${slug(base)}`
      const fam: Sr6Family = { kind, family, levels: new Map() }
      for (const { e, n } of rows) {
        e.attrs.family = family; e.attrs.level = String(n)
        // (a row's `R` is its own level: Wired Reflexes 3 adds 3)
        if (e.attrs.rating === undefined && usesR(e)) e.attrs.rating = String(n)
        fam.levels.set(n, e.id)
      }
      c.levels.set(entryKey(kind, family), fam)
    }
  }
}

/** The family an entry belongs to (a level, a printed row, or the hidden parent itself by id), else undefined. */
export function familyOf(c: Levels, kind: Sr6Kind, id: string | undefined): Sr6Family | undefined {
  if (!id) return undefined
  const f = c.entries[kind]?.get(id)?.attrs.family ?? id
  return c.levels?.get(entryKey(kind, f))
}
/** An entry's level in its family (its `level`), else undefined. */
export function levelOf(e: Sr6Entry | undefined): number | undefined { const n = Number(e?.attrs.level); return n >= 1 ? n : undefined }
/** The entry at `level` of the family `id` belongs to (a parent id, a level's id or a printed row's): undefined when
 *  there is no such level. */
export function atLevel(c: Levels, kind: Sr6Kind, id: string | undefined, level: number): Sr6Entry | undefined {
  const cid = familyOf(c, kind, id)?.levels.get(level)
  return cid ? c.entries[kind].get(cid) : undefined
}
/** The levels of an entry's family, lowest first ([] for an entry without one). */
export function siblings(c: Levels, kind: Sr6Kind, id: string | undefined): Sr6Entry[] {
  const f = familyOf(c, kind, id)
  return f ? [...f.levels].sort((a, b) => a[0] - b[0]).flatMap(([, cid]) => c.entries[kind].get(cid) ?? []) : []
}
/** Whether `id` is `target` or a level of the family `target` names (a creation setting's quality id, the parent's). */
export const sameFamily = (c: Levels, kind: Sr6Kind, id: string, target: string | undefined) =>
  !!target && (id === target || (familyOf(c, kind, id)?.family === familyOf(c, kind, target)?.family && familyOf(c, kind, id) !== undefined))

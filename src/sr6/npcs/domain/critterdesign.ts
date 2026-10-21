// A critter the GM designs (owner 2026-10-16, BUILDER Q11): no SR6 book prints rules for designing a critter, so this is a
// stat-block editor with no budget, in the GM-only NPCs & Critters. Its powers and weaknesses are catalog critter powers
// (a weakness: weakness="true"), innate at 0 Karma; its skills catalog skills; its skills, powers and weaknesses lines
// are generated from them. Its Condition Monitor, Defense Rating and Initiative come from the book's formulas
// (critterDerived); a value typed on the Stat block tab stays, the Design tab showing the difference. Past anything
// printed is a warning, never a refusal.
import type { Sr6CritterDesign, Sr6CritterPower, Sr6Npc } from '../../formats/domain/character'
import type { Sr6Entry } from '../../formats/domain/types'
import { num, type CreationRules } from '../../table-setup/domain/creation'
import { firstNumber } from '../../runner-builder/domain/assets/critters'
import type { Sr6Data } from '../../catalog/domain/data'
import { normName } from '../../catalog/domain/names'
import { NPC_STATS } from '../../runner-builder/domain/creation/npc'

/** The attributes the Design tab sets, in stat-block order, with their labels. */
export const CRITTER_ATTRS = NPC_STATS.filter(([k]) => ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg', 'ess', 'mag', 'res'].includes(k))
/** The derived stats: Condition Monitor, Defense Rating, Initiative. */
export const DERIVED = ['cm', 'dr', 'init'] as const
export type Derived = Record<(typeof DERIVED)[number], string | null>
const PARTS = ['skills', 'powers', 'weaknesses'] as const

/** A line split at its commas outside parentheses (`Armor 1, Enhanced Senses (Hearing, Smell)`: two). */
export function splitLine(s: string): string[] {
  const out: string[] = []
  let depth = 0,
    at = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++
    else if (s[i] === ')') depth = Math.max(0, depth - 1)
    else if (s[i] === ',' && !depth) {
      out.push(s.slice(at, i))
      at = i + 1
    }
  }
  return [...out, s.slice(at)].map(x => x.trim()).filter(Boolean)
}
/** One printed piece `Name N (note)`; longer than 200 characters (the regex backtracks on long runs of spaces): a name. */
const piece = (s: string) => {
  const m = s.length <= 200 ? /^(.*?)(?:\s+(\d+))?(?:\s*\((.*)\))?$/.exec(s) : null
  return { name: (m?.[1] || s).trim(), level: m?.[2] != null ? Number(m[2]) : undefined, note: m?.[3]?.trim() || undefined }
}
const def = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
const lineOf = (npc: Sr6Npc, part: string) =>
  npc.lines
    .filter(l => l.part === part)
    .map(l => l.text)
    .join(', ')

/** A catalog critter power by name (none: the name as printed). */
const powerOf = (s: string, data: Pick<Sr6Data, 'named'>): Sr6CritterPower => {
  const p = piece(s),
    e = data.named?.(p.name, 'critterpowers')
  return def({ id: e?.id, name: e?.name ?? p.name, level: p.level, note: p.note })
}
/** The structure of a critter's printed lines: powers and weaknesses matched to the catalog's critter powers, skills to
 *  its skills (`Perception 5 (Smell +2)`: rank 5, specialization Smell), by name; what doesn't match is kept by name.
 *  Initiative dice from its printed initiative (`7 + 1D6`, `6/1`), else 1. */
export function designFromLines(npc: Sr6Npc, data: Pick<Sr6Data, 'named' | 'skills'>): Sr6CritterDesign {
  const skills = new Map(Object.entries(data.skills).map(([id, s]) => [normName(s.name), { id, name: s.name }]))
  const init = npc.stats.init ?? ''
  return {
    powers: splitLine(lineOf(npc, 'powers')).map(s => powerOf(s, data)),
    weaknesses: splitLine(lineOf(npc, 'weaknesses')).map(s => powerOf(s, data)),
    skills: splitLine(lineOf(npc, 'skills')).map(s => {
      const p = piece(s),
        k = skills.get(normName(p.name))
      const spec = p.note?.replace(/\s*\+\d+$/, '')
      return def({ id: k?.id, name: k?.name ?? p.name, rank: p.level ?? 0, spec: spec && !/^\d+$/.test(spec) ? spec : undefined })
    }),
    dice: Number(/(\d+)\s*D6/i.exec(init)?.[1] ?? /\/\s*(\d+)/.exec(init)?.[1] ?? 1),
  }
}

/** `Armor 2`, `Enhanced Senses (Hearing, Smell)`. */
export const powerText = (p: Sr6CritterPower) => `${p.name}${p.level != null ? ` ${p.level}` : ''}${p.note ? ` (${p.note})` : ''}`
/** The skills, powers and weaknesses lines as the stat block prints them; a specialization with its dice (specDice, CRB
 *  Hong Kong p. 92). */
export function critterLines(d: Sr6CritterDesign, cr: CreationRules): Record<(typeof PARTS)[number], string> {
  const spec = num(cr, 'specDice')
  return {
    skills: d.skills.map(s => `${s.name} ${s.rank}${s.spec ? ` (${s.spec}${spec ? ` +${spec}` : ''})` : ''}`).join(', '),
    powers: d.powers.map(powerText).join(', '),
    weaknesses: d.weaknesses.map(powerText).join(', '),
  }
}

/** The Armor a power gives: a power named Armor or Hardened Armor (CRB pp. 221, 224), or one the catalog says works as
 *  one (`<link rel="as">`), at its level. */
export function armorOf(p: Sr6CritterPower, data: Pick<Sr6Data, 'entry'>): number {
  const armor = (name: string) => /^(hardened )?armor$/.test(normName(name))
  const e = p.id ? data.entry('critterpowers', p.id) : undefined
  return armor(p.name) || e?.parts.some(x => x.tag === 'link' && x.attrs.rel === 'as' && armor(x.attrs.name ?? '')) ? (p.level ?? 0) : 0
}

/** Its derived stats as the stat block prints them: Condition Monitor = monitorBase + Body ÷ monitorDivisor rounded up
 *  (CRB Hong Kong p. 38, the table's settings; null while unset), Defense Rating = Body + its Armor powers' levels (CRB
 *  p. 67), Initiative = Reaction + Intuition plus the dice entered (CRB pp. 39, 67). */
export function critterDerived(npc: Sr6Npc, data: Pick<Sr6Data, 'entry'>, cr: CreationRules): Derived {
  const v = (k: string) => firstNumber(npc.stats[k])
  const base = num(cr, 'monitorBase'),
    div = num(cr, 'monitorDivisor')
  const armor = (npc.design?.powers ?? []).reduce((t, p) => t + armorOf(p, data), 0)
  return {
    cm: base === undefined || !div ? null : String(base + Math.ceil(v('bod') / div)),
    dr: String(v('bod') + armor),
    init: `${v('rea') + v('int')} + ${npc.design?.dice ?? 1}D6`,
  }
}

/** Its generated lines in place of the old ones (each keeps its place; an empty one goes). */
function writeLines(npc: Sr6Npc, cr: CreationRules) {
  const text = critterLines(npc.design!, cr)
  for (const part of PARTS) {
    const at = npc.lines.findIndex(l => l.part === part),
      rest = npc.lines.filter(l => l.part !== part)
    if (text[part]) rest.splice(at < 0 ? rest.length : at, 0, { part, text: text[part] })
    npc.lines = rest
  }
}

/** A critter made designable: its lines read into powers, weaknesses and skills (designFromLines) and written back;
 *  a derived stat it lacks filled in. A value it has stays (a book copy's printed one). */
export function designCritter(npc: Sr6Npc, data: Pick<Sr6Data, 'named' | 'skills' | 'entry'>, cr: CreationRules) {
  npc.design = designFromLines(npc, data)
  writeLines(npc, cr)
  const now = critterDerived(npc, data, cr)
  for (const k of DERIVED) if (npc.stats[k] == null && now[k] != null) npc.stats[k] = now[k]
}

/** A change on the Design tab: `fn` changes the critter; its lines are generated again, and each derived stat follows
 *  unless the GM typed another value (it differed from the derived one before the change). */
export function redesign(npc: Sr6Npc, data: Pick<Sr6Data, 'entry'>, cr: CreationRules, fn: (n: Sr6Npc) => void) {
  const before = critterDerived(npc, data, cr)
  fn(npc)
  const after = critterDerived(npc, data, cr)
  for (const k of DERIVED) if (after[k] != null && (npc.stats[k] == null || npc.stats[k] === before[k])) npc.stats[k] = after[k]!
  writeLines(npc, cr)
}

export interface CritterWarning {
  message: string
  source?: string
  page?: number
}
/** Sanity warnings, never a refusal: an attribute above every printed critter's (`printed`: the books' critters), a
 *  power or weakness not in the catalog, one that asks for a choice (`<selection>`: Innate Spell's spell) with no note,
 *  an Armor power with no level, a skill whose attribute the critter hasn't got (Magic for a magical skill), more
 *  initiative dice than the table allows (initiativeDiceMax, CRB Hong Kong p. 39). */
export function critterWarnings(npc: Sr6Npc, data: Pick<Sr6Data, 'entry' | 'skills'>, cr: CreationRules, printed: Sr6Entry[]): CritterWarning[] {
  const out: CritterWarning[] = [],
    d = npc.design
  if (!d) return out
  for (const [k, label] of CRITTER_ATTRS) {
    if (npc.stats[k] == null) continue
    const top = printed.filter(e => e.attrs[k] != null).sort((a, b) => firstNumber(b.attrs[k]) - firstNumber(a.attrs[k]))[0]
    if (top && firstNumber(npc.stats[k]) > firstNumber(top.attrs[k]))
      out.push({
        message: `${label} ${firstNumber(npc.stats[k])} is above every printed critter’s: the highest is ${firstNumber(top.attrs[k])} (${top.name}).`,
        source: top.source,
        page: top.page,
      })
  }
  for (const [what, ps] of [
    ['power', d.powers],
    ['weakness', d.weaknesses],
  ] as const)
    for (const p of ps) {
      const e = p.id ? data.entry('critterpowers', p.id) : undefined
      if (!e) out.push({ message: `The ${what} ${p.name} isn’t in the catalog: it prints as entered.` })
      else if (!p.note && e.parts.some(x => x.tag === 'selection'))
        out.push({ message: `${p.name} asks for a choice: write it in its note.`, source: e.source, page: e.page })
      if (armorOf({ ...p, level: 1 }, data) && p.level == null)
        out.push({ message: `${p.name} has no level: it adds nothing to the Defense Rating.`, ...(e ? { source: e.source, page: e.page } : {}) })
    }
  for (const s of d.skills) {
    const v = s.id ? data.skills[s.id] : undefined,
      e = s.id ? data.entry('skills', s.id) : undefined
    if (v && !(firstNumber(npc.stats[v.attr]) > 0)) {
      const label = NPC_STATS.find(([k]) => k === v.attr)?.[1] ?? v.attr
      out.push({ message: `${s.name} uses ${label}; the critter has none.`, ...(e ? { source: e.source, page: e.page } : {}) })
    }
  }
  const most = cr.get('initiativeDiceMax')
  if (typeof most?.value === 'number' && d.dice > most.value)
    out.push({ message: `${d.dice} initiative dice; the table allows ${most.value}.`, source: most.source, page: most.page })
  return out
}

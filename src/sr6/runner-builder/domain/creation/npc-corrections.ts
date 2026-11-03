// NPC corrections: the notes line for what npcThings changed, and a built attack's skill.
import type { Sr6Entry } from '../../../formats/domain/types'
import { normName } from '../../../catalog/domain/names'
import { groups } from './npc-parse'

import { ATTACK_SKILLS, type Sr6NpcThing } from './npc-types'

/** The corrections npcThings made to a stat block, one line each, for the NPC's notes (owner 2026-10-20: "note the
 *  corrections in the notes section"): a guessed link (`Ares Predator V → Ares Predator VI (fuzzy, 0.82)`), a standard
 *  stand-in (`Smoke grenade → Smoke/thermal smoke (standard item)`), ammunition added, an attack kept that can't be rolled,
 *  and (one line) what has no catalog entry and was built from the stat block. Worked out afresh each time: never stored. */
export function npcCorrections(things: Sr6NpcThing[]): string[] {
  const all = (l: Sr6NpcThing[]): Sr6NpcThing[] => l.flatMap(t => [t, ...all(t.accessories)])
  const out: string[] = [],
    built: string[] = []
  for (const t of all(things)) {
    const was = t.printedName ?? t.name,
      m = t.match
    if (t.unread) out.push(`Kept, not rollable: ${t.printed}`)
    else if (m?.how === 'ammo')
      out.push(
        t.spare
          ? `Added: ${t.name} (spare) for ${t.ammoFor ?? 'its weapon'}`
          : `Added: ${t.name} (${t.accessories[0]?.name ?? 'regular'} ammo) ×${t.qty ?? 1}${t.load && t.qty !== t.load ? ` (${t.qty! / t.load} loads of ${t.load})` : ''} for ${t.ammoFor ?? 'its weapon'}`,
      )
    else if (t.ruled && normName(was) !== normName(t.name)) out.push(`${was} → ${t.name} (owner ruling)`)
    else if (m?.how === 'fuzzy' && normName(was) !== normName(t.name)) out.push(`${was} → ${t.name} (fuzzy, ${m.score.toFixed(2)})`)
    else if (m?.how === 'standard') out.push(`${was} → ${t.name} (standard item)`)
    else if (!m) built.push(was)
  }
  // an armor total the stat block prints over several linked pieces that add up to another (owner 2026-10-22): the error is
  // noted, the printed value kept
  const num = (e?: Sr6Entry) => Number((e?.attrs.defense ?? '').replace('+', ''))
  for (const t of things) {
    // (one body armor, the host; add-ons count when they are a cumulative one (AAS, by the ruling) or a helmet or shield; and only
    // when the printed (+N) ends the whole line, after the add-ons: not a number a piece prints itself)
    const addOn = (a: Sr6NpcThing) =>
      a.entry?.kind === 'armor' &&
      !/\d/.test(a.printed) &&
      num(a.entry) > 0 &&
      (a.ruled || /helmet|shield|hood|mask/i.test(`${a.entry.name} ${a.entry.attrs.category}`))
    const pieces = t.accessories.filter(addOn)
    const last = groups(t.printed).at(-1)
    const total = !!last && last[1] === t.printed.length - 1 && /\b(?:w\/|with)\s/i.test(t.printed.slice(0, last[0]))
    if (
      !total ||
      t.entry?.kind !== 'armor' ||
      t.match?.how === 'standard' ||
      t.values.defense == null ||
      !pieces.length ||
      t.accessories.some(a => /\d/.test(a.printed))
    )
      continue
    const sum = num(t.entry) + pieces.reduce((n, a) => n + num(a.entry), 0)
    if (sum === t.values.defense) continue
    const parts = [t.entry, ...pieces.map(a => a.entry)].map(e => `${e!.name} +${num(e)}`).join(', ')
    out.push(`Book error: ${parts} = +${sum}; the book prints +${t.values.defense}. Printed value kept.`)
  }
  if (built.length) out.push(`Not in the catalog, built from the stat block: ${[...new Set(built)].join(', ')}`)
  return out
}

/** A built attack's skill: the one it prints as its category; none when its category is a weapon class (`Heavy Pistol`:
 *  the class says); with no category, Exotic Weapons when it reaches past close range (an elemental attack), else Close
 *  Combat. */
export function attackSkill(t: Pick<Sr6NpcThing, 'category' | 'values'>): string | undefined {
  if (t.category) return ATTACK_SKILLS.has(t.category.toLowerCase()) ? t.category : undefined
  return (t.values.ar ?? []).slice(1).some(b => b != null) ? 'Exotic Weapons' : 'Close Combat'
}

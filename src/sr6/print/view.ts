// What every SR6 printed sheet (Sheet.tsx: Printer-friendly and Full color; BookSheet.tsx; NeonSheet.tsx; HexSheet.tsx;
// DossierSheet.tsx) reads off the runner: its name, purchase lines by kind, names and ratings, weapons split ranged/melee,
// every skill, languages and knowledge, gear, lifestyle and the karma and nuyen left (career: the ledger's balances).
import { entryOf } from '../engine/budgets'
import { balances } from '../engine/career'
import type { PickKind, PurchaseKind, Sr6Purchase } from '../model/character'
import type { Sr6Data } from '../engine/data'
import type { Sr6Derived, Sr6Pool } from '../engine/derive'
import type { Sr6Ctx } from '../ui/editor'
import { entryLabel } from '../engine/categories'

export const PICKS: [PickKind, string][] = [['spells', 'Spells'], ['rituals', 'Rituals'], ['adeptpowers', 'Adept powers'], ['metamagics', 'Metamagics'],
  ['complexforms', 'Complex forms'], ['echoes', 'Echoes']]
export const band = (v: number | null) => (v === null ? '—' : String(v))
export const AR_BANDS = ['Close', 'Near', 'Medium', 'Far', 'Extreme']
/** every catalog skill by name: the runner's pools, the rest at rank 0 (no pool where it can't be rolled untrained) */
export const allSkills = (d: Sr6Derived, data: Sr6Data): (Omit<Sr6Pool, 'dp'> & { dp?: number })[] => [...d.pools,
  ...Object.values(data.skills).filter(s => !d.pools.some(p => p.skill === s.id)).map(s => ({ skill: s.id, label: s.name, rank: 0, attr: s.attr }))]
  .sort((x, y) => x.label.localeCompare(y.label))

export function runnerView({ ch, data, d, career }: Pick<Sr6Ctx, 'ch' | 'data' | 'd' | 'career'>) {
  const b = ch.build
  const lines = (kind: PurchaseKind) => b.purchases.filter(x => x.kind === kind)
  const nameOf = (x: Sr6Purchase) => { const e = entryOf(x, data); return e ? entryLabel(e) : x.name ?? 'Custom item' }
  const attrsOf = (x: Sr6Purchase) => entryOf(x, data)?.attrs ?? {}
  // a weapon with modes or ammo shoots; the rest (blades, clubs, unarmed extras) are melee
  const ranged = (x: Sr6Purchase) => { const a = attrsOf(x); return !!(a.modes || a.ammo) }
  const { karma, nuyen } = career ? balances(ch) : { karma: d.karmaLeft, nuyen: d.nuyenLeft }
  return {
    name: ch.identity.streetName || ch.identity.name || (ch.npc ? 'Unnamed NPC' : 'Unnamed runner'),
    lines, nameOf, attrsOf,
    /** a host's own values from its accessories (`STR 5, Armor +2`), for its line on the sheet */
    host: (x: Sr6Purchase) => d.hosts.find(h => h.uid === x.uid)?.text,
    rated: (x: Sr6Purchase) => [x.rating && `rating ${x.rating}`, x.grade].filter(Boolean).join(', '),
    bands: (x: Sr6Purchase) => d.attackRatings.weapons.find(a => a.uid === x.uid)?.bands ?? [null, null, null, null, null],
    rangedWeapons: lines('weapons').filter(ranged), meleeWeapons: lines('weapons').filter(x => !ranged(x)),
    know: b.knowledge.filter(x => x.kind === 'knowledge'), langs: b.knowledge.filter(x => x.kind === 'language'),
    gear: [...lines('electronics'), ...lines('programs'), ...lines('gear'), ...lines('ammotypes')],
    lifestyle: b.lifestyle && data.entry('lifestyles', b.lifestyle.id),
    karma, nuyen,
  }
}

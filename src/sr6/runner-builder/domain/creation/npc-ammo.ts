// NPC ammunition: a weapon's regular ammunition and its printed loads.
import type { Sr6Catalog, Sr6Entry } from '../../../formats/domain/types'
import { normName } from '../../../catalog/domain/names'

import { type Sr6NpcThing } from './npc-types'
import { indexOf } from './npc-index'
import { prefer } from './npc-match'

/** A ranged weapon's regular ammunition (owner 2026-10-20: "add regular ammo for weapons"): its class or printed category
 *  -> the catalog's ammunition class and the name of its regular kind there. Melee and natural attacks match none. */
const AMMO: [RegExp, string, RegExp][] = [
  [/\bdart\b/, 'AMMUNITION/AMMUNITION_SPECIAL', /dart/i],
  [/holdout|pistols? light|light pistol|machine pistol|\bmp\b/, 'AMMUNITION/AMMUNITION', /light pistol/i],
  [/pistols? heavy|heavy pistol|submachine|\bsmg\b/, 'AMMUNITION/AMMUNITION', /heavy pistol/i],
  [/shotgun/, 'AMMUNITION/AMMUNITION', /^shotgun/i],
  [/rifle|sniper/, 'AMMUNITION/AMMUNITION', /^rifles?$/i],
  [/\b[lmh]mg\b|machine gun/, 'AMMUNITION/AMMUNITION', /^machine gun/i],
  [/assault cannon/, 'AMMUNITION/AMMUNITION', /^assault cannon/i],
  [/taser/, 'AMMUNITION/AMMUNITION_SPECIAL', /^taser/i],
  [/crossbow/, 'AMMUNITION/CROSSBOWS', /^bolts?(?: \d+)?$/i],
  [/\bbows?\b/, 'AMMUNITION/BOWS', /^arrows?(?: \d+)?$/i],
  [/grenade launcher/, 'AMMUNITION/GRENADES', /fragmentation/i],
  [/^(?=.*launcher).*(?:rocket|missile)/, 'AMMUNITION/ROCKETS', /high explosive|^standard/i],
  [/launcher/, 'AMMUNITION/GRENADES', /fragmentation/i],
  [/flamethrower/, 'AMMUNITION/AMMUNITION_SPECIAL', /^fuel tank \(small\)/i],
]
/** The ammunition class and the name of its regular kind for a weapon entry (AMMO); undefined for melee, natural and energy weapons. */
export function ammoRowOf(e: Sr6Entry): [string, RegExp] | undefined {
  const what = [e.attrs.class, e.attrs.category, e.name].filter(Boolean).join(' ').toLowerCase().replace(/_/g, ' ')
  if (/close combat|melee|blade|club|unarmed|natural|laser|energy|accessory\/|ammunition\//.test(what) || (/throwing/.test(what) && !/bow/.test(what)))
    return undefined
  const row = AMMO.find(([re]) => re.test(what))
  return row && [row[1], row[2]]
}
/** a weapon's ammo as printed or catalogued: `15(c)`, `6(cy)`, `100(belt)`, `1(br-3)`; the letters are its type (not the `(e)` of a DV) */
const LOAD = /(\d+)\s*\(\s*(c|m|cy|b|br|d|ml|belt|drum|tanks?)(?:-\d+)?\s*\)/i
/** a stat block that prints its own ammunition or spare clips for a weapon: a count and an ammunition noun (`30 rounds regular ammo`,
 *  `2 spare clips`, `6 frag grenades`); a part's name alone (`extended clip`, `drum magazine`) is no ammunition */
const OWN_AMMO =
  /(?<!\bfor\s+)\b\d+\s+(?:[a-z'’-]+\s+){0,3}?(?:ammo|ammunition|rounds?|clips?|magazines?|belts?|speed ?loaders?|grenades|rockets|missiles|arrows|bolts|tanks?)\b/i
/** the catalog's named weapon accessory, preferring the NPC's book's */
function accessoryNamed(c: Sr6Catalog, name: RegExp, source: string | undefined): Sr6Entry | undefined {
  const list = [...(c.entries.weapons?.values() ?? [])].filter(e => name.test(e.name))
  return list.length ? prefer(c, source)(list) : undefined
}
/** The catalog's ammunition type a stat block names for a weapon without a count (`gel ammo`, `APDS ammo`, `caseless rounds`),
 *  looked up by its name or alias; none for `regular ammo` or a type the catalog lacks. */
function ammoTypeOf(c: Sr6Catalog, t: Sr6NpcThing, source: string | undefined): { printed: string; entry: Sr6Entry } | undefined {
  // (the stat block's parts, `w/ gel ammo` or a bare `gel rounds` the reader left in the line)
  for (const part of t.printed.slice(t.printed.lastIndexOf('[') + 1).split(/[,;]|\bw\//i)) {
    const m = /^(.+?)\s+(?:ammo|ammunition|rounds)]?$/i.exec(part.trim())
    if (!m) continue
    const words = [normName(m[1]), normName(part)]
    const hits = [...(c.entries.ammotypes?.values() ?? [])].filter(e => [e.name, ...(e.aliases ?? [])].some(n => words.includes(normName(n))))
    if (hits.length) return { printed: part.trim(), entry: prefer(c, source)(hits) }
  }
}
/** A firearm's ammunition (owner 2026-10-21, "NPC ammo"): two loads of its regular ammunition (one loaded, one spare) and the
 *  spare's container by its ammo type (clip: a spare clip; magazine: the weapon's own spare magazine, else a spare clip;
 *  cylinder: a speed loader; belt, drum and the rest: none, the two loads are two belts or drums); a bow or crossbow 20
 *  arrows or bolts; a printed ammo line (`w/ 30 rounds regular ammo`, `2 spare clips`) wins and adds none. A load is the
 *  printed ammo count, else the catalog weapon's, else 10. A grenade, rocket or other thrown thing is its printed quantity. */
export function ammoFor(c: Sr6Catalog, t: Sr6NpcThing, source: string | undefined): Sr6NpcThing[] {
  const e = t.entry,
    what = [e?.attrs.class, e?.attrs.category, t.category, /\[\s*([^,\]]*)/.exec(t.printed)?.[1], t.name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/_/g, ' ')
  // (a bow's category is "Throwing weapon/projectile"; an energy weapon takes power, a weapon accessory is no weapon)
  if (
    /close combat|melee|blade|club|unarmed|natural|laser|energy|accessory\//.test(what) ||
    (/throwing/.test(what) && !/bow/.test(what)) ||
    /energy/i.test(e?.attrs.ammo ?? '') ||
    e?.attrs.class?.startsWith('AMMUNITION/') ||
    OWN_AMMO.test(t.printed)
  )
    return []
  // (a weapon printed only as "Firearms": a rifle's ammunition when it reaches Far, else a pistol's; ponytail: the stat block's range bands are all it says)
  const generic = /firearm/.test(what) && !AMMO.some(([re]) => re.test(what)) ? (t.values.ar?.[3] != null ? ' rifle' : ' heavy pistol') : '',
    row = AMMO.find(([re]) => re.test(what + generic))
  const list = row && (indexOf(c).classes.get(row[1]) ?? []).filter(a => row[2].test(a.name))
  if (!list?.length) return []
  // (a rated ammunition, `Arrow 1` to `Arrow 14`, is one entry per level: its lowest)
  const lv = (a: Sr6Entry) => Number(a.attrs.level ?? a.attrs.rating) || 0,
    low = Math.min(...list.map(lv)),
    ammo = prefer(c, source)(list.filter(a => lv(a) === low)),
    bow = /BOWS$|CROSSBOWS$/.test(row![1]),
    type = (LOAD.exec(t.printed.slice(t.printed.lastIndexOf('[') + 1)) ?? LOAD.exec(e?.attrs.ammo ?? ''))?.[2].toLowerCase(),
    load = bow ? 20 : /^tanks?$/.test(type ?? '') ? 1 : (t.values.ammo ?? (Number(e?.attrs.ammo?.match(/^\s*(\d+)/)?.[1]) || 10))
  const made = (x: Sr6Entry, qty: number, spare?: true): Sr6NpcThing => ({
    part: t.part,
    printed: t.printed,
    name: x.name,
    kind: spare ? 'gear' : x.kind,
    entry: spare ? { ...x, kind: 'gear' } : x,
    match: { score: 1, how: 'ammo' },
    ammoFor: t.name,
    qty,
    ...(spare ? { spare } : { load }),
    values: {},
    // (a printed ammunition type, no count: the two loads are of it)
    accessories:
      !spare && kind
        ? [
            {
              part: t.part,
              printed: kind.printed,
              name: kind.entry.name,
              kind: 'ammotypes',
              entry: kind.entry,
              match: { score: 1, how: 'exact' },
              values: {},
              accessories: [],
            },
          ]
        : [],
  })
  const kind = ammoTypeOf(c, t, source)
  const own = e && [...(c.entries.gear?.values() ?? [])].find(g => g.attrs.supplyOf === e.id && /magazine/i.test(g.name))
  const box = bow
    ? undefined
    : type === 'cy'
      ? accessoryNamed(c, /^speed loader$/i, source)
      : type === 'm'
        ? (own ?? accessoryNamed(c, /^spare clip$/i, source))
        : type === 'c'
          ? accessoryNamed(c, /^spare clip$/i, source)
          : undefined
  return [made(ammo, bow ? load : 2 * load), ...(box ? [made(box, 1, true)] : [])]
}

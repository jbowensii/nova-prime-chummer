// Every catalog npcs, critters, spirits and sprites entry of an import (reprints counted each time; Load book NPCs loads one
// per version), built as Load book NPCs builds a copy (bookNpc) and exported as the Foundry module gets it (exportNpc),
// measured: the gear, augmentations, powers and spells its stat block prints that link to no catalog entry, keyed by the
// printed line. Ammunition (owner ruling 2026-10-21, "NPC ammo"): every ranged weapon audited against the ruling, worked out
// here from the weapon's ammo value and type, not by npc.ts: two loads of ammo and the spare's container, a bow 20, a printed
// ammo line wins. Not measured otherwise: weapons and attacks (npc-combat-items-live). A `w/` accessory the catalog lacks is exported as plain
// gear and counts here as unlinked, as any other gear does. No book data in the repo: SR6_CATALOG=<a data folder holding custom/sr6, e.g. an import run's
// folder> npx vitest run -t npc-book-measure. SR6_MEASURE_OUT=<file> writes the counts and lists as JSON. Skipped without
// SR6_CATALOG.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { exportNpc } from '../../src/sr6/foundry/domain/export'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/catalog/domain/load'
import { bookNpc } from '../../src/sr6/runner-builder/domain/creation/npc'
import { normName } from '../../src/sr6/catalog/domain/names'

const DIR = process.env.SR6_CATALOG

type Item = ReturnType<typeof exportNpc>['items'][number]
// The ruling is worked out here its own way, not by npc.ts's patterns: the ammo a weapon holds is read by splitting its string
// (`15(c)`, `2(b)`, `100(belt)`, `30(c) or 100(belt)`), the stat block's own ammo line is a comma part that is a count and an ammo
// noun, and a handful of book weapons are checked by name (FIXED) against what their printed lines say.
const TYPES = ['c', 'm', 'cy', 'b', 'br', 'd', 'ml', 'belt', 'drum', 'tank', 'tanks']
/** `15(c)`, `15c`, `2(b)`, `100(belt)`, `30(c) or 100(belt)` (the first): the count and the type, none for `Energy` or `—` */
function holds(s: string): { n: number; type: string } | undefined {
  const m = /^\s*(\d+)\s*(?:x\d+)?\s*\(?\s*([a-z]+)/i.exec(s.split(/\s+or\s+|\//i)[0])
  return m && TYPES.includes(m[2].toLowerCase()) ? { n: Number(m[1]), type: m[2].toLowerCase() } : undefined
}
/** the ammo a stat block prints for the weapon itself: the comma part that is only a count and a type */
const printedHolds = (printed: string) =>
  printed
    .slice(printed.lastIndexOf('[') + 1)
    .split(/[,;]|\bw\//i)
    .map(p => p.replace(/\]$/, ''))
    .filter(p => /^\s*\d+\s*(?:x\d+)?\s*\(?\s*[a-z]+\)?\s*$/i.test(p))
    .map(holds)
    .find(Boolean)
const NOUN = 'ammo|ammunition|rounds?|clips?|magazines?|belts?|loaders?|grenades|rockets|missiles|arrows|bolts|tanks?'
/** a stat block's own ammo line: a count, up to three words and an ammo noun (a part's name alone is none) */
const printsAmmo = (printed: string) =>
  printed
    .replace(/\bfor \d+ rounds/gi, '')
    .split(/[,;[]|\bw\//i)
    .some(p => new RegExp(String.raw`\b\d+\s+(?:\S+\s+){0,3}?(?:${NOUN})\b`, 'i').test(p))
const MELEE = /close combat|melee|blade|club|unarmed|natural|laser|energy|throwing/i
const FIREARM = /pistol|submachine|\bsmg\b|\bmp\b|rifle|shotgun|machine gun|sniper|assault cannon|firearm/i
/** What the ruling gives a weapon item: undefined when it is none of the ranged weapons it covers, else its own ammo printed, or the rounds and the spare's name. */
function ruling(w: Item): { own: true } | { rounds: number; spare?: RegExp } | undefined {
  const a = w.attrs,
    printedCategory = /\[\s*([^,\]]*)/.exec(w.line.printed)?.[1] ?? '',
    text = `${a.category ?? ''} ${a.class ?? ''} ${w.name}`,
    load = printedHolds(w.line.printed) ?? holds(a.ammo ?? '')
  const bow = /bows?\b/i.test(text),
    special = /launcher|flamethrower|taser/i.test(text),
    firearm = a.class?.startsWith('WEAPON_FIREARMS/') || FIREARM.test(printedCategory) || (!a.class && FIREARM.test(text))
  if (w.line.unread || /^(AMMUNITION|ACCESSORY)\//.test(a.class ?? '') || MELEE.test(printedCategory) || (MELEE.test(text) && !bow && !special))
    return undefined
  if (!bow && !special && !firearm) return undefined
  if (printsAmmo(w.line.printed)) return { own: true }
  if (bow) return { rounds: 20 }
  // (two loads: a tank is one; a count the book does not give is 10)
  const one = load?.type.startsWith('tank') ? 1 : (load?.n ?? 10)
  return {
    rounds: one + one,
    spare:
      load?.type === 'c' ? /^spare clip$/i : load?.type === 'cy' ? /^speed loader$/i : load?.type === 'm' ? /^(spare clip|.* spare magazine)$/i : undefined,
  }
}
/** Book weapons checked by hand against their printed lines: [NPC, weapon, what it gets (name, qty), or none]. */
const FIXED: [string, string, [RegExp, number][]][] = [
  // `15(c)`
  [
    'Detective Mikulás Jezek (TNE p.116)',
    'Ares Predator VI',
    [
      [/^Heavy Pistol/, 30],
      [/^Spare clip$/, 1],
    ],
  ],
  // `12(c)`
  [
    'Dag Rage (ED p.171)',
    'Nemesis Arms Praetorian II',
    [
      [/^Heavy Pistol/, 24],
      [/^Spare clip$/, 1],
    ],
  ],
  // a revolver (6 cy in the catalog), a shotgun (10 c / 24 d), a launcher with its grenades printed
  [
    'Transport Crew (ML2083-04 p.25)',
    'Ruger Super Warhawk',
    [
      [/^Heavy Pistol/, 12],
      [/^Speed loader$/, 1],
    ],
  ],
  [
    'Transport Crew (ML2083-04 p.25)',
    'Mossberg CMDT',
    [
      [/^Shotgun/, 20],
      [/^Spare clip$/, 1],
    ],
  ],
  ['Transport Crew (ML2083-04 p.25)', 'ArmTech MGL-6', []],
  // the book prints `50 rounds ammo`; `APDS ammo` has no count, so it is not an ammo line
  ['Detective (TS p.160)', 'Ares Predator VI', []],
  [
    'Renraku Red Samurai (CRB p.208)',
    'Ares Predator VI',
    [
      [/^Heavy Pistol/, 30],
      [/^Spare clip$/, 1],
    ],
  ],
  // `w/ 100 rounds (belt)`
  ['Professional Mercenary, heavy weapons expert (SLS p.135)', 'Ingram Grey Knight', []],
  // a bow
  ['Silver golem (AW p.114)', 'Bow 1', [[/^Arrow/, 20]]],
]
/** The FIXED weapons of one NPC that do not get what they should. */
function fixedAudit(who: string, items: Item[]): string[] {
  return FIXED.filter(f => f[0] === who).flatMap(([, name, want]) => {
    const i = items.findIndex(w => w.name === name && w.line.match?.how !== 'ammo')
    if (i < 0) return [`${name} — not found for the hand-checked assertion`]
    const got: Item[] = []
    for (let j = i + 1; items[j]?.line.match?.how === 'ammo'; j++) got.push(items[j])
    const same = got.length === want.length && want.every(([re, q], k) => re.test(got[k].name) && got[k].qty === q)
    return same ? [] : [`${name} — hand-checked: got [${got.map(g => `${g.name} ×${g.qty}`)}], expected [${want.map(([re, q]) => `${re} ×${q}`)}]`]
  })
}
/** the ammunition type a stat block names without a count: `gel ammo`, `w/ APDS ammo`, `caseless rounds` (not `regular`) */
const typeWord = (printed: string) =>
  printed
    .slice(printed.lastIndexOf('[') + 1)
    .split(/[,;]|\bw\//i)
    .map(p => /^\s*([a-z][a-z'’ -]*?)\s+(?:ammo|ammunition|rounds)\s*\]?\s*$/i.exec(p)?.[1])
    .find(w => w && !/^(regular|standard|normal)$/i.test(w.trim()))
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** The violations of the ruling among one NPC's weapons, with how many weapons were audited. */
function ammoAudit(items: Item[], types: string[][]): { audited: number; why: string[] } {
  const why: string[] = []
  let audited = 0
  items.forEach((w, i) => {
    if (w.line.match?.how === 'ammo' || !['weapons', 'attacks'].includes(w.line.part) || w.kind !== 'weapons') return
    const group = []
    for (let j = i + 1; items[j]?.line.match?.how === 'ammo'; j++) group.push(items[j])
    const r = ruling(w)
    if (!r) {
      if (group.length) why.push(`${w.name} — ammo added to a weapon the ruling gives none`)
      return
    }
    audited++
    if ('own' in r) {
      if (group.length) why.push(`${w.name} — ammo added where the block printed its own`)
      return
    }
    const ammo = group.filter(g => g.attrs.class?.startsWith('AMMUNITION/')),
      boxes = group.filter(g => !g.attrs.class?.startsWith('AMMUNITION/'))
    const rounds = ammo.reduce((n, g) => n + g.qty, 0)
    // a named type with no count: the loads are of it, when the catalog has that type (a name or alias)
    const word = typeWord(w.line.printed),
      hit = word && types.find(names => names.some(n => flat(n) === flat(word) || flat(n) === flat(word + 'ammo')))
    const linked = ammo.flatMap(g => g.accessories.map(a => a.name))
    if (hit ? linked.length !== 1 || flat(linked[0]) !== flat(hit[0]) : linked.length)
      why.push(`${w.name} — ammo type [${linked}], ruling says ${hit ? hit[0] : 'none'}`)
    if (rounds !== r.rounds) why.push(`${w.name} — ${rounds} rounds, ruling says ${r.rounds}`)
    if (r.spare ? boxes.length !== 1 || !r.spare.test(boxes[0].name) || boxes[0].qty !== 1 : boxes.length)
      why.push(`${w.name} — containers [${boxes.map(b => `${b.name} ×${b.qty}`)}], ruling says ${r.spare ?? 'none'}`)
  })
  return { audited, why }
}

test.skipIf(!DIR)(
  'npc-book-measure: unlinked gear, powers and spells over every book NPC',
  async () => {
    const get = async (path: string) => {
      const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join(DIR!, path) : null
      try {
        return file ? readFileSync(file, 'utf8') : null
      } catch {
        return null
      }
    }
    const { files, missing } = await collectSr6Files(get)
    // a file an index lists but the folder lacks: a partial catalog would give wrong numbers that look right
    expect(missing).toEqual([])
    const c = buildSr6Catalog(files),
      data = sr6Data(c)
    const types = [...(c.entries.ammotypes?.values() ?? [])].map(e => [e.name, ...(e.aliases ?? [])])
    const bucket = () => new Map<string, { n: number; npcs: Set<string> }>()
    const lists = { gear: bucket(), powers: bucket(), spells: bucket() }
    const n = {
      npcs: 0,
      items: 0,
      gearUnlinked: 0,
      powersUnlinked: 0,
      spellsUnlinked: 0,
      spellsLinked: 0,
      weapons: 0,
      ammoLines: 0,
      ammoRounds: 0,
      ammoAudited: 0,
      ammoViolations: 0,
    }
    const ammo: { name: string }[] = []
    const add = (b: ReturnType<typeof bucket>, key: string, who: string) => {
      const x = b.get(key) ?? { n: 0, npcs: new Set<string>() }
      x.n++
      x.npcs.add(who)
      b.set(key, x)
    }
    for (const kind of ['npcs', 'critters', 'spirits', 'sprites'] as const)
      for (const e of c.entries[kind]?.values() ?? []) {
        const npc = bookNpc(e).npc!
        n.npcs++
        const who = `${e.name} (${e.source} p.${e.page})`
        const x = exportNpc(npc, data, c)
        const audit = ammoAudit(x.items, types)
        audit.why.push(...fixedAudit(who, x.items))
        n.ammoAudited += audit.audited
        n.ammoViolations += audit.why.length
        for (const w of audit.why) ammo.push({ name: `${who}: ${w}` })
        for (const i of x.items.flatMap(i => [i, ...i.accessories])) {
          n.items++
          const part = i.line.part,
            linked = !!i.line.match,
            printed = normName(i.line.printed)
          if (i.line.match?.how === 'ammo') {
            n.ammoLines++
            n.ammoRounds += i.qty ?? 1
            continue
          }
          if (part === 'weapons' || part === 'attacks') {
            if (i.kind === 'weapons') n.weapons++
            continue
          }
          if (part === 'spells') {
            if (linked) n.spellsLinked++
            else {
              n.spellsUnlinked++
              add(lists.spells, printed, who)
            }
          } else if (part === 'powers' || part === 'optionalPowers') {
            if (!linked) {
              n.powersUnlinked++
              add(lists.powers, printed, who)
            }
          } else if (!linked) {
            n.gearUnlinked++
            add(lists.gear, `${part}: ${printed}`, who)
          }
        }
      }
    const out = Object.fromEntries(
      Object.entries(lists).map(([k, b]) => [
        k,
        [...b].sort((a, z) => z[1].n - a[1].n || (a[0] < z[0] ? -1 : 1)).map(([name, v]) => ({ name, n: v.n, npcs: [...v.npcs].slice(0, 5) })),
      ]),
    )
    const counts = { ...n, gearDistinct: lists.gear.size, powersDistinct: lists.powers.size, spellsDistinct: lists.spells.size }
    console.log(JSON.stringify(counts))
    if (process.env.SR6_MEASURE_OUT) writeFileSync(process.env.SR6_MEASURE_OUT, JSON.stringify({ counts, ammo, ...out }, null, 1))
    expect(n.npcs).toBeGreaterThan(0)
  },
  900_000,
)

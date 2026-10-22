// Every book NPC, critter, spirit and sprite of an import, read as Load book NPCs copies it (bookNpc) and exported as the
// Foundry module gets it (exportNpc), measured: what the stat blocks print that links to no catalog entry. No book data in
// the repo: SR6_CATALOG=<a data folder holding custom/sr6, e.g. an import run's folder> npx vitest run -t npc-book-measure.
// SR6_MEASURE_OUT=<file> writes the counts and lists as JSON. Skipped without SR6_CATALOG.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { exportNpc } from '../../src/sr6/foundry/domain/export'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/catalog/domain/load'
import { bookNpc } from '../../src/sr6/runner-builder/domain/creation/npc'
import { normName } from '../../src/sr6/catalog/domain/names'

const DIR = process.env.SR6_CATALOG

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
    const c = buildSr6Catalog((await collectSr6Files(get)).files),
      data = sr6Data(c)
    const bucket = () => new Map<string, { n: number; npcs: Set<string> }>()
    const lists = { gear: bucket(), powers: bucket(), spells: bucket() }
    const n = { npcs: 0, items: 0, gearUnlinked: 0, powersUnlinked: 0, spellsUnlinked: 0, spellsLinked: 0, weapons: 0, ammoLines: 0, ammoRounds: 0 }
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
    if (process.env.SR6_MEASURE_OUT) writeFileSync(process.env.SR6_MEASURE_OUT, JSON.stringify({ counts, ...out }, null, 1))
    expect(n.npcs).toBeGreaterThan(0)
  },
  900_000,
)

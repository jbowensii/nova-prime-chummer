// npc-combat-items over a live server's NPCs and critters (no book data in the repo): SR6_LIVE=<a data folder holding
// characters/sr6/.npcs/admin and custom/sr6> npx vitest run -t npc-combat-items. Prints how many stat blocks print attacks,
// how many of their attacks export as rollable weapon items, and each one that doesn't with why; SR6_LIVE_OUT=<file>
// also writes the lists as JSON. Skipped without SR6_LIVE.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { exportNpc } from '../../src/sr6/engine/export'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/engine/load'
import { splitThings } from '../../src/sr6/engine/npc'

const LIVE = process.env.SR6_LIVE

test.skipIf(!LIVE)(
  'npc-combat-items: coverage over the live NPCs and critters',
  async () => {
    const get = async (path: string) => {
      const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join(LIVE!, path) : null
      try {
        return file ? readFileSync(file, 'utf8') : null
      } catch {
        return null
      }
    }
    const c = buildSr6Catalog((await collectSr6Files(get)).files),
      data = sr6Data(c)
    const dir = join(LIVE!, 'characters/sr6/.npcs/admin')
    const n = { files: 0, read: 0, withAttacks: 0, attacks: 0, rollable: 0, linked: 0, built: 0, noDv: 0, armor: 0, gear: 0, augmentations: 0, powers: 0 }
    const kinds: Record<string, number> = {},
      powers: Record<string, number> = {},
      links: Record<string, number> = {},
      unlinked: Record<string, number> = {},
      picks: string[] = []
    const notRolled: { npc: string; printed: string; why: string }[] = [],
      noneRollable: string[] = []
    for (const f of readdirSync(dir)) {
      n.files++
      const r = xmlToSr6(readFileSync(join(dir, f), 'utf8'))
      if (!r.ok || !r.character.npc) continue
      n.read++
      const npc = r.character.npc,
        name = `${r.character.identity.streetName} (${npc.kind}, ${npc.from?.source ?? '?'})`
      kinds[npc.kind] = (kinds[npc.kind] ?? 0) + 1
      const lines = npc.lines.filter(l => l.part === 'weapons' || l.part === 'attacks')
      const x = exportNpc(npc, data, c)
      const weapons = x.items.filter(i => i.kind === 'weapons' && (i.line.part === 'weapons' || i.line.part === 'attacks'))
      // how each item found its entry (accessories too): exact, fuzzy by score, a generic name's standard item, ammo, or built
      for (const i of x.items.flatMap(i => [i, ...i.accessories])) {
        const m = i.line.match,
          bin = !m ? `built (${i.line.part})` : m.how !== 'fuzzy' ? m.how : `fuzzy ${m.score < 0.9 ? '0.85–0.90' : m.score < 0.95 ? '0.90–0.95' : '0.95–1.00'}`
        links[bin] = (links[bin] ?? 0) + 1
        if (m?.how === 'fuzzy' || m?.how === 'standard') picks.push(`${m.how} ${m.score}: ${i.line.printed.slice(0, 70)} → ${i.kind} ${i.name}`)
        if (!m && i.line.part !== 'weapons' && i.line.part !== 'attacks')
          unlinked[`${i.line.part}: ${i.name}`] = (unlinked[`${i.line.part}: ${i.name}`] ?? 0) + 1
        if (i.line.values.defense != null && i.kind !== 'armor') picks.push(`defense, not armor: ${i.line.printed.slice(0, 70)} → ${i.kind} ${i.name}`)
      }
      for (const i of x.items) {
        if (i.line.match?.how === 'ammo') continue
        if (i.kind === 'armor') n.armor++
        else if (i.kind === 'augmentations') n.augmentations++
        else if (i.line.part === 'powers' || i.line.part === 'optionalPowers') {
          n.powers++
          powers[`${i.kind}${i.id ? '' : ' (built)'}`] = (powers[`${i.kind}${i.id ? '' : ' (built)'}`] ?? 0) + 1
        } else if (i.line.part === 'gear') n.gear++
      }
      if (!lines.length) continue
      n.withAttacks++
      const printed = lines.flatMap(l => splitThings(l.text))
      n.attacks += printed.length
      for (const w of weapons) {
        n.rollable++
        if (w.id) n.linked++
        else n.built++
        if (w.values.dv == null) {
          n.noDv++
          notRolled.push({ npc: name, printed: w.line.printed, why: 'rollable, but its DV could not be read (kept as printed text)' })
        }
      }
      if (process.env.SR6_LIVE_SHOW && name.startsWith(process.env.SR6_LIVE_SHOW))
        console.log(
          name,
          JSON.stringify(
            x.items.map(i => ({
              uid: i.uid,
              kind: i.kind,
              id: i.id,
              name: i.name,
              attrs: i.id ? undefined : i.attrs,
              values: i.values,
              worn: i.worn,
              level: i.level,
              acc: i.accessories.map(a => a.uid),
            })),
            null,
            1,
          ),
        )
      const made = new Set(weapons.map(w => w.line.printed))
      for (const p of printed)
        if (!made.has(p))
          notRolled.push({
            npc: name,
            printed: p,
            why: x.items.some(i => i.line.printed === p && i.line.unread)
              ? /cybercombat/i.test(p)
                ? 'kept as a note item: a Cybercombat (Matrix) attack'
                : 'kept as a note item: printed stats it can’t roll'
              : x.items.some(i => i.line.printed === p)
                ? 'a catalog item that is not a weapon'
                : /cybercombat/i.test(p)
                  ? 'a Cybercombat (Matrix) attack, not a weapon'
                  : !/\[|\d\s*[PS]\b|\//.test(p) && (p.length > 40 || /^[a-z*]/.test(p))
                    ? 'book text the reader ran into the line, or a footnote'
                    : 'no catalog weapon of that name, and no DV or attack ratings it can read',
          })
      if (!weapons.length) noneRollable.push(name)
    }
    console.log(JSON.stringify({ ...n, kinds, powers, links, noneRollable: noneRollable.length }, null, 1))
    for (const x of notRolled) console.log(`not rolled: ${x.npc}: ${x.printed.slice(0, 120)} — ${x.why}`)
    if (process.env.SR6_LIVE_OUT)
      writeFileSync(
        process.env.SR6_LIVE_OUT,
        JSON.stringify({ ...n, kinds, powers, links, notRolled, noneRollable, picks, unlinked: Object.entries(unlinked).sort((a, b) => b[1] - a[1]) }, null, 1),
      )
    expect(n.read).toBe(n.files)
  },
  600_000,
)

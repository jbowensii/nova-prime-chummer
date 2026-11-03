// NPC things: what the weapons, attacks, gear, augmentations and powers lines print, linked to the catalog.
import { type Sr6Npc } from '../../../formats/domain/character'
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { matchKey, nameRatio, normName } from '../../../catalog/domain/names'
import { atLevel } from '../../../catalog/domain/levels'
import { ammoFor } from './npc-ammo'
import { ACCESSORY_KINDS, DEVICES, DEVICE_NAME, NATURAL, POWER_KINDS, SPELL_KINDS, STAT_SIGN, type Sr6NpcThing, THING_KINDS } from './npc-types'
import {
  ATTRIBUTE_VALUE,
  GM_NOTE,
  NUMBER_WORDS,
  PACKS,
  abbreviated,
  addOnInitialism,
  coveredBy,
  expandStuff,
  guess,
  inAnyKind,
  leadWord,
  licenceThing,
  licences,
  spellLines,
  splitWith,
  stuffLines,
  viaForms,
  viaMid,
} from './npc-gear'
import { pieces, readStats, splitThings, top } from './npc-parse'
import { findEntry, prefer, round, standardArmor, standardOf } from './npc-match'
import { findPower, powerParts } from './npc-powers'

/** The things an NPC's weapons, attacks, gear, augmentations and powers lines print, each its catalog entry where the
 *  catalog has one (a level by its printed number: `Improved Reflexes 2` is that level's entry), else built from what is
 *  printed: an attack printing a DV (read or not) or attack ratings as a weapon, gear with a printed Defense as armor,
 *  other gear as gear, an augmentation as one, a power as a critter power. A weapon or attack with none of those and no
 *  entry, or a Cybercombat one, is left out (its line stays in the notes). The printed numbers are kept (values), worked
 *  out at the NPC's rating where they use its Force. */
export function npcThings(npc: Sr6Npc, c: Sr6Catalog): Sr6NpcThing[] {
  const src = npc.from?.source,
    being = npc.kind !== 'grunt' && npc.kind !== 'contact',
    powers = POWER_KINDS[being ? 'being' : 'person']
  const out: Sr6NpcThing[] = []
  const generics: { thing: Sr6NpcThing; word: string }[] = []
  for (const l of npc.lines) {
    // (a spells line reads as a powers line does: names, linked by name or a 75% guess, else kept as printed)
    const spell = l.part === 'spells',
      power = l.part === 'powers' || l.part === 'optionalPowers' || spell,
      attack = l.part === 'weapons' || l.part === 'attacks'
    const lineKinds = spell ? SPELL_KINDS : power ? powers : THING_KINDS[l.part]
    if (!lineKinds) continue
    // (gear and augmentations: GM instructions and prose are notes, grades set, a line printing several things split)
    const stuff = l.part === 'gear' || l.part === 'augmentations'
    const printeds: { printed: string; grade?: string; name?: string }[] = attack
      ? splitThings(l.text).map(printed => ({ printed }))
      : stuff
        ? stuffLines(l.text).flatMap(t => expandStuff(c, t.printed, src).map(printed => ({ ...t, printed })))
        : spell
          ? spellLines(c, l.text)
          : top(l.text).map(printed => ({ printed }))
    for (const { printed, grade: lineGrade, name: spellName } of printeds) {
      // a data structure's own name: `data structure (Oracle 4)` is Oracle 4
      const bare = stuff ? printed.replace(/^data structures?\s*\((.*)\)(?:\s+\S.*)?$/i, '$1') : printed
      const kinds = bare === printed ? lineKinds : (['datastructures'] as Sr6Kind[])
      // (a name that is an entry's own keeps its `w/`: `Full body armor w/ helmet`)
      const whole = stuff && /\b(?:w\/|with)\s/i.test(bare) ? pieces(bare).name : undefined
      const spelt = whole?.replace(/\bwith\s/i, 'w/ ')
      const own = whole && (findEntry(c, whole, kinds, src) ?? findEntry(c, spelt!, kinds, src) ?? findEntry(c, spelt!, kinds, src, 'loose'))
      const [head, ...withs] = stuff && !(own && own.match.score >= 0.9) ? splitWith(bare) : [bare]
      const p = power ? { name: spellName ?? printed, stats: [] } : pieces(head)
      const s = readStats(p.stats, npc.rating)
      // (`with a rating 4` is the thing's rating; a GM's choice is no add-on)
      for (const w of withs) {
        const r = w.match(/^(?:a\s+)?rating\s+(\d+)$/i)
        if (r) s.values.rating ??= Number(r[1])
        else s.accessories.push(w)
      }
      // a count printed with it: `2 x smoke grenades`, `Meta Link x2`, `data chip (x5)`, `three packets of cigarettes`
      const n = p.name.length <= 200 ? p.name.match(/^(\d+)\s*x\s+(.+)$|^(.+?)(?:\s*\(x\s*(\d+)\)|\s+x\s*(\d+))$/i) : null
      const w = stuff && !n ? p.name.match(new RegExp(`^(${Object.keys(NUMBER_WORDS).join('|')})\\s+(${PACKS}.+)$`, 'i')) : null
      const name = n ? (n[2] ?? n[3]).trim() : w ? w[2] : p.name,
        qty = n ? Number(n[1] ?? n[4] ?? n[5]) : w ? NUMBER_WORDS[w[1].toLowerCase()] : s.count
      // (a name with its bracket may be an entry's own: `Hand (obvious)`)
      const pw = power ? powerParts(name) : undefined
      const pf = pw ? findPower(c, name, pw.name, kinds, src) : undefined
      let found =
        pf?.found ?? (stuff && p.name !== head ? findEntry(c, head.replace(/^\d+\s*x\s+/i, ''), kinds, src) : undefined) ?? findEntry(c, name, kinds, src)
      // a trailing number is its rating or level: `white noise generator 3`, `Hardened Armor (4)`
      const lv = pw ? undefined : name.match(/^(.*?)\s*(?:\((\d{1,2})\)|\s(\d{1,2}))$/)
      if (lv && (!found || normName(found.entry.name) === normName(lv[1]))) {
        found ??= findEntry(c, lv[1], kinds, src)
        s.values.rating ??= Number(lv[2] ?? lv[3])
      }
      // (not a spell's: `Fireball 6` is its Force, kept in its printed text)
      if (!spell && pw?.rating != null) s.values.rating ??= pw.rating
      if (!found && !power && s.values.rating != null) found = findEntry(c, `${name} ${s.values.rating}`, kinds, src)
      // no name: the most alike one (at least NPC_MATCH), else a standard item; a power only the most alike (a power the
      // catalog lacks stays as printed); a natural attack (a bite: its skill as category, or a close band only) by name
      // only, no catalog weapon being one
      const natural =
        attack &&
        (NATURAL.test(s.category ?? '') ||
          (!s.category && (s.values.dv != null || !!s.dvText) && (being || !(s.values.ar ?? []).slice(1).some(b => b != null))))
      // (a Cybercombat attack is a Matrix action: no catalog thing; gear printing a Defense, not a device's, is armor)
      const armored = !attack && !power && s.values.defense != null && !DEVICE_NAME.test(name)
      // (gear and augmentations: first the name in its other forms, then a leading word, then any kind)
      // (`Low lifestyle` is the lifestyle Low)
      let lifestyleRuled = false
      // (`Medium` is a typo for `Middle`: owner 2026-10-22)
      if (stuff && /\blifestyle$/i.test(name)) {
        const lifestyle = findEntry(c, name.replace(/\s+lifestyle$/i, '').replace(/^medium$/i, 'middle'), ['lifestyles'], src)
        // (`Medium` is the owner's ruling: a typo for Middle)
        const typo = /^medium\s+lifestyle$/i.test(name) && lifestyle
        const had = !!found
        found ??= lifestyle && (typo ? { entry: lifestyle.entry, match: { score: 1, how: 'fuzzy' as const } } : guess(lifestyle, name))
        if (typo && !had) lifestyleRuled = true
      }
      // (the CRB's certified credstick table lists the credsticks by colour: the one printed, else the standard one; `certified`
      // a detail of the certified ones; an owner ruling 2026-10-22)
      const stick = stuff ? name.match(/^(?:(certified)\s+)?(?:(standard|silver|gold|platinum|ebony)\s+)?(?:(certified)\s+)?cred\w*sticks?$/i) : null
      let ruled = false
      if (stick) {
        const sticks = [...c.entries.gear.values()].filter(e => /^credstick$/i.test(e.attrs.category ?? ''))
        const colour = (stick[2] ?? head.match(/\b(standard|silver|gold|platinum|ebony)\b/i)?.[1])?.toLowerCase()
        const named = sticks.filter(e => e.name.toLowerCase() === colour)
        if (sticks.length && !found) {
          found = { entry: standardOf(named.length ? named : sticks, prefer(c, src)), match: { score: 1, how: 'fuzzy' } }
          ruled = true
        }
      }
      const certified = !!(stick?.[1] ?? stick?.[3])
      if (stuff) found ??= viaForms(c, name, head, armored ? ['armor'] : kinds, src)
      if (stuff && !armored) found ??= viaMid(c, name, src)
      if (!natural && !power && !/cybercombat/i.test(s.category ?? ''))
        found ??= findEntry(c, name, armored ? ['armor'] : kinds, src, 'standard', s.values.rating ?? s.values.defense)
      // (a standard stand-in gives way to the name in its brackets: `rigger command console (Vulcan Liegelord)`)
      if (stuff && !armored && (!found || found.match.how === 'standard')) found = viaForms(c, name, head, kinds, src, true) ?? found
      if (stuff && !armored) found ??= viaForms(c, name, head, kinds, src, false, { rating: s.values.rating })
      if (stuff && !armored) found ??= leadWord(c, name, kinds, src, s.values.rating) ?? inAnyKind(c, name, head, src, s.values.rating)
      // (a cyberlimb word is that limb's base entry, `Arm (obvious)` or `(synthetic)` (synthetic when neither is printed, as for
      // every limb); an additional or extra limb only when the print says so; never another body part by spelling: `cyberarm`
      // is no `Cyberears`)
      const limb = stuff ? name.match(/\bcyber\s?(arm|leg|hand|foot|torso|skull)s?\b/i)?.[1] : undefined
      if (limb) {
        const quality = head.match(/\b(obvious|synthetic)\b/i)?.[1].toLowerCase() ?? 'synthetic'
        const extra = /\b(additional|extra)\b/i.test(head)
        const all = [...c.entries.augmentations.values()].filter(e => new RegExp(`\\b${limb}`, 'i').test(e.name))
        const base = all.filter(e => new RegExp(`^${limb}\\s*\\(${quality}\\)$`, 'i').test(e.name))
        const more = all.filter(e => /\b(additional|extra)\b/i.test(e.name) === extra && new RegExp(quality, 'i').test(e.name))
        const pick = extra ? more : base.length ? base : more
        if (pick.length) found = { entry: prefer(c, src)(pick), match: { score: 0.8, how: 'fuzzy' as const } }
        else if (found && !new RegExp(limb, 'i').test(found.entry.name)) found = undefined
      }
      // (a bound spirit is a creature entry, looked for nowhere else)
      if (stuff && !found && /^spirits? of\b/i.test(name)) found = findEntry(c, name, ['critters', 'spirits'], src)
      // (a standard stand-in far from the name is no guess: `certified credsticks` are not `Standard`)
      if (stuff && found?.match.how === 'standard' && found.match.score < (armored ? 0.5 : 0.3)) found = undefined
      // a device's or implant's `DR 6` is its Device Rating, not a Defense
      if (s.values.defense != null && (found ? DEVICES.has(found.entry.kind) : DEVICE_NAME.test(name))) {
        s.values.rating ??= s.values.defense
        delete s.values.defense
      }
      // armor printing a Defense and nothing like its name: the standard armor at that Defense
      const armor = !found && !attack && !power && s.values.defense != null ? standardArmor(c, s.values.defense, name) : undefined
      if (armor) found = { entry: armor, match: { score: round(nameRatio(matchKey(name), matchKey(armor.name))), how: 'standard' } }
      // the printed level's own entry: `Glow Eyes [rating 2]` is Glow Eyes 2
      if (found && s.values.rating != null) {
        // (`Cybereyes` of one book has levels 6 and 7: rating 3 is another entry named so, `Cybereyes basic system (Rating 3)`)
        const at = atLevel(c, found.entry.kind, found.entry.id, s.values.rating)
        const family = matchKey(found.entry.name)
        const level = (e: Sr6Entry) => Number(e.attrs.level ?? e.attrs.rating)
        const kin = at ? [] : [...c.entries[found.entry.kind].values()].filter(e => matchKey(e.name) === family || matchKey(e.name).startsWith(`${family} `))
        const other = kin.filter(e => level(e) === s.values.rating)
        // (a rating above the family's top level is its top level: `smartglasses (device rating 7)` is Glasses 4)
        const below = stuff ? kin.filter(e => matchKey(e.name) === family && level(e) < s.values.rating!) : []
        const top = Math.max(...below.map(level))
        found.entry = at ?? (other.length ? prefer(c, src)(other) : below.length ? prefer(c, src)(below.filter(e => level(e) === top)) : found.entry)
      }
      const entry = found?.entry
      // An attack it can't roll (a Cybercombat one is a Matrix action; another prints no DV or attack ratings it reads): an
      // item that is no weapon, its printed line kept (unread), when it prints stats at all; a bare name or book text the
      // reader ran into the line stays in the notes only.
      if (!entry && attack && ((s.values.dv == null && !s.values.ar && !s.dvText) || /cybercombat/i.test(s.category ?? ''))) {
        if (STAT_SIGN.test(printed)) out.push({ part: l.part, printed, name, printedName: name, kind: 'gear', unread: true, values: s.values, accessories: [] })
        continue
      }
      const kind: Sr6Kind = entry
        ? entry.kind
        : attack
          ? 'weapons'
          : power
            ? spell
              ? 'spells'
              : 'critterpowers'
            : l.part === 'augmentations'
              ? 'augmentations'
              : s.values.defense != null
                ? 'armor'
                : 'gear'
      const unbracketed = (a: string) => a.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')
      const accessories = s.accessories
        .flatMap(licences)
        .filter(a => !GM_NOTE.test(a) && !ATTRIBUTE_VALUE.test(a) && !/\bchoice\b/i.test(a))
        .map(a => {
          if (/licen[sc]e$/i.test(a)) {
            const { thing, generic } = licenceThing(c, l.part, a)
            if (generic) generics.push({ thing, word: generic })
            return thing
          }
          const ruledAddOn = addOnInitialism(c, unbracketed(a), entry)
          const f =
            ruledAddOn ??
            findEntry(c, a, ACCESSORY_KINDS, src) ??
            abbreviated(c, a, ACCESSORY_KINDS, src) ??
            viaForms(c, unbracketed(a), a, ACCESSORY_KINDS, src) ??
            coveredBy(c, a, ACCESSORY_KINDS, src) ??
            viaMid(c, unbracketed(a), src) ??
            findEntry(c, a, ACCESSORY_KINDS, src, 'loose')
          // (an add-on the catalog lacks stays, as plain gear with its printed name; a pill is its drug, an owner ruling)
          const ruled = !!ruledAddOn || (!!f && /\b(?:pill|tablet|capsule)s?$/i.test(a))
          return f
            ? {
                part: l.part,
                printed: a,
                name: f.entry.name,
                printedName: a,
                kind: f.entry.kind,
                entry: f.entry,
                match: ruled ? { score: 1, how: 'fuzzy' as const } : f.match,
                ...(ruled ? { ruled: true as const } : {}),
                values: {},
                accessories: [],
              }
            : { part: l.part, printed: a, name: unbracketed(a), printedName: unbracketed(a), kind: 'gear' as Sr6Kind, values: {}, accessories: [] }
        })
      out.push({
        part: l.part,
        printed,
        name: entry?.name ?? (pw ? pw.name : name.replace(/\*+$/, '')),
        printedName: pw ? pw.name : name.replace(/\*+$/, ''),
        kind,
        ...((s.grade ?? lineGrade) ? { grade: s.grade ?? lineGrade } : {}),
        ...(pw && [pw.detail, pf?.rest].filter(Boolean).length ? { detail: [pf?.rest, pw.detail].filter(Boolean).join(' ') } : {}),
        ...(certified && found ? { detail: 'certified' } : {}),
        ...(ruled || lifestyleRuled || pf?.ruled ? { ruled: true as const } : {}),
        ...(found ? { entry: found.entry, match: found.match } : {}),
        ...(s.category ? { category: s.category } : {}),
        ...(s.dvText ? { dvText: s.dvText } : {}),
        values: s.values,
        ...(qty && qty > 1 ? { qty } : {}),
        accessories,
      })
      if (attack && kind === 'weapons') out.push(...ammoFor(c, out[out.length - 1], src))
    }
  }
  // an augmentation licence's detail is what the NPC has: cyberware, bioware, adept powers (`bioware` as printed)
  const type = (t: Sr6NpcThing) => t.entry?.attrs.type
  const has = [
    out.some(t => t.part === 'augmentations' && type(t) === 'cyberware') && 'cyberware',
    out.some(t => t.part === 'augmentations' && type(t) === 'bioware') && 'bioware',
    out.some(t => t.entry?.kind === 'adeptpowers') && 'physical adept',
  ].filter(Boolean)
  for (const { thing, word } of generics) thing.detail = word === 'bioware' ? 'bioware' : has.length ? has.join(', ') : word
  return out
}

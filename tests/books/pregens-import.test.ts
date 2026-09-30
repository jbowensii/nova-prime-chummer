// The sample runners as imported: the pregen booklet (recipe pregens, 15 runners) and the core rulebook's
// 12 pregens plus the character creation example (recipe crb). Each file is the book as printed (the owner's rule):
// nothing in it explains, approves or corrects what the book prints (no override, no drawback note, no starting or
// add-on marker), every amp keeps its printed rating, and where the rules rate it otherwise Review says so. The
// warnings and errors a runner shows are the book's, for the owner to look into: listed, never required to be none.
// The engine must reproduce every number the recipe marked "ok" in library/<book>/import.xml, every number the
// hand-encoded runners were tested on (oracle pregens-printed.json), and derive() on the hand-encoded one.
// Needs the owner's imports: py -3.12 -m importer run <LIBRARY_DIR>/<pregens|crb> --custom <CUSTOM_DIR> [--md]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../src/engine/amps'
import { xmlToCharacter } from '../../src/engine/charxml'
import { parseCharacterFile } from '../../src/engine/file'
import { derive } from '../../src/engine/derive'
import { buildCatalog } from '../../src/engine/load'
import { price } from '../../src/engine/price'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { bookFile, books, loadDir } from '../helpers'

const LIBRARY_DIR = process.env.LIBRARY_DIR ?? '.extract/private/library'
const CUSTOM_DIR = process.env.CUSTOM_DIR ?? '.extract/private/custom'
const samplesXml = join(CUSTOM_DIR, 'imported', 'samples.xml')
// the catalog the app loads with these imports: the samples' catalog ids (crb.spell-…) point into it
const imported = books && existsSync(join(CUSTOM_DIR, 'imported', 'index.xml')) ? buildCatalog(await loadDir(CUSTOM_DIR, true)) : null

const doc = (p: string) => new DOMParser().parseFromString(readFileSync(p, 'utf8'), 'text/xml')
const attrsOf = (e: Element) => Object.fromEntries([...e.attributes].map(a => [a.name, a.value]))
type Row = Record<string, string>
type Printed = Record<string, { source?: string; essence: number; thresholds: Record<string, number>; pools: { skill: string; spec: string | null; attr: string; dp: number }[] }>

const oracle: Printed = books && existsSync(bookFile('pregens-printed.json')) ? JSON.parse(readFileSync(bookFile('pregens-printed.json'), 'utf8')) : {}

// the CRB's printed runners carry no source in the oracle; the creation example (lightning) prints no numbers
const imports = [
  { src: 'PREGENS', dir: 'pregens', ids: Object.keys(oracle).filter(id => oracle[id].source === 'SRA2 Pregens v1.0f') },
  { src: 'CRB', dir: 'crb', ids: [...Object.keys(oracle).filter(id => !oracle[id].source), 'lightning'] },
]

describe.each(imports)('$dir import', ({ src, dir, ids }) => {
  const importXml = join(LIBRARY_DIR, dir, 'import.xml')
  const ready = !!books && existsSync(importXml) && existsSync(samplesXml)
  if (!ready) console.info(`no imported ${dir} (library/${dir}/import.xml, custom/imported/samples.xml); tests skipped`)
  const prefix = `${src.toLowerCase()}.`
  const rows: Row[] = ready ? [...doc(importXml).getElementsByTagName('row')].map(attrsOf) : []
  const runners = new Map<string, Character>(ready ? [...doc(samplesXml).getElementsByTagName('sample')]
    .filter(s => s.getAttribute('source') === src).map(s => {
      const r = xmlToCharacter(readFileSync(join(CUSTOM_DIR, 'imported', s.getAttribute('href')!), 'utf8'))
      if (!r.ok) throw new Error(`${s.getAttribute('href')}: ${r.reason}`)
      return [r.character.id.slice(prefix.length), r.character]
    }) : [])

  const run = ready ? describe : describe.skip
  run('runners', () => {
    test(`all ${ids.length} runners are imported`, () => {
      expect([...runners.keys()].sort()).toEqual([...ids].sort())
    })

    describe.each(ready ? ids : ['none'])('%s', id => {
      const ch = runners.get(id)!
      const d = ready ? derive(books!, ch) : undefined
      const mine = rows.filter(r => r.sample === `${prefix}${id}`)
      const dp = (skill: string, spec: string | null, attr: string) =>
        d!.pools.find(q => q.skill === skill && (q.spec ?? null) === spec && q.attr === attr)?.dp

      test('every catalog reference resolves', () => {
        expect(validate(imported ?? books!, ch).filter(v => v.code === 'ref.unknown')).toEqual([])
      })

      test('the file is the book: nothing explains, approves or corrects it', () => {
        const xml = readFileSync(join(CUSTOM_DIR, 'imported', dir, 'samples', `${prefix}${id}.xml`), 'utf8')
        for (const marker of ['<override', 'starting=', 'over=', 'book drawback', 'balances printed rating', 'As printed in'])
          expect(xml.includes(marker), marker).toBe(false)
        expect(ch.overrides).toEqual([])
        // what the book prints against the rules shows as it would on any runner (the owner's to look into)
        const c = imported ?? books!, v = validate(c, ch)
        expect(v.some(x => x.approved)).toBe(false)
        const left = price(c, ch).remaining
        expect(v.some(x => x.code === 'budget.over')).toBe(left < 0)
        console.info(`${id}: ${v.filter(x => x.severity === 'error').length} errors, ${v.filter(x => x.severity !== 'error').length} warnings`)
      })

      test('pools, thresholds and Essence the recipe marked ok are what the engine gives', () => {
        const wrong = mine.filter(r => r.status === 'ok' || r.kind === 'essence').flatMap(r => {
          const got = r.kind === 'pool' ? dp(r.skill, r.spec ?? null, r.attr)
            : r.kind === 'threshold' ? (d!.thresholds as Record<string, number[] | undefined>)[r.key]?.[0]
              : r.kind === 'essence' ? d!.essence : Number(r.printed)
          return got === Number(r.printed) ? [] : [`${r.kind} ${r.key ?? ''}: printed ${r.printed}, engine ${got} (${r.status})`]
        })
        expect(wrong).toEqual([])
      })

      test('every amp keeps its printed rating; where the rules give another, Review says so', () => {
        const amps = mine.filter(r => r.kind === 'amp')
        expect(amps.map(r => r.key)).toEqual(ch.build.amps.map(a => a.uid))
        expect(ch.build.amps.map(a => a.snapshot?.printedRating)).toEqual(amps.map(r => Number(r.printed)))
        const wrong = amps.flatMap(r => {
          const a = ch.build.amps.find(x => x.uid === r.key)!
          const got = ampRating(books!, a, ampCtx(ch.build, a))
          return got === Number(r.computed) ? [] : [`${a.name}: recipe computed ${r.computed}, engine ${got}`]
        })
        expect(wrong).toEqual([])
        const noted = validate(imported ?? books!, ch).filter(v => v.code === 'amp.printedRating').map(v => v.path)
        expect(noted).toEqual(amps.filter(r => r.status === 'mismatch').map(r => `amps.${r.key}`))
      })

      test('same attributes, pools, thresholds and Essence as the hand-encoded runner', () => {
        const r = parseCharacterFile(readFileSync(bookFile(`samples/${id}.ca2.json`), 'utf8'))
        if (!r.ok) throw new Error(r.reason)
        const o = derive(books!, r.character)
        const key = (q: { skill: string; spec?: string; attr: string }) => `${q.spec ?? q.skill}@${q.attr}`
        const theirs = new Map(o.pools.map(q => [key(q), q.dp]))
        const pools = d!.pools.filter(q => theirs.has(key(q)) && theirs.get(key(q)) !== q.dp)
          .map(q => `${key(q)}: generated ${q.dp}, hand ${theirs.get(key(q))}`)
        const t = (x: typeof d) => x!.thresholds
        const worn = (x: typeof d) => [t(x).physicalMain[0], t(x).physicalAlt[0]].sort((a, b) => a - b) // which is "main" is a choice
        // a Matrix threshold the book doesn't print isn't compared: the hand encoding made Ricky Lean's printed Quality a
        // Cyberdeck, the import keeps it a Quality (as printed; Review flags its deck effects)
        const matrix = (x: typeof d) => (!oracle[id] || 'matrix' in oracle[id].thresholds ? t(x).matrix?.[0] : 'not printed')
        expect({ attributes: ch.build.attributes, pools, none: t(d).physicalNone[0], worn: worn(d), mental: t(d).mental[0],
          matrix: matrix(d), essence: d!.essence })
          .toEqual({ attributes: r.character.build.attributes, pools: [], none: t(o).physicalNone[0], worn: worn(o),
            mental: t(o).mental[0], matrix: matrix(o), essence: o.essence })
      })

      // Items as the hand encoding has them, as a multiset of (kind, catalog id or name). Allowed differences are
      // representation only: an equipment Amp the hand also listed as gear, Clothes worn as armor where the hand
      // kept them as gear, the free starting gear (the Fake SIN and Commlink every stat page prints), and a "(…)" note on a name.
      test.runIf(src === 'CRB')('same items as the hand-encoded runner', () => {
        const r = parseCharacterFile(readFileSync(bookFile(`samples/${id}.ca2.json`), 'utf8'))
        if (!r.ok) throw new Error(r.reason)
        const hand = r.character.build.items
        const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
        const key = (i: { kind: string; name: string; catalogId?: string }) => `${i.kind}:${i.catalogId?.replace(prefix, '') ?? norm(i.name)}`
        const handGear = new Set(hand.filter(i => i.kind === 'gear').map(i => norm(i.name)))
        const ampNames = new Set(ch.build.amps.filter(a => a.type === 'equipment').map(a => norm(a.name)))
        const worn = new Set(ch.build.items.filter(i => i.kind === 'armor').map(i => norm(i.name)))
        const count = (xs: string[]) => xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>())
        // an Equipment amp's item: the gear the hand listed under the amp's name, or the one the import adds for it
        const ampItems = new Set(ch.build.amps.filter(a => a.type === 'equipment').map(a => a.linkedItem))
        const mine = count(ch.build.items.filter(i => !i.starting && !(i.kind === 'armor' && handGear.has(norm(i.name)))
          && !(i.kind === 'gear' && ampItems.has(i.uid))).map(key))
        const theirs = count(hand.filter(i => !i.starting && !(i.kind === 'gear' && (ampNames.has(norm(i.name)) || worn.has(norm(i.name))))).map(key))
        // the printed "Fake SIN, Commlink" became the free starting gear: exactly one of each (0.5.3)
        expect(ch.build.items.filter(i => i.starting).map(i => i.starting).sort()).toEqual(['commlink', 'fake-sin'])
        const diff = [...new Set([...mine.keys(), ...theirs.keys()])].filter(k => mine.get(k) !== theirs.get(k))
          .map(k => `${k}: generated ${mine.get(k) ?? 0}, hand ${theirs.get(k) ?? 0}`)
        expect(diff).toEqual([])
      })

      test.runIf(!!oracle[id])('every number the hand-encoded runner was tested on', () => {
        const p = oracle[id]
        const pools = p.pools.filter(x => dp(x.skill, x.spec, x.attr) !== x.dp).map(x => `${x.spec ?? x.skill}@${x.attr}=${x.dp}`)
        const t = d!.thresholds
        const thresholds = Object.entries(p.thresholds).filter(([k, v]) => (k === 'physicalMain' || k === 'physicalAlt'
          ? ![t.physicalMain[0], t.physicalAlt[0]].includes(v) // which worn armor is "main" is a choice, not a number
          : (t as Record<string, number[] | undefined>)[k]?.[0] !== v)).map(([k, v]) => `${k}=${v}`)
        expect({ pools, thresholds, essence: d!.essence }).toEqual({ pools: [], thresholds: [], essence: p.essence })
      })
    })
  })
})

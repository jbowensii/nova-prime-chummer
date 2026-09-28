// The pregen booklet as imported (importer recipe pregens): the engine must reproduce every number the
// recipe marked "ok" in library/pregens/import.xml, the printed amp ratings may differ only where the
// oracle's discrepancy list says so, and every number the hand-encoded runners were tested on
// (oracle pregens-printed.json) must come out of the generated runners too.
// Needs the owner's import: py -3.12 -m importer run <LIBRARY_DIR>/pregens --custom <CUSTOM_DIR> [--md]
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test, expect } from 'vitest'
import { ampCtx, ampRating } from '../../src/engine/amps'
import { xmlToCharacter } from '../../src/engine/charxml'
import { parseCharacterFile } from '../../src/engine/file'
import { derive } from '../../src/engine/derive'
import { validate } from '../../src/engine/validate'
import type { Character } from '../../src/model/types'
import { bookFile, books } from '../helpers'

const LIBRARY_DIR = process.env.LIBRARY_DIR ?? '.extract/private/library'
const CUSTOM_DIR = process.env.CUSTOM_DIR ?? '.extract/private/custom'
const importXml = join(LIBRARY_DIR, 'pregens', 'import.xml')
const samplesXml = join(CUSTOM_DIR, 'imported', 'samples.xml')
const ready = !!books && existsSync(importXml) && existsSync(samplesXml)
if (!ready) console.info('no imported pregen booklet (library/pregens/import.xml, custom/imported/samples.xml); tests skipped')

const doc = (p: string) => new DOMParser().parseFromString(readFileSync(p, 'utf8'), 'text/xml')
const attrsOf = (e: Element) => Object.fromEntries([...e.attributes].map(a => [a.name, a.value]))
type Row = Record<string, string>
const rows: Row[] = ready ? [...doc(importXml).getElementsByTagName('row')].map(attrsOf) : []
const runners = new Map<string, Character>(ready ? [...doc(samplesXml).getElementsByTagName('sample')]
  .filter(s => s.getAttribute('source') === 'PREGENS').map(s => {
    const r = xmlToCharacter(readFileSync(join(CUSTOM_DIR, 'imported', s.getAttribute('href')!), 'utf8'))
    if (!r.ok) throw new Error(`${s.getAttribute('href')}: ${r.reason}`)
    return [r.character.id.replace(/^pregens\./, ''), r.character]
  }) : [])

type Printed = Record<string, { source?: string; essence: number; thresholds: Record<string, number>; pools: { skill: string; spec: string | null; attr: string; dp: number }[] }>
const oracle: Printed = ready ? JSON.parse(readFileSync(bookFile('pregens-printed.json'), 'utf8')) : {}
const daegann = Object.keys(oracle).filter(id => oracle[id].source === 'SRA2 Pregens v1.0f')
const listed = ready ? new Set([...readFileSync(bookFile('book-discrepancies.md'), 'utf8')
  .matchAll(/^\| ([a-z0-9-]+) \| (amp-\d+) \|/gm)].map(m => `${m[1]}/${m[2]}`)) : new Set<string>()

const run = ready ? describe : describe.skip
run('pregen booklet import', () => {
  test('all 15 runners are imported', () => {
    expect([...runners.keys()].sort()).toEqual(daegann.sort())
  })

  describe.each(ready ? daegann : ['none'])('%s', id => {
    const ch = runners.get(id)!
    const d = ready ? derive(books!, ch) : undefined
    const mine = rows.filter(r => r.sample === `pregens.${id}`)
    const dp = (skill: string, spec: string | null, attr: string) =>
      d!.pools.find(q => q.skill === skill && (q.spec ?? null) === spec && q.attr === attr)?.dp

    test('every catalog reference resolves', () => {
      expect(validate(books!, ch).filter(v => v.code === 'ref.unknown')).toEqual([])
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

    test('amp ratings match the booklet, except where the discrepancy list has them', () => {
      const amps = mine.filter(r => r.kind === 'amp')
      expect(amps.map(r => r.key)).toEqual(ch.build.amps.map(a => a.uid))
      const wrong = amps.flatMap(r => {
        const a = ch.build.amps.find(x => x.uid === r.key)!
        const got = ampRating(books!, a, ampCtx(ch.build, a))
        if (got !== Number(r.computed)) return [`${a.name}: recipe computed ${r.computed}, engine ${got}`]
        return got === Number(r.printed) || listed.has(`${id}/${r.key}`) ? [] : [`${a.name}: printed ${r.printed}, engine ${got}`]
      })
      expect(wrong).toEqual([])
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
      expect({ attributes: ch.build.attributes, pools, none: t(d).physicalNone[0], worn: worn(d), mental: t(d).mental[0],
        matrix: t(d).matrix?.[0], essence: d!.essence })
        .toEqual({ attributes: r.character.build.attributes, pools: [], none: t(o).physicalNone[0], worn: worn(o),
          mental: t(o).mental[0], matrix: t(o).matrix?.[0], essence: o.essence })
    })

    test('every number the hand-encoded runner was tested on', () => {
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

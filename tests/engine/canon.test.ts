// Canon tagging (sources.xml), non-canon warnings, per-source private texts and the rules reference.
import { readFileSync } from 'node:fs'
import { describe, test, expect } from 'vitest'
import { isCanon, isCanonSource, nonCanonUses, specSource } from '../../src/engine/canon'
import { buildCatalog } from '../../src/engine/load'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { blankCharacter } from '../../src/engine/file'
import { validate } from '../../src/engine/validate'
import type { AmpEntry, Character, ItemEntry } from '../../src/model/types'
import { base, BOOK_CATALOG_FILES, cat, mini } from '../helpers'

const NS = 'xmlns:ca2="urn:chummer-anarchy2:data:1"'

describe('sources', () => {
  test('the core rulebook and Conversion Guide are canon; DHSA, the pregen booklet and quick refs are not', () => {
    expect(['CRB', 'CG'].map(s => isCanonSource(cat, s))).toEqual([true, true])
    expect(['DHSA', 'PREGENS', 'QREF'].map(s => isCanonSource(cat, s))).toEqual([false, false, false])
  })
  test('an unknown source (house rules) is not canon', () => expect(isCanonSource(cat, 'HOUSE')).toBe(false))
  test('every catalog entry cites a listed source', () => {
    const all = [...cat.amps.values(), ...cat.items.values(), ...cat.skills.values(), ...cat.rules.values()]
    expect(all.filter(e => !cat.sources.has(e.source)).map(e => e.id)).toEqual([])
  })
  test('canon is determined by the entry\'s own declared source, not by which file it shipped in', () => {
    expect(isCanon(cat, cat.amps.get('rush-c')!)).toBe(true)
    expect(isCanon(cat, cat.amps.get('rush')!)).toBe(false)
  })
  test('a spec carries its own source, else its skill’s', () => {
    expect(specSource(cat, 'close-combat.firearms')).toBe('DHSA')
    expect(specSource(cat, 'close-combat.blades')).toBe('CRB')
    expect(specSource(cat, 'custom:Whips')).toBeUndefined()
  })
})

describe('allow non-canon content', () => {
  const rushAmp = (): AmpEntry => ({ uid: 'a', catalogId: 'rush', type: 'equipment', name: 'Rush', narrative: '',
    effects: cat.amps.get('rush')!.effects, linkedItem: 'i' })
  const rushItem = (): ItemEntry => ({ uid: 'i', kind: 'gear', name: 'Rush' })
  const nonCanon = (): Character => { const ch = blankCharacter(); ch.build.amps = [rushAmp()]; ch.build.items = [rushItem()]; return ch }

  test('allowed by default: no warning', () => {
    expect(validate(cat, nonCanon()).filter(v => v.code === 'content.nonCanon')).toEqual([])
  })
  test('canon only: each non-canon use is a warning', () => {
    const v = validate(cat, { ...nonCanon(), allowNonCanon: false }).filter(x => x.code === 'content.nonCanon')
    expect(v.length).toBe(nonCanonUses(cat, nonCanon().build).length)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every(x => x.severity === 'warning')).toBe(true)
  })
  test('a runner using only canon content has nothing to flag', () => {
    const ch = blankCharacter()
    ch.build.amps = [{ uid: 'a', catalogId: 'rush-c', type: 'equipment', name: 'Rush', narrative: '', effects: cat.amps.get('rush-c')!.effects }]
    expect(nonCanonUses(cat, ch.build)).toEqual([])
  })
  test('the switch and origin survive the XML file', () => {
    const r = xmlToCharacter(characterToXml({ ...nonCanon(), allowNonCanon: false, origin: 'TEST' }))
    expect(r.ok && r.character.allowNonCanon).toBe(false)
    expect(r.ok && r.character.origin).toBe('TEST')
    const on = xmlToCharacter(characterToXml(nonCanon()))
    expect(on.ok && on.character.allowNonCanon).toBeUndefined()
  })
})

describe('private texts and rules', () => {
  test('rules load from the reference sheet with links to amp effects', () => {
    const hot = cat.rules.get('gadget-basics')!
    expect(hot.title).toBe('Risk Reduction (spec)')
    expect(hot.effects).toEqual(['rr-spec'])
    expect(isCanon(cat, hot)).toBe(false)
    for (const r of cat.rules.values()) for (const e of r.effects) expect(cat.ampEffects.has(e), `${r.id} -> ${e}`).toBe(true)
  })
  test('committed data carries no rule text; a texts file fills it by id', () => {
    expect(cat.rules.get('gadget-basics')!.text).toBe('')
    const texts = `<ca2:data ${NS} kind="texts" version="1"><text of="rules" id="gadget-basics">Full immersion.</text>`
      + `<text of="amps" id="keen-eye">Sharp senses.</text></ca2:data>`
    const c = buildCatalog([...base.filter(f => !BOOK_CATALOG_FILES.includes(f.file)),
      ...mini, { file: 'custom/texts/qref.xml', xml: texts, overlay: true }])
    expect(c.rules.get('gadget-basics')!.text).toBe('Full immersion.')
    expect(c.amps.get('keen-eye')!.narrative).toBe('Sharp senses.')
  })
})

describe('loadCatalog fetches each source’s private texts file', () => {
  test('texts named in sources.xml are loaded from custom/', async () => {
    const { existsSync } = await import('node:fs')
    const { loadCatalog } = await import('../../src/engine/load')
    const fixtureRules = readFileSync('tests/fixtures/mini/rules.xml', 'utf8')
    const extra: Record<string, string> = {
      'data/rules.xml': fixtureRules,
      'custom/texts/qref.xml': `<ca2:data ${NS} kind="texts" version="1"><text of="rules" id="gadget-basics">Full immersion.</text></ca2:data>`,
    }
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const path = String(url).replace(/^\.\//, '')
      const body = extra[path] ?? (path.startsWith('data/') && existsSync(`public/${path}`) ? readFileSync(`public/${path}`, 'utf8') : null)
      return { ok: body != null, text: async () => body ?? '' }
    }) as typeof fetch
    try {
      const c = await loadCatalog('./')
      expect(c.rules.get('gadget-basics')!.text).toBe('Full immersion.')
      expect(c.files.some(f => f.file === 'custom/texts/qref.xml')).toBe(true)
    } finally { globalThis.fetch = real }
  })
})

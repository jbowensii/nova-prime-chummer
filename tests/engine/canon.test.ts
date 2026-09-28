// Canon tagging (sources.xml), non-canon warnings, per-source private texts and the rules reference.
import { describe, test, expect } from 'vitest'
import { isCanon, isCanonSource, nonCanonUses, specSource } from '../../src/engine/canon'
import { buildCatalog } from '../../src/engine/load'
import { characterToXml, xmlToCharacter } from '../../src/engine/charxml'
import { validate } from '../../src/engine/validate'
import { base, cat, sample } from '../helpers'

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
  test('core-book amps that came in through the expanded list stay canon', () => {
    expect(isCanon(cat, cat.amps.get('jazz')!)).toBe(true)
    expect(isCanon(cat, cat.amps.get('gun-fu')!)).toBe(false)
  })
  test('a spec carries its own source, else its skill’s', () => {
    expect(specSource(cat, 'close-combat.firearms')).toBe('DHSA')
    expect(specSource(cat, 'close-combat.blades')).toBe('CRB')
    expect(specSource(cat, 'custom:Whips')).toBeUndefined()
  })
})

describe('allow non-canon content', () => {
  const ty = sample('ty') // Close Combat (Firearms) is a DHSA spec
  test('allowed by default: no warning', () => {
    expect(validate(cat, ty).filter(v => v.code === 'content.nonCanon')).toEqual([])
  })
  test('canon only: each non-canon use is a warning', () => {
    const v = validate(cat, { ...ty, allowNonCanon: false }).filter(x => x.code === 'content.nonCanon')
    expect(v.length).toBe(nonCanonUses(cat, ty.build).length)
    expect(v.length).toBeGreaterThan(0)
    expect(v.every(x => x.severity === 'warning')).toBe(true)
  })
  test('a runner using only canon content has nothing to flag', () => {
    expect(nonCanonUses(cat, sample('hercules').build)).toEqual([])
  })
  test('the switch and origin survive the XML file', () => {
    const r = xmlToCharacter(characterToXml({ ...ty, allowNonCanon: false }))
    expect(r.ok && r.character.allowNonCanon).toBe(false)
    expect(r.ok && r.character.origin).toBe('PREGENS')
    const on = xmlToCharacter(characterToXml(ty))
    expect(on.ok && on.character.allowNonCanon).toBeUndefined()
  })
})

describe('private texts and rules', () => {
  test('rules load from the quick-reference sheets with links to amp effects', () => {
    const hot = cat.rules.get('matrix-vr-hot-sim')!
    expect(hot.title).toBe('VR hot-sim')
    expect(hot.effects).toEqual(['vr-hot'])
    expect(isCanon(cat, hot)).toBe(false)
    for (const r of cat.rules.values()) for (const e of r.effects) expect(cat.ampEffects.has(e), `${r.id} -> ${e}`).toBe(true)
  })
  test('committed data carries no rule text; a texts file fills it by id', () => {
    expect(cat.rules.get('matrix-vr-hot-sim')!.text).toBe('')
    const texts = `<ca2:data ${NS} kind="texts" version="1"><text of="rules" id="matrix-vr-hot-sim">Full immersion.</text>`
      + `<text of="amps" id="gun-fu">Martial art.</text></ca2:data>`
    const c = buildCatalog([...base, { file: 'custom/texts/qref.xml', xml: texts, overlay: true }])
    expect(c.rules.get('matrix-vr-hot-sim')!.text).toBe('Full immersion.')
    expect(c.amps.get('gun-fu')!.narrative).toBe('Martial art.')
  })
})

describe('loadCatalog fetches each source’s private texts file', () => {
  test('texts named in sources.xml are loaded from custom/', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    const { loadCatalog } = await import('../../src/engine/load')
    const extra: Record<string, string> = {
      'custom/texts/qref.xml': `<ca2:data ${NS} kind="texts" version="1"><text of="rules" id="matrix-vr-hot-sim">Full immersion.</text></ca2:data>`,
    }
    const real = globalThis.fetch
    globalThis.fetch = (async (url: string) => {
      const path = String(url).replace(/^\.\//, '')
      const body = extra[path] ?? (path.startsWith('data/') && existsSync(`public/${path}`) ? readFileSync(`public/${path}`, 'utf8') : null)
      return { ok: body != null, text: async () => body ?? '' }
    }) as typeof fetch
    try {
      const c = await loadCatalog('./')
      expect(c.rules.get('matrix-vr-hot-sim')!.text).toBe('Full immersion.')
      expect(c.files.some(f => f.file === 'custom/texts/qref.xml')).toBe(true)
    } finally { globalThis.fetch = real }
  })
})

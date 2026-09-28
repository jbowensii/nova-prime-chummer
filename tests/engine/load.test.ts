import { test, expect } from 'vitest'
import { buildCatalog } from '../../src/engine/load'
import { base, cat } from '../helpers'

test('base catalog loads without errors', () => {
  expect(cat.errors).toEqual([])
  expect(cat.levels.get('runner')!.nuyen).toBe(375000)
  expect(cat.metatypes.get('troll')!.ranges.str).toEqual([1, 6])
  expect(cat.skills.size).toBe(15) // 14 core skills + Tasking (Conversion Guide)
  expect(cat.pricing.attrLastPoint).toBe(20000)
  expect(cat.ampEffects.get('init-2')!.requires).toBe('init-1')
  expect(cat.amps.get('trick-shot-rig')!.item!.kind).toBe('weapon')
  expect(cat.items.get('light-armor')!.armor).toBe(3)
  expect(cat.items.get('nano-tape')!.kind).toBe('gear')
  expect(cat.files.length).toBe(17) // public/data minus the book catalogs, plus tests/fixtures/mini
  // duplicate names across non-canon sources (TEST, TEST2) both load fine
  expect(cat.amps.get('keen-eye')!.source).toBe('TEST')
  expect(cat.amps.get('keen-eye-2')!.source).toBe('TEST2')
})

test('overlay replaces, removes, adds by id', () => {
  const ov = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="levels" version="1">
    <level id="runner" nuyen="400000" attrAtMax="1" skillCap="5" rrAttr="1" rrSkill="1" rrSpec="2" source="CUSTOM" page="1"><name>Runner+</name></level>
    <remove id="ganger"/>
    <level id="legend" nuyen="600000" attrAtMax="3" skillCap="7" rrAttr="2" rrSkill="2" rrSpec="3" source="CUSTOM" page="1"><name>Legend</name></level>
  </ca2:data>`
  const c = buildCatalog([{ file: 'custom/levels.xml', xml: ov, overlay: true }, ...base]) // overlays apply last regardless of order
  expect(c.levels.get('runner')!.nuyen).toBe(400000)
  expect(c.levels.has('ganger')).toBe(false)
  expect(c.levels.get('legend')!.skillCap).toBe(7)
  expect(c.files.at(-1)).toMatchObject({ file: 'custom/levels.xml', overlay: true })
})

test('bad overlay is skipped and reported, base still loads', () => {
  const c = buildCatalog([...base, { file: 'broken.xml', xml: '<ca2:data', overlay: true }])
  expect(c.errors).toHaveLength(1)
  expect(c.errors[0].file).toBe('broken.xml')
  expect(c.levels.get('runner')!.nuyen).toBe(375000)
})

test('private texts merge by id; the committed data carries none', () => {
  expect([...cat.amps.values()].filter(a => a.narrative).length).toBe(0)
  expect([...cat.items.values()].filter(i => i.kind === 'spell' && i.text).length).toBe(0)
  const texts = `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="texts" version="1">
    <text of="amps" id="ares-wired-reflexes">Reflex boosters wired into the spine.</text>
    <text of="items" id="spell-heal">Heals one wound.</text></ca2:data>`
  const c = buildCatalog([...base, { file: 'custom/texts.xml', xml: texts, overlay: true }])
  expect(c.amps.get('ares-wired-reflexes')!.narrative).toBe('Reflex boosters wired into the spine.')
  expect(c.items.get('spell-heal')!.text).toBe('Heals one wound.')
})

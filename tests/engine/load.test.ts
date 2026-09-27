import { test, expect } from 'vitest'
import { buildCatalog } from '../../src/engine/load'
import { base, cat } from '../helpers'

test('base catalog loads without errors', () => {
  expect(cat.errors).toEqual([])
  expect(cat.levels.get('runner')!.nuyen).toBe(375000)
  expect(cat.metatypes.get('troll')!.ranges.str).toEqual([1, 6])
  expect(cat.skills.size).toBe(14)
  expect(cat.pricing.attrLastPoint).toBe(20000)
  expect(cat.ampEffects.get('init-2')!.requires).toBe('init-1')
  expect(cat.amps.get('ares-predator-iv-heavy-pistol')!.item!.kind).toBe('weapon')
  expect(cat.items.get('light-armor')!.armor).toBe(3)
  expect(cat.files.length).toBe(14)
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

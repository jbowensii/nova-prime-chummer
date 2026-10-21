import { test, expect } from 'vitest'
import { itemChange } from '../../../src/ca2/runner-builder/ui/Receipt'
import type { ItemEntry } from '../../../src/ca2/formats/domain/types'
import { cat } from '../../helpers'

test('an item change says what it cost or gave back; free gear and renames say nothing', () => {
  const sin: ItemEntry = { uid: 's', kind: 'gear', name: 'Fake SIN', starting: 'fake-sin' }
  const extra: ItemEntry = { uid: 'x', kind: 'gear', name: 'Extra Fake SIN' }
  const gun: ItemEntry = { uid: 'g', kind: 'weapon', name: 'Made-up pistol' }
  const e = cat.pricing.equipment.toLocaleString('en-US'),
    w = cat.pricing.weaponStandard.toLocaleString('en-US')
  expect(itemChange(cat.pricing, [sin, extra], [sin])).toBe(`−${e}¥: Extra Fake SIN removed`)
  expect(itemChange(cat.pricing, [sin], [sin, gun])).toBe(`+${w}¥: Made-up pistol added`)
  expect(itemChange(cat.pricing, [sin, extra], [{ ...sin, name: 'Fake SIN: Jane Roe' }, gun])).toBe(
    `+${w}¥: Made-up pistol added; −${e}¥: Extra Fake SIN removed`,
  )
  expect(itemChange(cat.pricing, [sin], [{ ...sin, name: 'Renamed' }])).toBe('')
})

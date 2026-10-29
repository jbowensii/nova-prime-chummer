// House rule: no Essence Hole. Essence is the starting Essence minus the CURRENT augmentations' Essence, so removing
// an augmentation (creation or career) gives it back, and the Magic it took with it.
import { expect, test } from 'vitest'
import { essenceBudget } from '../../../src/sr6/runner-builder/domain/creation/essence'
import type { Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { n0 } from '../../../src/sr6/table-setup/domain/creation'
import { buildOf, GLIM, made } from '../catalog/fixture'

test('removing an augmentation returns its Essence and Magic loss in full', () => {
  const { data, cr } = made()
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  const full = essenceBudget(b, data, cr)
  expect(full.left).toBe(n0(cr, 'essence'))
  const aug: Sr6Purchase = { uid: 'a', kind: 'augmentations', id: 'crb.glow-eyes.1', qty: 1, accessories: [] }
  b.purchases.push(aug)
  expect(essenceBudget(b, data, cr).left).toBeLessThan(full.left)
  b.purchases = b.purchases.filter(x => x.uid !== 'a')
  expect(essenceBudget(b, data, cr)).toEqual(full)
})

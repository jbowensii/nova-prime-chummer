// Ammunition never stacks (src/sr6/runner-builder/domain/creation/actions.ts 'purchase'): each Add is a new line so each can fit its own ammo type.
// Other gear still stacks. Made-up fixture entries.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { entryOf } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made } from '../catalog/fixture'

test('adding the same ammunition twice makes two lines; non-ammo gear still stacks', () => {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const { data, cr } = made({
    data: d => {
      const e = entryOf({ uid: 'x', kind: 'gear', id: 'crb.zap-pellets', qty: 1, accessories: [] }, d)
      e!.attrs.category = 'Ammo by weapon' // ponytail: reuses a fixture gear entry as ammo rather than adding a fixture
    },
  })
  const b = ch.build
  const add = (id: string) => apply(b, { op: 'purchase', kind: 'gear', id }, data, cr)
  add('crb.zap-pellets')
  add('crb.zap-pellets')
  expect(b.purchases.map(x => x.qty)).toEqual([1, 1])
  add('crb.zap-scope')
  add('crb.zap-scope')
  expect(b.purchases.filter(x => x.id === 'crb.zap-scope').map(x => x.qty)).toEqual([2])
})

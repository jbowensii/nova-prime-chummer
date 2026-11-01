import { expect, test } from 'vitest'
import { gearGroupOf } from '../../../src/sr6/catalog/domain/categories'

const g = (category: string, cls = '') => gearGroupOf({ kind: 'gear', id: 'x', name: 'x', attrs: { category, class: cls } } as never)

test.each([
  ['Explosive', 'AMMUNITION/EXPLOSIVES', 'Explosives'],
  ['Rocket and missile', 'AMMUNITION/ROCKETS', 'Rockets & missiles'],
  ['Grenade', 'AMMUNITION/GRENADES', 'Grenades'],
  ['Ballistic ammunition', '', 'Ammunition'],
  ['Ammo by weapon type', '', 'Ammunition'],
  ['Drug &amp; toxin', '', 'Medical, drugs & chemicals'],
  ['Commlink app', '', 'Software & Matrix'],
  ['Commlink', '', 'Electronics & commlinks'],
  ['Colony & nanite', '', 'Biotech & nanotech'],
  ['Foci', '', 'Magic supplies & foci'],
  ['Preparation', '', 'Magic supplies & foci'],
  ['Breaking and entering gear', '', 'Security, B&E & espionage'],
  ['Survival gear', '', 'Survival, tools & clothing'],
  ['Chassis mod', '', 'Vehicle & drone parts'],
  ['Something new', '', 'Miscellaneous gear'],
])('%s -> %s', (category, cls, group) => {
  expect(g(category, cls)).toBe(group)
})

test('a detonator cap is filed under detonators', () => {
  expect(gearGroupOf({ kind: 'gear', id: 'x', name: 'Detonator Cap', attrs: { category: 'Explosive', class: 'AMMUNITION/EXPLOSIVES' } } as never)).toBe(
    'Detonators & triggers',
  )
})

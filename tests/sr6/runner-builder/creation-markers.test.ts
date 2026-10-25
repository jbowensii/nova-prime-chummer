import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { contactLoyalty, effectiveAvailability, martialCreationKarma } from '../../../src/sr6/runner-builder/domain/creation/rule-markers'
import { contactPoints } from '../../../src/sr6/runner-builder/domain/creation/contacts'
import { contactSpend, makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { martialKarma, techniqueKarma } from '../../../src/sr6/runner-builder/domain/creation/martial'
import { nuyenBudget } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/purchases'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { priceAt } from '../../../src/sr6/runner-builder/ui/Picker'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

function world(ref: string) {
  const c = fixtureCatalog()
  c.entries.qualities.set('test.marker', {
    id: 'test.marker',
    kind: 'qualities',
    name: 'Marker',
    source: 'CRB',
    page: 1,
    attrs: { kind: 'positive', karma: '0' },
    text: '',
    parts: [{ tag: 'modifier', attrs: { kind: 'itemmod', type: 'RULE', ref }, text: '' }],
  })
  const data = sr6Data(c),
    cr = fixtureCreation()
  const ch = blankSr6('priority', 'marker', '2026-10-09T10:00:00.000Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  const b = ch.build
  const activate = () => b.qualities.push({ uid: 'q', id: 'test.marker', level: 1 })
  return { c, data, cr, ch, b, activate }
}

test('Fast Friend derives capped effective Loyalty without charging the free point or applying it twice', () => {
  const { b, ch, data, cr, activate } = world('CONTACTS_START_LOYAL2')
  b.attributes.cha.points = 2
  expect(contactLoyalty(b, data, 1, 3)).toBe(1)
  expect(apply(b, { op: 'contact' }, data, cr).ok).toBe(true)
  const p = makeProvider(b.method, data, cr)
  const before = contactPoints(b, data, cr, p)
  activate()
  expect(contactLoyalty(b, data, b.contacts[0].loyalty, 3)).toBe(2)
  expect(contactLoyalty(b, data, 3, 3)).toBe(3)
  expect(contactLoyalty(b, data, 1, 3)).toBe(2)
  expect(b.contacts[0].loyalty).toBe(1)
  expect(contactSpend(b)).toBe(2)
  expect(contactPoints(b, data, cr, p)).toEqual(before)
  cr.set('expandedContacts', { key: 'expandedContacts', value: true })
  cr.set('contactKarma', { key: 'contactKarma', value: 1 })
  cr.set('contactPairPerCha', { key: 'contactPairPerCha', value: 0 })
  expect(contactPoints(b, data, cr, p).karma).toBe(2)
  b.attributes.cha.points = 0
  expect(validateSr6(data, cr, ch).some(v => v.code === 'contact.fastFriendCharisma')).toBe(true)
  b.attributes.cha.points = 1
  expect(validateSr6(data, cr, ch).some(v => v.code === 'contact.fastFriendCharisma')).toBe(false)
})

test('Event Horizon uses effective Availability in review and UI, preserving catalog legality and raw pricing', () => {
  const { b, ch, data, cr, activate } = world('DECREASE_AVAILABILITY_2')
  b.purchases.push({ uid: 'item', kind: 'gear', qty: 1, cost: 0, avail: 7, accessories: [] })
  cr.set('maxAvailability', { key: 'maxAvailability', value: 5 })
  expect(effectiveAvailability(b, data, 7)).toBe(7)
  expect(validateSr6(data, cr, ch).some(v => v.code === 'gear.availCap')).toBe(true)
  activate()
  expect(effectiveAvailability(b, data, 7)).toBe(5)
  expect(effectiveAvailability(b, data, 0)).toBe(0) // floor at 0: a freely available item is never made harder to get
  expect(effectiveAvailability(b, data, 2)).toBe(0)
  expect(validateSr6(data, cr, ch).some(v => v.code === 'gear.availCap')).toBe(false)
  expect(priced(b.purchases[0], data, cr).avail).toBe(7)
  const e = { id: 'test.item', kind: 'gear' as const, name: 'Item', source: 'CRB', page: 1, attrs: { avail: '7(I)', cost: '0' }, text: '', parts: [] }
  expect(priceAt(e, 1, cr, undefined, data, b).avail).toBe('5(I)')
  expect(e.attrs.avail).toBe('7(I)')
})

test('Martial Arts Prodigy discounts each paid style and technique, floors at zero, and leaves signatures free', () => {
  const { b, data, cr, activate } = world('MARTIAL_ARTS_PRODIGY')
  b.martialArts = [
    {
      uid: 's',
      id: 'crb.glow-fist',
      techniques: [
        { uid: 'sig', id: 'crb.glow-jab' },
        { uid: 'paid', id: 'test.technique', name: 'Other' },
      ],
    },
  ]
  expect(martialKarma(b, data, cr)).toBe(12)
  activate()
  expect(martialKarma(b, data, cr)).toBe(8)
  expect(techniqueKarma(data, cr, b.martialArts[0], b.martialArts[0].techniques[0], b)).toBe(0)
  expect(martialCreationKarma(b, data, 1)).toBe(0)
  cr.set('karmaMartialArt', { key: 'karmaMartialArt', value: 1 })
  cr.set('karmaTechnique', { key: 'karmaTechnique', value: 1 })
  expect(martialKarma(b, data, cr)).toBe(0)
})

test('Fashion Influencer halves only fashion-slot armor, as its own gain line', () => {
  const { c, b, data, cr, activate } = world('FASHION_50_PERCENT')
  const armor = (id: string, slots: object[]) =>
    c.entries.armor.set(id, { id, kind: 'armor', name: id, source: 'CRB', page: 1, attrs: { cost: '1000' }, text: '', parts: slots as never })
  armor('t.suit', [{ tag: 'slot', attrs: { id: 'fashion' }, text: '' }])
  armor('t.rags', [])
  b.purchases.push(
    { uid: 'a', kind: 'armor', id: 't.suit', qty: 1, accessories: [] } as never,
    { uid: 'c', kind: 'armor', id: 't.rags', qty: 1, accessories: [] } as never,
  )
  const budget = () => nuyenBudget(b, data, cr, makeProvider(b.method, data, cr))
  const line = () => budget().breakdown.find(l => l.key === 'fashionInfluencer')
  const leftBefore = budget().left
  expect(line()).toBeUndefined()
  activate()
  expect(line()).toMatchObject({ amount: 500, sign: 'gain' }) // half the 1000¥ suit; the 1000¥ rags (no fashion slot) aren't discounted
  // the discount is real nuyen back in the pool, not just a display line: available nuyen rises by exactly the discount
  expect(budget().left - leftBefore).toBe(500)
})

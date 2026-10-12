// Categories (src/sr6/engine/categories.ts) on the made-up fixture: a bare part shown with its category, searched by its
// composed names; an accessory category fits its host's exact category (or kind); the accessory action refuses another
// host's accessory; Review flags an accessory on the wrong host and accessories over the host's capacity.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { capacityOf, capacityUsed, entryLabel, entrySearch, fitsHost } from '../../src/sr6/engine/categories'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { priced } from '../../src/sr6/engine/budgets'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, made, STONE } from './fixture'

function setup() {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE })
  ch.identity.metatype = STONE
  const { data, cr } = made()
  return { ch, b: ch.build, data, cr, act: (op: Parameters<typeof apply>[1]) => apply(ch.build, op, data, cr) }
}

test('a bare part shows its category; the printed name stays the name; search finds the composed names', () => {
  const { data } = setup()
  const limb = data.entry('augmentations', 'crb.limb-synthetic')!
  expect(limb.name).toBe('Limb (synthetic)')
  expect(entryLabel(limb)).toBe('Torqlimb: Limb (synthetic)')
  expect(entrySearch(limb)).toContain('Torqlimb Limb (synthetic)')
  expect(entrySearch(limb)).toContain('Synthetic torqlimb')
  expect(entryLabel(data.entry('augmentations', 'crb.glow-eyes')!)).toBe('Glow Eyes') // a named item: as printed
})

test('an accessory fits its host category exactly, or its kind by the kind’s word', () => {
  const { data } = setup()
  const e = (k: Parameters<typeof data.entry>[0], id: string) => data.entry(k, id)!
  const limb = e('augmentations', 'crb.limb-synthetic'),
    eyes = e('augmentations', 'crb.glow-eyes'),
    gun = e('weapons', 'crb.zap-gun')
  expect(fitsHost(data.categories, e('augmentations', 'crb.plating'), limb)).toBe(true)
  expect(fitsHost(data.categories, e('augmentations', 'crb.plating'), eyes)).toBe(false)
  expect(fitsHost(data.categories, e('augmentations', 'crb.glare-filter'), limb)).toBe(false)
  expect(fitsHost(data.categories, e('gear', 'crb.zap-scope'), gun)).toBe(true) // fits "Weapon": every weapon
  expect(fitsHost(data.categories, e('gear', 'crb.zap-scope'), limb)).toBe(false)
  expect(fitsHost(data.categories, eyes, limb)).toBeNull() // no accessory: nothing to check
  expect([capacityOf(limb), capacityUsed(e('augmentations', 'crb.plating'), 3), capacityUsed(e('augmentations', 'crb.glare-filter'))]).toEqual([6, 3, 2])
})

test('another host’s accessory is fitted, an error a GM may approve; Review flags a host over capacity', () => {
  const { b, data, cr, ch, act } = setup()
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })).toEqual({ ok: true })
  const limb = b.purchases[0]
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })).toEqual({ ok: true })
  const codes = () => validateSr6(data, cr, ch).filter(v => v.code.startsWith('catalog.') && v.code !== 'catalog.formula')
  expect(codes()).toEqual([]) // 3 + 3 of 6
  // the eyeware's glare filter on the limb: fitted (it takes 2 more capacity)
  expect(act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.glare-filter' })).toEqual({ ok: true })
  const v = codes()
  expect(v.map(x => x.code).sort()).toEqual(['catalog.accessoryHost', 'catalog.capacity'])
  expect(v.find(x => x.code === 'catalog.accessoryHost')).toMatchObject({
    severity: 'error',
    source: 'CRB',
    page: 283,
    path: `augmentations.${limb.uid}`,
    message: 'Eyeware accessory: Glare filter is for Eyeware, not Torqlimb: Limb (synthetic).',
  })
  expect(v.find(x => x.code === 'catalog.capacity')!.message).toBe('Torqlimb: Limb (synthetic): its accessories take 8 capacity; it has 6.')
  // fitted into the host's capacity, an accessory costs no Essence of its own (the glare filter's 0.1: the limb's 1 alone)
  expect(priced(limb, data, cr).essence).toBe(1)
  ch.overrides = [{ code: 'catalog.accessoryHost', path: `augmentations.${limb.uid}`, note: 'GM ok' }]
  expect(codes().find(x => x.code === 'catalog.accessoryHost')?.approved).toBe(true)
})

test('an accessory’s bonuses are its host’s: the limb’s own STR and armor change, the runner’s attributes don’t', () => {
  const { b, data, cr, ch, act } = setup()
  act({ op: 'purchase', kind: 'augmentations', id: 'crb.limb-synthetic' })
  const limb = b.purchases[0]
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 2 })
  const plate = limb.accessories[0]
  const before = deriveSr6(data, cr, ch)
  expect(
    act({
      op: 'bonus',
      uid: plate.uid,
      bonuses: [
        { target: 'str', value: 2 },
        { target: 'defense', value: 1, perRating: true },
      ],
    }),
  ).toEqual({ ok: true })
  const d = deriveSr6(data, cr, ch)
  expect(d.attrs.str).toEqual(before.attrs.str) // the runner's Strength: unchanged
  expect(d.defenseRating).toBe(before.defenseRating)
  expect(d.hosts).toEqual([
    {
      uid: limb.uid,
      name: 'Torqlimb: Limb (synthetic)',
      values: [
        { target: 'str', value: before.attrs.str.natural + 2 },
        { target: 'defense', value: 2 },
      ],
      text: `STR ${before.attrs.str.natural + 2}, Armor +2`,
    },
  ])
  // a bonus on the line itself is still the runner's
  act({ op: 'bonus', uid: limb.uid, bonuses: [{ target: 'str', value: 1 }] })
  expect(deriveSr6(data, cr, ch).attrs.str.augmented).toBe(before.attrs.str.augmented + 1)
  // over its capacity: a Review error
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })
  act({ op: 'accessory', host: limb.uid, kind: 'augmentations', id: 'crb.plating', rating: 3 })
  expect(validateSr6(data, cr, ch).find(v => v.code === 'catalog.capacity')).toMatchObject({
    severity: 'error',
    message: 'Torqlimb: Limb (synthetic): its accessories take 8 capacity; it has 6.',
  })
})

// A hand-edited runner file's negative numbers (src/sr6/runner-builder/domain/review/rules.ts value.negative): the file still reads, Review
// flags each one, and no GM can approve it, so a crafted negative can't turn an overspend into a refund and Finalize.
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { canFinalizeSr6, validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { buildOf, made, STONE } from '../catalog/fixture'

function runner(): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE, magic: 'mundane' })
  return ch
}
const check = (ch: Sr6Character) => {
  const { data, cr } = made({ unset: ['maxKarmaLeft', 'maxNuyenLeft'] })
  return validateSr6(data, cr, ch)
}

test('a negative quantity that cancels an overspend reads, is flagged hard, and still blocks Finalize', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'p1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 8, accessories: [] })
  expect(check(ch).map(v => v.code)).toContain('nuyen.overspent')
  ch.build.purchases.push({ uid: 'p2', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: -8, accessories: [] })
  ch.build.attributes.bod.karma = -3
  // the file round-trips with the negatives as written
  const read = xmlToSr6(sr6ToXml(ch))
  if (!read.ok) throw new Error(read.reason)
  ch.overrides = [
    { code: 'value.negative', path: 'gear.p2', note: 'no' },
    { code: 'value.negative', path: 'attributes.bod', note: 'no' },
  ]
  read.character.overrides = ch.overrides
  const v = check(read.character)
  expect(v.map(x => x.code)).not.toContain('nuyen.overspent')
  expect(v.filter(x => x.code === 'value.negative').map(x => [x.path, x.message, !!x.hard, !!x.approved])).toEqual([
    ['attributes.bod', 'karma is -3; it can’t be below 0.', true, false],
    ['gear.p2', 'qty is -8; it can’t be below 0.', true, false],
  ])
  expect(canFinalizeSr6(v)).toBe(false)
})

test('a negative karmaToDeck is flagged hard, like its sibling creation-spend counters', () => {
  const ch = runner()
  ch.build.karmaToDeck = -1
  const v = check(ch).filter(x => x.code === 'value.negative')
  expect(v.map(x => [x.path, x.message, !!x.hard])).toContainEqual(['method', 'karmaToDeck is -1; it can’t be below 0.', true])
})

test('a legal runner has no negative-number errors; a negative bonus value is fine', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'p1', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [], bonuses: [{ target: 'initiative', value: -1 }] })
  expect(check(ch).filter(v => v.code === 'value.negative')).toEqual([])
})

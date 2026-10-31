// Character prerequisites (src/sr6/runner-builder/domain/creation/prereq.ts): each requirement kind, on made-up entries.
import { expect, test } from 'vitest'
import { toEntry } from '../../../src/sr6/formats/domain/entryxml'
import { characterRequirements } from '../../../src/sr6/runner-builder/domain/creation/prereq'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { buildOf, made, STONE } from '../catalog/fixture'

const NS = 'urn:chummer-sr6:data:1'
const item = (prereqs: string) =>
  toEntry(
    new DOMParser()
      .parseFromString(
        `<sr6:data xmlns:sr6="${NS}" kind="qualities" version="1"><quality id="zz.q" source="ZZ" page="1"><name>Zed</name>${prereqs}</quality></sr6:data>`,
        'text/xml',
      )
      .getElementsByTagName('quality')[0],
    'qualities',
  )
function run(prereqs: string, tweak: (b: ReturnType<typeof buildOf>) => void = () => {}, rating = 1) {
  const { data, cr } = made()
  const b = buildOf('priority', { letters: 'ACDBE', metatype: STONE, magic: 'mundane' })
  tweak(b)
  return characterRequirements(item(prereqs), { data, cr, b, p: makeProvider(b.method, data, cr) }, rating)
}

test('metatype and magic type: alternatives, the runner has one of each', () => {
  const t =
    '<prerequisite kind="datareq" type="METATYPE" ref="human" apply="CHARACTER"/><prerequisite kind="datareq" type="METATYPE" ref="stonefolk" apply="CHARACTER"/>'
  expect(run(t).failed).toEqual([])
  expect(run('<prerequisite kind="datareq" type="METATYPE" ref="human" apply="CHARACTER"/>').failed).toHaveLength(1)
  const m =
    '<prerequisite kind="datareq" type="MAGIC_RESO" ref="adept" apply="CHARACTER"/><prerequisite kind="datareq" type="MAGIC_RESO" ref="mysticadept" apply="CHARACTER"/>'
  expect(run(m).failed).toEqual(['adept magic type or mysticadept magic type'])
  expect(run(m, b => (b.magic = 'adept')).failed).toEqual([])
})

test('quality and negated quality', () => {
  const q = '<prerequisite kind="datareq" type="QUALITY" ref="made_up_power" apply="CHARACTER"/>'
  expect(run(q).failed).toHaveLength(1)
  expect(run(q.replace('/>', ' negate="true"/>')).failed).toEqual([])
})

test('grouped tests hold when any does; unknown tests are listed, not failed', () => {
  const g = (r: string) => `<prerequisite kind="datareq" type="QUALITY" ref="${r}" group="1" apply="CHARACTER"/>`
  expect(run(g('aa') + g('bb')).failed).toEqual(['quality aa or quality bb'])
  expect(run('<prerequisite kind="datareq" type="GEAR" ref="CHOICE" choice="x" apply="CHARACTER"/>')).toMatchObject({
    failed: [],
    unchecked: [expect.any(String)],
  })
})

test('metamagic/echo, adept power and complex form picks', () => {
  for (const [type, kind] of [
    ['METAECHO', 'metamagics'],
    ['ADEPT_POWER', 'adeptpowers'],
    ['COMPLEX_FORM', 'complexforms'],
  ] as const) {
    const t = `<prerequisite kind="datareq" type="${type}" ref="nothing_here" apply="CHARACTER"/>`
    expect(run(t).failed).toHaveLength(1)
    const { data } = made()
    expect(data.entry(kind, 'crb.nope')).toBeUndefined() // (a pick that names itself satisfies it)
    expect(run(t, b => b.picks.push({ uid: 'k', kind, id: 'x', name: 'Nothing Here' })).failed).toEqual([])
  }
})

test('attribute minimum, Essence ceiling and rating, skill rank', () => {
  expect(run('<prerequisite kind="valuereq" type="ATTRIBUTE" ref="STRENGTH" value="9" apply="CHARACTER"/>').failed).toEqual(['strength at least 9'])
  expect(run('<prerequisite kind="valuereq" type="ATTRIBUTE" ref="STRENGTH" value="1" apply="CHARACTER"/>').failed).toEqual([])
  expect(run('<prerequisite kind="valuereq" type="ATTRIBUTE" ref="BODY" value="$RATING" apply="CHARACTER"/>', () => {}, 9).failed).toHaveLength(1)
  // Essence ceiling: a fresh runner has the table's full Essence, above 0.5
  expect(run('<prerequisite kind="valuereq" type="ATTRIBUTE" ref="ESSENCE" apply="CHARACTER" max="500"/>').failed).toHaveLength(1)
  const sk = '<prerequisite kind="valuereq" type="SKILL" ref="influence" value="4" apply="CHARACTER"/>'
  expect(run(sk).failed).toEqual(['influence rank 4'])
  expect(run(sk, b => b.skills.push({ id: 'influence', points: 4, karma: 0 })).failed).toEqual([])
})

test('owned gear', () => {
  const t = '<prerequisite kind="datareq" type="GEAR" ref="skillwires" apply="CHARACTER"/>'
  expect(run(t).failed).toHaveLength(1)
  expect(run(t, b => b.purchases.push({ uid: 'p', kind: 'augmentations', qty: 1, accessories: [], name: 'Skillwires' })).failed).toEqual([])
})

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
    '<prerequisite kind="datareq" type="METATYPE" ref="glimmerkin" apply="CHARACTER"/><prerequisite kind="datareq" type="METATYPE" ref="stonefolk" apply="CHARACTER"/>'
  expect(run(t).failed).toEqual([])
  expect(run('<prerequisite kind="datareq" type="METATYPE" ref="glimmerkin" apply="CHARACTER"/>').failed).toHaveLength(1)
  const m =
    '<prerequisite kind="datareq" type="MAGIC_RESO" ref="adept" apply="CHARACTER"/><prerequisite kind="datareq" type="MAGIC_RESO" ref="mysticadept" apply="CHARACTER"/>'
  expect(run(m).failed).toEqual(['adept magic type or mysticadept magic type'])
  expect(run(m, b => (b.magic = 'adept')).failed).toEqual([])
})

test('quality and negated quality', () => {
  const q = '<prerequisite kind="datareq" type="QUALITY" ref="knack" apply="CHARACTER"/>'
  expect(run(q).failed).toHaveLength(1)
  expect(run(q, b => b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })).failed).toEqual([])
  expect(run(q.replace('/>', ' negate="true"/>')).failed).toEqual([])
})

test('grouped tests hold when any does; unknown tests are listed, not failed', () => {
  const g = (r: string) => `<prerequisite kind="datareq" type="QUALITY" ref="${r}" group="1" apply="CHARACTER"/>`
  expect(run(g('knack') + g('stoneskin')).failed).toEqual(['quality knack or quality stoneskin'])
  expect(run('<prerequisite kind="datareq" type="GEAR" ref="CHOICE" choice="x" apply="CHARACTER"/>')).toMatchObject({
    failed: [],
    unchecked: [expect.any(String)],
  })
})

test('metamagic/echo, adept power and complex form picks', () => {
  for (const [type, kind, ref, id] of [
    ['METAECHO', 'metamagics', 'soft_echo', 'crb.soft-echo'],
    ['ADEPT_POWER', 'adeptpowers', 'quick_step', 'crb.quick-step'],
    ['COMPLEX_FORM', 'complexforms', 'static_veil', 'crb.static-veil'],
  ] as const) {
    const t = `<prerequisite kind="datareq" type="${type}" ref="${ref}" apply="CHARACTER"/>`
    expect(run(t).failed).toHaveLength(1)
    expect(run(t, b => b.picks.push({ uid: 'k', kind, id })).failed).toEqual([])
  }
  // an adept power's level (valuereq)
  const lv = '<prerequisite kind="valuereq" type="ADEPT_POWER" ref="quick_step" value="2" apply="CHARACTER"/>'
  expect(run(lv, b => b.picks.push({ uid: 'k', kind: 'adeptpowers', id: 'crb.quick-step', level: 1 })).failed).toHaveLength(1)
  expect(run(lv, b => b.picks.push({ uid: 'k', kind: 'adeptpowers', id: 'crb.quick-step', level: 2 })).failed).toEqual([])
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
  const t = '<prerequisite kind="datareq" type="GEAR" ref="tangle_rope" apply="CHARACTER"/>'
  expect(run(t).failed).toHaveLength(1)
  expect(run(t, b => b.purchases.push({ uid: 'p', kind: 'gear', qty: 1, accessories: [], name: 'Tangle Rope' })).failed).toEqual([])
})

test('a reference naming nothing in the catalog is listed unchecked, never failed', () => {
  const r = run(
    '<prerequisite kind="datareq" type="QUALITY" ref="spirit_affinity" apply="CHARACTER"/><prerequisite kind="datareq" type="GEAR" ref="makarov22" apply="CHARACTER"/>',
  )
  expect(r.failed).toEqual([])
  expect(r.unchecked).toHaveLength(2)
})

test("a reference by Commlink6 id finds the entry that carries it (cl6=), whatever the entry's name", () => {
  const t = '<prerequisite kind="datareq" type="QUALITY" ref="zz_knack_id" apply="CHARACTER"/>'
  const take = (b: ReturnType<typeof buildOf>) => b.qualities.push({ uid: 'q', id: 'crb.knack', level: 1 })
  expect(run(t).failed).toEqual([]) // (no entry carries it: can't be told, never a false error)
  const { data, cr } = made({ data: d => (d.entry('qualities', 'crb.knack')!.attrs.cl6 = 'zz_knack_id') })
  const b = buildOf('priority', { letters: 'ACDBE', metatype: STONE, magic: 'mundane' })
  const p = makeProvider(b.method, data, cr)
  expect(characterRequirements(item(t), { data, cr, b, p }).failed).toHaveLength(1)
  take(b)
  expect(characterRequirements(item(t), { data, cr, b, p }).failed).toEqual([])
})

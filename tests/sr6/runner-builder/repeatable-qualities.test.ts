// A repeatable quality (its text lets it be taken more than once, `multi="true"`) is taken again for another choice, each
// copy its own line; a leveled one (Matrix Attribute Advancement) is one line per choice, each with its own level; the same
// choice twice and a second copy of a non-repeatable quality are refused. The qualities here are made up.
import { expect, test } from 'vitest'
import { apply, type Op } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const MORE = `<quality id="crb.net-boost" source="CRB" page="82" kind="positive" karma="15" perLevel="true" maxLevel="3" multi="true"><name>Net Boost</name><text/></quality>
  <quality id="crb.pet-combo" source="CRB" page="82" kind="positive" karma="10" multi="true"><name>Pet Combo</name><text/></quality>
  <quality id="crb.lone-wolf" source="CRB" page="82" kind="positive" karma="10"><name>Lone Wolf</name><text/></quality>`
const data = sr6Data(fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${MORE}\n</sr6:data>`) : x)))
const cr = fixtureCreation()
for (const [key, value] of Object.entries({ attributeMaxFloor: 3 } as Record<string, CreationValue>)) cr.set(key, { key, value, source: 'CRB', page: 99 })
const ch = () => {
  const c = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  c.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  return c
}
const act = (c: ReturnType<typeof ch>, op: Op) => apply(c.build, op, data, cr)
const no = (reason: string) => ({ ok: false, reason })

test('a leveled repeatable quality: one line per choice, each its own level; the same choice refused', () => {
  const c = ch()
  expect(act(c, { op: 'quality', id: 'crb.net-boost' }).ok).toBe(true)
  const first = c.build.qualities[0]
  expect(act(c, { op: 'quality', id: 'crb.net-boost', uid: first.uid, note: 'Attack' }).ok).toBe(true)
  expect(act(c, { op: 'quality', id: 'crb.net-boost', note: 'Sleaze' }).ok).toBe(true)
  expect(c.build.qualities).toHaveLength(2)
  const second = c.build.qualities[1]
  expect(second.note).toBe('Sleaze')
  expect(act(c, { op: 'quality', id: 'crb.net-boost', uid: second.uid, level: 2 }).ok).toBe(true)
  expect(c.build.qualities.map(q => [q.note, q.id])).toEqual([
    ['Attack', 'crb.net-boost.1'],
    ['Sleaze', 'crb.net-boost.2'],
  ])
  // the same attribute again is refused, on a new line or by renaming a line
  expect(act(c, { op: 'quality', id: 'crb.net-boost', note: 'attack' })).toEqual(no('duplicate-choice'))
  expect(act(c, { op: 'quality', id: 'crb.net-boost', uid: second.uid, note: 'Attack' })).toEqual(no('duplicate-choice'))
})

test('a repeatable quality without levels is taken again; a non-repeatable one is refused twice', () => {
  const c = ch()
  expect(act(c, { op: 'quality', id: 'crb.pet-combo' }).ok).toBe(true)
  expect(act(c, { op: 'quality', id: 'crb.pet-combo' })).toEqual(no('duplicate-choice'))
  act(c, { op: 'quality', id: 'crb.pet-combo', uid: c.build.qualities[0].uid, note: 'A+B' })
  expect(act(c, { op: 'quality', id: 'crb.pet-combo' }).ok).toBe(true)
  expect(c.build.qualities).toHaveLength(2)
  expect(act(c, { op: 'quality', id: 'crb.lone-wolf' }).ok).toBe(true)
  expect(act(c, { op: 'quality', id: 'crb.lone-wolf' })).toEqual(no('already-taken'))
})

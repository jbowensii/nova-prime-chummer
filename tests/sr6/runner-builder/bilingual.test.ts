// Bilingual (owner ruling 2026-11-03): one free Native language; a second only with a BILINGUAL-marked quality.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'

function run(bilingual: boolean) {
  const c = fixtureCatalog(),
    b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  c.entries.qualities.set('gm.bilingual', {
    id: 'gm.bilingual',
    kind: 'qualities',
    name: 'Bilingual',
    source: 'GM',
    page: 1,
    attrs: { kind: 'positive', karma: '5' },
    text: '',
    parts: [{ tag: 'modifier', attrs: { kind: 'itemmod', type: 'RULE', ref: 'BILINGUAL' }, text: '' }],
  })
  if (bilingual) b.qualities.push({ uid: 'qb', id: 'gm.bilingual', level: 1 })
  const data = sr6Data(c),
    cr = fixtureCreation()
  return (name: string) => apply(b, { op: 'knowledge', name, kind: 'language', native: true }, data, cr)
}

test('without Bilingual a second Native language is refused', () => {
  const native = run(false)
  expect(native('English')).toEqual({ ok: true })
  expect(native('Elvish')).toEqual({ ok: false, reason: 'one-native' })
})

test('with Bilingual exactly two Native languages are allowed', () => {
  const native = run(true)
  expect(native('English')).toEqual({ ok: true })
  expect(native('Elvish')).toEqual({ ok: true })
  expect(native('Sperethiel')).toEqual({ ok: false, reason: 'one-native' })
})

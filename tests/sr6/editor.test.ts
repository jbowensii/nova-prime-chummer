// The SR6 editor's step (src/sr6/ui/editor.ts runAct): an allowed action gives the changed runner and leaves the old one
// alone; a refused one gives the engine's reason as a plain sentence. Made-up fixture data.
import { expect, test } from 'vitest'
import { REASONS, reasonText, runAct } from '../../src/sr6/ui/editor'
import { blankSr6 } from '../../src/sr6/model/character'
import { made } from './fixture'

test('a refusal comes back as a sentence', () => {
  const { data, cr } = made(), ch = blankSr6()
  const r = runAct(ch, { op: 'attribute', target: 'bod', pool: 'points', delta: -1 }, data, cr)
  expect(r).toEqual({ error: 'Can’t go below zero.' })
  expect(reasonText('free-trait')).toBe('A metatype trait can’t be removed.')
  expect(reasonText('some-new-code')).toBe('Some new code.') // a code without its own sentence still reads
  for (const s of Object.values(REASONS)) expect(s).toMatch(/^[A-Z].*\.$/)
})

test('an allowed step changes a copy', () => {
  const { data, cr } = made(), ch = blankSr6()
  const r = runAct(ch, { op: 'attribute', target: 'bod', pool: 'points', delta: 2 }, data, cr)
  expect('ch' in r && r.ch.build.attributes.bod.points).toBe(2)
  expect(ch.build.attributes.bod.points).toBe(0)
})

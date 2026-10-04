// The SR6 editor's step (src/sr6/ui/editor.ts runAct): an allowed action gives the changed runner and leaves the old one
// alone; a refused one gives the engine's reason as a plain sentence. Made-up fixture data.
import { expect, test } from 'vitest'
import { REASONS, reasonText, runAct } from '../../src/sr6/ui/editor'
import { priceAt } from '../../src/sr6/ui/Picker'
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

test('the picker prices an item at the rating and grade picked', () => {
  const { data, cr } = made(), box = data.entry('electronics', 'crb.buzz-box')!
  expect(priceAt(box, 3)).toEqual({ cost: '450¥', avail: '3', essence: '' })
  expect(priceAt({ ...box, attrs: { ...box.attrs, cost: '12x' } }, 3).cost).toBe('?') // a cost the app can't read
  const eyes = data.entry('augmentations', 'crb.glow-eyes')!
  expect(priceAt(eyes, 2)).toEqual({ cost: '1,000¥', avail: '3', essence: '0.2' })
  expect(priceAt(eyes, 2, cr, 'alpha')).toEqual({ cost: '1,500¥', avail: '6', essence: '0.14' })
  expect(priceAt(data.entry('weapons', 'crb.fizz-rifle-70')!, 1).avail).toBe('4(L)')
})

test('every career refusal has a sentence; an unset setting names itself and where to set it', async () => {
  const src = (await import('node:fs')).readFileSync('src/sr6/engine/career.ts', 'utf8')
  const codes = new Set([...src.matchAll(/no\('([a-z-]+)'\)|reason: '([a-z-]+)'/g)].map(m => m[1] ?? m[2]))
  expect(codes.size).toBeGreaterThan(15)
  for (const code of codes) expect(REASONS[code], code).toBeDefined()
  expect(reasonText('not-latest')).toBe('Only the newest spend can be voided: void the later ones first.')
  expect(reasonText('unset:advance.expertise')).toMatch(/^Expertise after creation isn’t set: Rules → Creation rules\.$/)
  expect(reasonText('unset:karmaSpec')).toBe('Specialization isn’t set: Rules → Creation rules.')
})

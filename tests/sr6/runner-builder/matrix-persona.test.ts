// Matrix persona (src/sr6/runner-builder/domain/creation/derive.ts personaOf): a device's attribute array read as
// A/S/D/F (a commlink's two values as D/F), plus Matrix Attribute Advancement's +level to its chosen attribute.
import { expect, test } from 'vitest'
import { personaOf } from '../../../src/sr6/runner-builder/domain/creation/derive'
import type { Sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Character } from '../../../src/sr6/formats/domain/character'

const MAA = {
  name: 'Matrix Attribute Advancement',
  parts: [{ tag: 'modifier', attrs: { ref: 'CHOICE', type: 'ITEM_ATTRIBUTE', value: '$LEVEL' } }],
}
const stub = (entries: Record<string, { name: string; attrs?: Record<string, string>; parts?: unknown[] }>): Sr6Data =>
  ({ entry: (_kind: string, id: string) => entries[id] }) as unknown as Sr6Data

const build = (purchases: unknown[], qualities: unknown[] = []): Sr6Character['build'] => ({ purchases, qualities }) as unknown as Sr6Character['build']

test('a cyberdeck array is read as Attack / Sleaze / Data Processing / Firewall', () => {
  const data = stub({ deck: { name: 'Fairlight Excalibur', attrs: { array: '5/4/3/2' } } })
  const b = build([{ kind: 'electronics', id: 'deck' }])
  expect(personaOf(b, data)).toEqual({ device: 'Fairlight Excalibur', attack: 5, sleaze: 4, dataProcessing: 3, firewall: 2 })
})

test('a commlink two-value array is Data Processing / Firewall, no Attack or Sleaze', () => {
  const data = stub({ link: { name: 'Sony Emperor', attrs: { array: '6/6' } } })
  expect(personaOf(build([{ kind: 'electronics', id: 'link' }]), data)).toEqual({
    device: 'Sony Emperor',
    attack: 0,
    sleaze: 0,
    dataProcessing: 6,
    firewall: 6,
  })
})

test('Matrix Attribute Advancement adds its level to the chosen attribute', () => {
  const data = stub({ deck: { name: 'Deck', attrs: { array: '5/4/3/2' } }, maa: MAA })
  const b = build([{ kind: 'electronics', id: 'deck' }], [{ id: 'maa', note: 'Attack', level: 2 }])
  expect(personaOf(b, data)?.attack).toBe(7)
})

test('the best (highest-array) device is the persona', () => {
  const data = stub({ link: { name: 'Link', attrs: { array: '4/4' } }, deck: { name: 'Deck', attrs: { array: '5/4/3/2' } } })
  const b = build([
    { kind: 'electronics', id: 'link' },
    { kind: 'electronics', id: 'deck' },
  ])
  expect(personaOf(b, data)?.device).toBe('Deck')
})

test('no Matrix device, no persona', () => {
  expect(personaOf(build([]), stub({}))).toBeUndefined()
})

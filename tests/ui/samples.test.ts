import { expect, test } from 'vitest'
import { blankCharacter } from '../../src/engine/file'
import { characterToXml, xmlToCharacter } from '../../src/engine'
import { duplicateSamples, keyed, keyOf, sampleKey } from '../../src/ui/samples'
import type { Character } from '../../src/model/types'

// made-up sample runners: a source "TEST" with "Dusty Hat" and "Mo Ray"
const sample = (name: string, extra: Partial<Character> = {}): Character => {
  const ch = blankCharacter('runner', 'ork')
  return { ...ch, identity: { ...ch.identity, name, streetName: name }, origin: 'TEST', updatedAt: '2026-09-01T00:00:00Z', ...extra }
}

test('a sample’s key is its source and name, whatever its id; a runner loaded before keys goes by origin and name', () => {
  expect(sampleKey('TEST', 'Dusty Hat!')).toBe('test.dusty-hat')
  expect(keyed([{ source: 'TEST', name: 'Mo Ray' }, { source: 'TEST', name: 'Mo Ray' }, { source: 'OTHER', name: 'Mo Ray' }]).map(r => r.key))
    .toEqual(['test.mo-ray', 'test.mo-ray-2', 'other.mo-ray'])
  expect(keyOf(sample('Dusty Hat', { id: 'test.dusty-hat-renamed-by-a-reimport' }))).toBe('test.dusty-hat')
  expect(keyOf(sample('Dusty Hat', { sampleKey: 'test.dusty-hat-2' }))).toBe('test.dusty-hat-2')
  expect(keyOf({ ...sample('Mine'), origin: undefined })).toBeNull() // a runner of your own
})

test('the key is saved in the character file', () => {
  const ch = sample('Dusty Hat', { sampleKey: 'test.dusty-hat' })
  const back = xmlToCharacter(characterToXml(ch))
  expect(back.ok && back.character.sampleKey).toBe('test.dusty-hat')
  expect(characterToXml(ch)).toContain(' sampleKey="test.dusty-hat"')
})

test('duplicates: unmodified extra copies only, the oldest copy stays, edited copies and other runners never', () => {
  const first = sample('Dusty Hat', { updatedAt: '2026-09-01T00:00:00Z' })
  const again = sample('Dusty Hat', { updatedAt: '2026-09-05T00:00:00Z', lastExportedAt: '2026-09-05T00:00:00Z', sampleKey: 'test.dusty-hat' })
  const third = sample('Dusty Hat', { updatedAt: '2026-09-06T00:00:00Z' })
  const edited = { ...sample('Dusty Hat', { updatedAt: '2026-09-02T00:00:00Z' }), level: 'street' }
  const other = sample('Mo Ray')
  const own = { ...sample('Dusty Hat'), origin: undefined } // named like a sample, but not one
  const out = duplicateSamples([third, edited, other, again, first, own, { ...own, id: 'own-2' }])
  expect(out.map(c => c.id)).toEqual([again.id, third.id])
  expect(duplicateSamples([edited, first])).toEqual([])
})

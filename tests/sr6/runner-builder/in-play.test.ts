// Stage 7 in-play behaviour: a weapon with each owned ammunition type loaded (ammoLoads), a drone's autonomous pools
// (dronePools). Made-up fixture entries, patched with the effects the importer writes.
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { ammoLoads, ammoLoadText } from '../../../src/sr6/runner-builder/domain/assets/weapons'
import { dronePools } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import type { Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { fixtureCatalog } from '../catalog/fixture'

const data = sr6Data(
  fixtureCatalog((file, xml) =>
    file.endsWith('ammotypes.xml')
      ? xml.replace(
          '<name>Fizz Rounds</name>',
          '<name>Fizz Rounds</name><effect target="item:ar" op="add" value="2,2,2,2,2"/><effect target="item:dv" op="add" value="-1"/><modifier type="RULE" ref="PHYSICAL_DAMAGE_IS_STUN"/>',
        )
      : xml,
  ),
)
const line = (kind: Sr6Purchase['kind'], id: string, more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: id, kind, id, qty: 1, accessories: [], ...more })

test('a ranged weapon with an owned ammo type loaded: its AR and DV change, stun shown', () => {
  const gun = line('weapons', 'crb.zap-gun')
  expect(ammoLoads(gun, data, [gun])).toEqual([]) // no ammo owned
  const ammoLine = line('gear', 'x.ammo', { accessories: [line('ammotypes', 'crb.fizz-rounds')] })
  const [l] = ammoLoads(gun, data, [gun, ammoLine])
  expect(l.stats.ar.slice(0, 2)).toEqual([11, 9])
  expect(l.stats.dv).toBe('2P')
  expect(ammoLoadText(l)).toBe('Fizz Rounds: AR 11/9/—/—/—, DV 2S')
})

test('a drone running autosofts rolls Pilot + rating; a vehicle that is not a drone has none', () => {
  const sw = [...fixtureCatalog().entries.programs.values()][0]
  const patched = sr6Data(
    fixtureCatalog((file, xml) => (file.endsWith('programs.xml') ? xml.replace(`<name>${sw.name}</name>`, '<name>Maneuvering</name>') : xml)),
  )
  const soft = line('programs', sw.id, { rating: 4 })
  expect(dronePools(line('vehicles', 'crb.hover-buzzer', { accessories: [soft] }), patched)).toEqual([{ test: 'Piloting', autosoft: 'Maneuvering', pool: 7 }])
  expect(dronePools(line('vehicles', 'crb.putt-putt', { accessories: [soft] }), patched)).toEqual([])
})

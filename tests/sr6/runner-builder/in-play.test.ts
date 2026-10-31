// Stage 7 in-play behaviour: a weapon with each owned ammunition type loaded (ammoLoads), a drone's autonomous pools
// (dronePools). Made-up fixture entries, patched with the effects the importer writes.
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { ammoFits, ammoLoads, ammoLoadText, meleeAlternate } from '../../../src/sr6/runner-builder/domain/assets/weapons'
import { dronePools } from '../../../src/sr6/runner-builder/domain/assets/vehiclemods'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
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
  expect(dronePools(line('vehicles', 'crb.hover-buzzer', { accessories: [soft] }), patched)).toEqual([
    { mode: 'autonomous', test: 'Piloting', autosoft: 'Maneuvering', pool: 7 },
    { mode: 'autonomous', test: 'Attack', autosoft: 'no Targeting autosoft', pool: 2 },
  ])
  // slaved to an RCC running a better Maneuvering: the RCC's wins
  const rcc = line('electronics', 'x.rcc', { accessories: [line('programs', sw.id, { rating: 6 })] })
  expect(
    dronePools(line('vehicles', 'crb.hover-buzzer', { accessories: [soft] }), patched, [rcc]).find(p => p.mode === 'rcc' && p.test === 'Piloting')?.pool,
  ).toBe(9)
  expect(dronePools(line('vehicles', 'crb.putt-putt', { accessories: [soft] }), patched)).toEqual([])
})

test('ammunition fits a weapon by its type; Melee Hardening gives a club alternate', () => {
  const e = (name: string, attrs: Record<string, string>) => ({ id: name, kind: 'gear', name, attrs, parts: [] }) as unknown as Sr6Entry
  expect(ammoFits(e('Heavy Pistol/SMG', {}), e('Ares Predator', { category: 'Heavy pistol' }))).toBe(true)
  expect(ammoFits(e('Heavy Pistol/SMG', {}), e('Uzi', { category: 'Submachine gun' }))).toBe(true)
  expect(ammoFits(e('Rifles', {}), e('AK-97', { category: 'Assault-rifle' }))).toBe(true)
  expect(ammoFits(e('Rifles', {}), e('Ares Predator', { category: 'Heavy pistol' }))).toBe(false)
  // an ammo line for another weapon type doesn't offer its ammo type
  const gun = line('weapons', 'crb.zap-gun')
  const rifleAmmo = line('gear', 'x.rifles', { accessories: [line('ammotypes', 'crb.fizz-rounds')] })
  const d2 = { ...data, entry: (k: string, id: string) => (id === 'x.rifles' ? e('Rifles', {}) : data.entry(k as never, id)) } as typeof data
  expect(ammoLoads(gun, d2, [gun, rifleAmmo])).toEqual([])
  expect(meleeAlternate(gun, data)).toBeUndefined()
  const mh = line('weapons', 'x.mh')
  const d3 = {
    ...data,
    entry: (k: string, id: string) =>
      id === 'x.mh'
        ? { ...e('Melee Hardening', {}), parts: [{ tag: 'modifier', text: '', attrs: { ref: 'MELEE_HARDENING_ALTERNATE' } }] }
        : data.entry(k as never, id),
  } as typeof data
  expect(meleeAlternate({ ...gun, accessories: [mh] }, d3)).toEqual({ dv: '3S', ar: [4, null, null, null, null], skill: 'Close Combat', spec: 'Clubs' })
})

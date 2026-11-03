// How a starter pack's printed items are read into lines: a weapon with its clips, ammunition, mods and grenades, nested
// packs, stat notes, a lifestyle with no SIN, and applying / removing a pack. Made-up items.
import { expect, test } from 'vitest'
import { applyPack, expandPack, isPackHeader, packCost, packHeader, removePack } from '../../../src/sr6/runner-builder/domain/creation/packs'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { fixtureCatalog, buildOf, GLIM } from '../catalog/fixture'

const X = (kind: string, body: string) => ({
  file: `x-${kind}.xml`,
  xml: `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="${kind}" version="1">${body}</sr6:data>`,
})
const data = sr6Data(
  fixtureCatalog(undefined, [
    X(
      'weapons',
      `<weapon id="crb.pop-pistol" source="CRB" page="1" class="WEAPON_RANGED/PISTOLS_LIGHT" ammo="10(c)" avail="2" cost="100"><name>Pop Pistol</name><text/></weapon>
       <weapon id="crb.spare-clip" source="CRB" page="1" class="ACCESSORY/CLIP" avail="1" cost="5"><name>Spare Clip</name><text/></weapon>
       <weapon id="crb.stun-grenade" source="CRB" page="1" class="AMMUNITION/GRENADES" avail="1" cost="20"><name>Stun Grenade</name><text/></weapon>`,
    ),
    X(
      'gear',
      `<gear id="crb.laser-sight" source="CRB" page="1" class="ACCESSORY/SIGHT" avail="1" cost="50"><name>Laser Sight</name><text/></gear><gear id="crb.light-pistol-ammo" source="CRB" page="1" class="AMMUNITION/AMMUNITION" per="10 rounds" avail="1" cost="20"><name>Light pistol ammo</name><text/></gear>`,
    ),
    X(
      'packs',
      `<pack id="tst.gun" source="CRB" page="1" cost="500"><name>Pop Pistol</name><item>2 spare clips</item><item>20 regular rounds</item><item>2 stun grenades</item><item>Agility +1</item></pack>
       <pack id="tst.mods" source="CRB" page="1" cost="50"><name>Mods</name><item>Pop Pistol</item><item>top-mounted laser sight</item><item>Tangle Rope x 3</item><item>a licence (Hunting)</item><item>Fake SIN (rating 2)</item><item>w/ Laser Sight</item></pack>
       <pack id="tst.free" source="CRB" page="1"><name>Unpriced</name><item>Zap Scope</item></pack>
       <pack id="tst.outer" source="CRB" page="1" cost="900"><name>Outer</name><item>Test Kit PACK</item><item>3 Tangle Rope x2 (rating 2, w/ fluff)</item><item>Zap Scope x3</item><item>1 month Cozy lifestyle</item><item>Unknown thing</item></pack>
       <pack id="tst.kit" source="CRB" page="1" cost="100"><name>Test Kit</name><item>Fake SIN (rating 2)</item><item>a fake license</item></pack>`,
    ),
  ]),
)

test('a pack with no readable price cannot be bought, nor an unknown one', () => {
  expect(expandPack(data, 'tst.free', { sins: [] })).toBeUndefined()
  expect(expandPack(data, 'nope', { sins: [] })).toBeUndefined()
  expect(packCost(data, data.entry('packs', 'tst.gun')!)).toBe(500)
})

test('a weapon pack comes with the weapon, its spare clips, ammunition and grenades', () => {
  const x = expandPack(data, 'tst.gun', { sins: [] })!
  const names = x.lines.map(l => l.name)
  expect(names).toContain('Pop Pistol')
  expect(names).toContain('Light pistol ammo')
  expect(names.filter(n => n === 'Stun Grenade')).toHaveLength(2)
  const gun = x.lines.find(l => l.name === 'Pop Pistol')!
  expect(gun.accessories.filter(a => a.name === 'Spare Clip')).toHaveLength(2)
  expect(x.lines.at(-1)!.note).toBe('Agility +1')
  expect(x.lines.every(l => l.pack === x.uid)).toBe(true)
})

test('a pack listing another pack takes its contents; a lifestyle with no SIN brings a placeholder one', () => {
  const x = expandPack(data, 'tst.outer', { sins: [] })!
  expect(x.sins.map(s => s.kind)).toEqual(['fake'])
  expect(x.sins[0].licences).toHaveLength(1)
  expect(x.lifestyles).toHaveLength(1)
  expect(x.lifestyles[0].sin).toBe(x.sins[0].uid)
  expect(x.lines.some(l => l.name === 'Unknown thing' && l.cost === 0)).toBe(true)
  expect(x.lines.filter(l => l.name === 'Zap Scope')[0].qty).toBe(3)
})

test("a lifestyle alone goes on the runner's own SIN, else a placeholder", () => {
  const only = `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="packs" version="1"><pack id="tst.life" source="CRB" page="1" cost="10"><name>Life</name><item>2 months Cozy lifestyle</item></pack></sr6:data>`
  const d = sr6Data(fixtureCatalog(undefined, [{ file: 'life.xml', xml: only }]))
  const placeholder = expandPack(d, 'tst.life', { sins: [] })!
  expect(placeholder.sins[0]).toMatchObject({ placeholder: true, pack: placeholder.uid })
  const own = expandPack(d, 'tst.life', { sins: [{ uid: 's1', name: 'Me', kind: 'real', licences: [] }] })!
  expect(own.sins).toEqual([])
  expect(own.lifestyles[0]).toMatchObject({ sin: 's1', line: { months: 2 } })
})

test('applying a pack puts everything on the build and removing it takes everything off', () => {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  const x = expandPack(data, 'tst.outer', b)!
  applyPack(b, x)
  expect(b.purchases.length).toBe(x.lines.length)
  expect(b.sins[0].lifestyles).toHaveLength(1)
  const head = packHeader(x)
  expect(isPackHeader(head)).toBe(true)
  expect(isPackHeader(b.purchases[0])).toBe(false)
  expect(head).toMatchObject({ cost: 900, name: 'Outer (pack price)' })
  removePack(b, x.uid)
  expect(b.purchases).toEqual([])
  expect(b.sins).toEqual([])
})

test('a mod printed after a weapon is fitted to it when it fits, else it stays a free line', () => {
  const fitted = expandPack(data, 'tst.mods', { sins: [] })!
  const gun = fitted.lines.find(l => l.name === 'Pop Pistol')!
  expect(gun.accessories.map(a => a.name)).toContain('Laser Sight')
  const refused = expandPack(data, 'tst.mods', { sins: [] }, () => 'does not fit')!
  expect(refused.lines.find(l => l.name === 'Pop Pistol')!.accessories).toEqual([])
})

test('a printed count multiplies a stacking line, and a single licence goes on the pack’s SIN', () => {
  const x = expandPack(data, 'tst.mods', { sins: [] })!
  expect(x.lines.find(l => l.name.startsWith('Tangle Rope'))).toMatchObject({ qty: 3 })
  expect(x.sins[0].licences.map(l => l.name)).toEqual(['Hunting'])
})

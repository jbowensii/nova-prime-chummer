// Vehicle decomposition Stage 1 (docs/analysis/sr6-vehicle-decomposition.md 3): `removedBuiltins` keeps round-tripping as
// before, the new `removedParts` round-trips beside it, and the catalog `<part>` (origin/review flags) validates.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'

const dir = 'public/data/sr6/schema/'
const check = async (xml: string, xsd: string) =>
  (
    await validateXML({
      xml: { fileName: 'x.xml', contents: xml },
      schema: { fileName: xsd, contents: readFileSync(dir + xsd, 'utf8') },
      preload: xsd === 'character.xsd' ? [] : [{ fileName: 'common.xsd', contents: readFileSync(dir + 'common.xsd', 'utf8') }],
    })
  ).errors.map(e => e.message)

function withVehicle(extra: object) {
  const ch = blankSr6('priority', 'r-1', '2026-10-03T10:00:00.000Z')
  ch.build.purchases = [{ uid: 'v1', kind: 'vehicles', id: 'crb.made-up-van', qty: 1, accessories: [], ...extra }]
  return ch
}
const roundTrip = async (extra: object) => {
  const ch = withVehicle(extra)
  const xml = sr6ToXml(ch, 1)
  expect(await check(xml, 'character.xsd')).toEqual([])
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  expect(r.character).toEqual(ch)
  expect(sr6ToXml(r.character, 1)).toBe(xml)
  return xml
}

test('an old runner with removedBuiltins and no removedParts round-trips unchanged', async () => {
  const xml = await roundTrip({ removedBuiltins: ['builtin:0', 'builtin:2'] })
  expect(xml).toContain('removedBuiltins="builtin:0 builtin:2"')
  expect(xml).not.toContain('removedParts')
})

test('removedParts round-trips beside removedBuiltins', async () => {
  const xml = await roundTrip({ removedBuiltins: ['builtin:1'], removedParts: ['p1', 'p4'] })
  expect(xml).toContain('removedParts="p1 p4"')
})

const part = (attrs: string) => `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="vehicles" version="1">
  <vehicle id="zz.v" source="ZZ" page="1" category="cars"><name>Zed</name>
    <builtin name="Old style" slots="2" category="chassis"/>${attrs}<text/></vehicle>
</sr6:data>`

test('a catalog <part> with origin and review validates; a bad origin is refused; <builtin> still validates', async () => {
  const ok = part('<part id="p1" ref="zz.mount" hook="vehicle-body" cost="0.5" origin="synth" review="needs-owner"/>')
  expect(await check(ok, 'vehicles.xsd')).toEqual([])
  expect(await check(part(''), 'vehicles.xsd')).toEqual([])
  expect((await check(part('<part id="p1" ref="zz.mount" hook="vehicle-body" origin="guess" review="none"/>'), 'vehicles.xsd')).length).toBeGreaterThan(0)
})

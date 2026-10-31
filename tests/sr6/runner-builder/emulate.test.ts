// The Emulate complex form (CRB; Commlink6's SR6EmulatedSoftwareController): the program its choice names is on the runner,
// free, worked out from the pick (made-up entries).
import { expect, test } from 'vitest'
import { emulatedPrograms } from '../../../src/sr6/runner-builder/domain/creation/magic'
import { runnerView } from '../../../src/sr6/runner-builder/ui/view'
import { blankSr6, type Sr6Pick } from '../../../src/sr6/formats/domain/character'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

const FORMS = {
  file: 'custom/sr6/imported/zz/complexforms.xml',
  xml:
    '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="complexforms" version="1">' +
    '<complexform id="zz.emulate-program" source="ZZ" page="1"><name>Emulate</name><selection type="PROGRAM"/></complexform></sr6:data>',
}
const world = () => sr6Data(fixtureCatalog(undefined, [FORMS]))
const pick = (note?: string, id = 'zz.emulate-program'): Sr6Pick => ({ uid: 'p1', kind: 'complexforms', id, note })

test('an Emulate pick naming a program puts that program on the runner, free', () => {
  const data = world()
  const b = { ...buildOf('priority', { metatype: GLIM, magic: 'technomancer' }), picks: [pick('glow scan')] }
  expect(emulatedPrograms(b, data)).toEqual([expect.objectContaining({ kind: 'programs', id: 'crb.glow-scan', cost: 0, uid: 'emulate:p1' })])
  const ch = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = b
  const v = runnerView({ ch, data, cr: fixtureCreation(), d: {} as never, career: false })
  expect(v.lines('programs').map(v.nameOf)).toEqual(['Glow Scan'])
})

test('no choice, an unknown program or another complex form runs nothing', () => {
  const data = world()
  const b = buildOf('priority', { metatype: GLIM, magic: 'technomancer' })
  for (const p of [pick(), pick('No Such Program'), pick('Glow Scan', 'crb.static-veil')]) expect(emulatedPrograms({ ...b, picks: [p] }, data)).toEqual([])
})

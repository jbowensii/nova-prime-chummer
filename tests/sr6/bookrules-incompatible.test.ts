// Augmentations, powers and qualities that can't be combined (CRB Hong Kong pp. 157, 286–293: an entry's <incompatible>
// parts): one raising what another names, one another names, two of a family only one of which may be installed; a
// wireless exception is a note; the Sixth World Companion's Suprathyroid Bonuses Stack (p. 149) exempts the gland. Every
// entry here is made up.
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/engine/data'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

const AUG = `<augmentation id="crb.zap-reflexes" source="CRB" page="287" type="cyberware" essence="1" avail="2" cost="1"><name>Zap Reflexes 2</name><effect target="attr:rea" op="add" value="2" switch="activated"/><incompatible targets="attr:rea derived:initiative-dice"/><compatible name="zip enhancers" switch="wireless"/><text/></augmentation>
  <augmentation id="crb.zip-enhancers" source="CRB" page="287" type="cyberware" essence="1" avail="2" cost="1"><name>Zip Enhancers</name><effect target="attr:rea" op="add" value="1"/><incompatible targets="attr:rea" names="zap reflexes"/><compatible name="zap reflexes" switch="wireless"/><text/></augmentation>
  <augmentation id="crb.glow-booster" source="CRB" page="293" type="bioware" essence="1" avail="2" cost="1"><name>Glow Booster</name><effect target="derived:initiative-dice" op="add" value="1"/><incompatible targets="attr:rea derived:initiative-dice"/><text/></augmentation>
  <augmentation id="crb.zap-lacing-tin" source="CRB" page="286" type="cyberware" essence="1" avail="2" cost="1"><name>Zap Lacing (Tin)</name><incompatible family="Zap Lacing"/><incompatible names="glow density augmentation"/><text/></augmentation>
  <augmentation id="crb.zap-lacing-lead" source="CRB" page="286" type="cyberware" essence="1" avail="2" cost="1"><name>Zap Lacing (Lead)</name><incompatible family="Zap Lacing"/><text/></augmentation>
  <augmentation id="crb.glow-density" source="CRB" page="291" type="bioware" essence="1" avail="2" cost="1"><name>Glow density augmentation</name><text/></augmentation>
  <augmentation id="crb.suprathyroid-gland" source="CRB" page="292" type="bioware" essence="1" avail="2" cost="1"><name>Suprathyroid gland</name><effect target="attr:rea" op="add" value="1"/><text/></augmentation>`
function setup() {
  const data = sr6Data(fixtureCatalog((f, x) => (f.endsWith('crb/augmentations.xml') ? x.replace('</sr6:data>', `${AUG}\n</sr6:data>`) : x)))
  return { data, cr: fixtureCreation() }
}
function runner(...ids: string[]): Sr6Character {
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CABDA', metatype: GLIM })
  ids.forEach((id, i) => ch.build.purchases.push({ uid: `a${i}`, kind: 'augmentations', id, qty: 1, accessories: [] }))
  return ch
}
const found = (ch: Sr6Character, s = setup()) =>
  validateSr6(s.data, s.cr, ch)
    .filter(v => v.code.startsWith('gear.incompatible'))
    .map(v => [v.code, v.path, v.message])

test('one raising what another names, one another names, two of one family; each pair once, cited to the one that says so', () => {
  expect(found(runner('crb.zap-reflexes', 'crb.glow-booster'))).toEqual([
    ['gear.incompatible', 'augmentations.a1', 'Zap Reflexes 2 and Glow Booster can’t be combined.'],
  ])
  expect(found(runner('crb.zap-lacing-tin', 'crb.glow-density'))).toHaveLength(1)
  expect(found(runner('crb.zap-lacing-tin', 'crb.zap-lacing-lead'))).toHaveLength(1)
  expect(found(runner('crb.zap-lacing-tin', 'crb.zip-enhancers', 'crb.glow-density'))).toHaveLength(1)
  const s = setup()
  expect(validateSr6(s.data, s.cr, runner('crb.zap-reflexes', 'crb.glow-booster')).find(v => v.code === 'gear.incompatible')).toMatchObject({
    source: 'CRB',
    page: 287,
  })
})

test('a wireless exception is a note, not a problem', () => {
  expect(found(runner('crb.zap-reflexes', 'crb.zip-enhancers'))).toEqual([
    ['gear.incompatibleWireless', 'augmentations.a1', 'Zap Reflexes 2 and Zip Enhancers: compatible only while wireless (the wireless bonus).'],
  ])
})

test('the suprathyroid gland clashes with what names its attributes, unless the Companion’s option is on', () => {
  expect(found(runner('crb.zap-reflexes', 'crb.suprathyroid-gland'))).toHaveLength(1)
  const s = setup()
  s.cr.set('suprathyroidStacks', { key: 'suprathyroidStacks', value: true })
  expect(found(runner('crb.zap-reflexes', 'crb.suprathyroid-gland'), s)).toEqual([])
})

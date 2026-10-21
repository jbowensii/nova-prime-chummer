// Critters a runner owns (owner 2026-10-16, BUILDER Q9-Q10): Wild Life p. 180's prices by class (the player's pet class;
// Awakened and Emerged from Magic or Resonance), companion qualities with the purchase, from taming and by the bond,
// named commands and special training (bought with it: +1 Body in the price; taught later: the OPTIONS row's price),
// the -N% bonus off the whole price, critter powers at 0 Karma, critterware and critter gear on a critter only, its Body in
// their prices, its Essence and Magic; the file and the career ledger. Invented entries, invented numbers.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { apply } from '../../src/sr6/engine/actions'
import { essenceBudget, priced } from '../../src/sr6/engine/budgets'
import { applyAdvance, currentBuild, preview, record, voidEntry } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { bondKarma, critterPrice, critterValue, critterView } from '../../src/sr6/engine/critters'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { karmaBudget } from '../../src/sr6/engine/karma'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { exportSr6Runner } from '../../src/sr6/foundry/domain/export'
import { critterNotes } from '../../src/sr6/print/view'
import { blankBuild, blankSr6, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../../src/sr6/formats/domain/character'
import { fixtureCatalog, fixtureCreation } from './catalog/fixture'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="1"'
const CRITTERS = `<sr6:data ${NS} kind="critters" version="1">
  <critter id="zz.fuzzpup" ${at} bod="4" agi="3" rea="3" str="3" wil="2" log="2" int="3" cha="2" ess="6"><name>Fuzzpup</name><powers>Glow Nose, Thick Fur</powers><weaknesses>Allergy (soap)</weaknesses><text/></critter>
  <critter id="zz.glowcat" ${at} bod="3" log="1" int="2" ess="6" mag="2"><name>Glowcat</name><powers>Shimmer</powers><text/></critter>
  <critter id="zz.bytebat" ${at} bod="2" log="1" int="1" ess="6" res="3"><name>Bytebat</name><text/></critter>
  <critter id="zz.megamoose" ${at} bod="11" log="1" int="1" ess="6"><name>Megamoose</name><text/></critter>
  <critter id="zz.squeak" ${at} bod="1" log="1" int="1" ess="6"><name>Squeak</name><text/></critter>
</sr6:data>`
const row = (id: string, name: string, cat: string, avail: string, cost: string) =>
  `<gear id="zz.${id}" ${at} category="${cat}" class="CRITTERWARE/PURCHASE" avail="${avail}" cost="${cost}"><name>${name}</name><text/></gear>`
const GEAR = `<sr6:data ${NS} kind="gear" version="1">
  ${row('pet-mundane', 'Pet (Mundane)', 'Critter purchase', '--', 'Body x 70 nuyen')}
  ${row('pet-exotic', 'Pet (Exotic)', 'Critter purchase', '3', 'Body x 200 nuyen')}
  ${row('pet-wild', 'Pet (Wild)', 'Critter purchase', '3(L)', 'Body x 200 nuyen')}
  ${row('awakened', 'Awakened', 'Critter purchase', '(Magic + 2)(L)', '(Body + Magic) x 1,100 nuyen')}
  ${row('emerged', 'Emerged', 'Critter purchase', '(Resonance + 2)(L)', '(Body + Resonance) x 1,100 nuyen')}
  ${row('negative-quality', 'Negative Quality', 'Critter purchase option', '-1 per negative quality', '-10% nuyen cost per net Karma bonus')}
  ${row('positive-quality', 'Positive Quality', 'Critter purchase option', '+1 per positive quality', '+300 nuyen per net Karma cost')}
  ${row('trained-command', 'Trained: Command', 'Critter purchase option', '+2', '+400 nuyen')}
  ${row('trained-special-training', 'Trained: Special Training', 'Critter purchase option', '+1', '+600 nuyen')}
  <gear id="zz.fuzz-harness" ${at} category="Critter gear" class="CRITTERWARE/GEAR" avail="2" cost="Critter's Body x 30¥"><name>Fuzz Harness</name><text/></gear>
</sr6:data>`
const AUGS = `<sr6:data ${NS} kind="augmentations" version="1">
  <augmentation id="zz.zap-claws" ${at} type="cyberware" category="critterware" class="CRITTERWARE/AUGMENTATION" essence="1.2" avail="2" cost="1000"><name>Zap Claws</name><text/></augmentation>
</sr6:data>`
const q = (id: string, name: string, kind: string, karma: number, more = '') =>
  `<quality id="zz.${id}" ${at} kind="${kind}" karma="${karma}" class="CRITTERWARE/QUALITY"${more}><name>${name}</name><text/></quality>`
const QUALITIES = `<sr6:data ${NS} kind="qualities" version="1">
  ${q('snuggly', 'Snuggly', 'positive', 2)}
  ${q('keen', 'Keen', 'positive', 3)}
  ${q('wild-soul', 'Wild Soul', 'positive', 1)}
  ${q('high-maintenance', 'High Maintenance', 'negative', 1, ' perLevel="true" maxLevel="3"')}
  ${q('grumpy', 'Grumpy', 'negative', 4)}
  ${q('receptive', 'Receptive to Training', 'positive', 3, ' perLevel="true"')}
  ${q('untrainable', 'Untrainable', 'negative', 2, ' perLevel="true"')}
  <quality id="zz.critter-bond" ${at} kind="positive" karma="10"><name>Critter Bond</name><text/></quality>
</sr6:data>`

const act = (id: string, name: string, cat: string) => `<action id="zz.${id}" ${at} category="${cat}"><name>${name}</name><text/></action>`
const ACTIONS = `<sr6:data ${NS} kind="actions" version="1">
  ${act('fetch-fizz', 'Fetch Fizz', 'Critter Command Actions')}
  ${act('hum-along', 'Hum Along', 'Critter Command Actions')}
  ${act('harness-training', 'Harness Training', 'Critter Special Training')}
  ${act('glow-dodge', 'Glow Dodge', 'Edge Actions')}
</sr6:data>`
let n = 0
const C = (id: string, taught?: true) => ({ uid: `t${++n}`, what: 'command' as const, id: `zz.${id}`, ...(taught ? { taught } : {}) })
const T = (id: string, taught?: true) => ({ uid: `t${++n}`, what: 'training' as const, id: `zz.${id}`, ...(taught ? { taught } : {}) })

const worldCatalog = () => {
  const files = [
    ['critters', CRITTERS],
    ['actions', ACTIONS],
    ['gear', GEAR],
    ['augmentations', AUGS],
    ['qualities', QUALITIES],
  ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml }))
  return { c: fixtureCatalog(undefined, files) }
}
const world = () => ({ data: sr6Data(worldCatalog().c), cr: fixtureCreation() })
const ok = { ok: true }
const view = (x: Sr6Purchase, data: ReturnType<typeof world>['data'], cr: ReturnType<typeof world>['cr']) => critterView(x, data, priced(x, data, cr).essence)
/** A build owning the critter `id` (pet: its class), and the world it was built in. */
function owning(id: string, set: Partial<Sr6Purchase> = {}) {
  const w = world(),
    b = blankBuild('karma')
  expect(apply(b, { op: 'purchase', kind: 'critters', id }, w.data, w.cr)).toEqual(ok)
  Object.assign(b.purchases[0], set)
  return { ...w, b, x: b.purchases[0] }
}

test('a value printed in Body, Magic or Resonance reads at the critter’s numbers', () => {
  expect(critterValue('(Body + Magic) x 2,000 nuyen', { Body: 4, Magic: 3 })).toBe(14000)
  expect(critterValue('(Magic + 1)(L)', { Body: 4, Magic: 3 })).toBe(4)
  expect(critterValue("Critter's Body x 50¥", { Body: 6 })).toBe(300)
  expect(critterValue('+500 nuyen', { Body: 1 })).toBe(500)
  expect(critterValue('--', { Body: 1 })).toBeNull()
  expect(critterValue('+10% item’s normal price', { Body: 1 })).toBeNull()
})

test('price by class: the pet class the player picks; Awakened and Emerged from Magic and Resonance', () => {
  const { x, data } = owning('zz.fuzzpup')
  expect(critterPrice(x, data)).toMatchObject({ cls: 'mundane', cost: 280, avail: 0, ok: true })
  expect(critterPrice({ ...x, pet: 'exotic' }, data)).toMatchObject({ cls: 'exotic', cost: 800, avail: 3 })
  expect(critterPrice({ ...x, pet: 'wild' }, data)).toMatchObject({ cls: 'wild', cost: 800, avail: 3, legal: 'L' })
  // (a pet class picked for an Awakened or Emerged critter doesn't apply)
  const cat = owning('zz.glowcat', { pet: 'mundane' })
  expect(critterPrice(cat.x, cat.data)).toMatchObject({ cls: 'awakened', cost: 5500, avail: 4, legal: 'L' })
  const bat = owning('zz.bytebat')
  expect(critterPrice(bat.x, bat.data)).toMatchObject({ cls: 'emerged', cost: 5500, avail: 5 })
  // priced() is what the nuyen budget and the career purchase read
  expect(priced(x, data, fixtureCreation())).toMatchObject({ cost: 280, avail: 0, ok: true, body: 4 })
})

test('qualities with the purchase: ±1 Availability each, only the net Karma moves the price', () => {
  const { x, data } = owning('zz.fuzzpup', { pet: 'exotic' })
  x.critterQualities = [
    { uid: 'a', id: 'zz.snuggly', level: 1 },
    { uid: 'b', id: 'zz.keen', level: 1 },
  ]
  // net 5 Karma of cost: +5 × 300; two positives: Availability +2
  expect(critterPrice(x, data)).toMatchObject({ cost: 800 + 1500, avail: 5 })
  x.critterQualities.push({ uid: 'c', id: 'zz.grumpy', level: 1 }, { uid: 'd', id: 'zz.untrainable', level: 2 })
  // net 5 − 4 − 4 = −3: 30% off the critter's price; Availability 3 + 2 − 2
  expect(critterPrice(x, data)).toMatchObject({ cost: 560, avail: 3 })
  // tamed or bonded ones don't move it
  x.critterQualities.push({ uid: 'e', id: 'zz.receptive', level: 3, how: 'bonded' })
  expect(critterPrice(x, data).cost).toBe(560)
  // never below 0
  x.critterQualities = [
    { uid: 'c', id: 'zz.grumpy', level: 1 },
    { uid: 'f', id: 'zz.high-maintenance.3', level: 1 },
    { uid: 'g', id: 'zz.untrainable', level: 3 },
  ]
  expect(critterPrice(x, data).cost).toBe(0)
})

test('trained with the purchase: +1 Body in the price formula each, +1 Availability each (the OPTIONS row’s); its Body stays', () => {
  const { x, data, cr } = owning('zz.fuzzpup', { pet: 'exotic' })
  x.trained = [C('fetch-fizz'), C('hum-along'), T('harness-training')]
  // Body 4 + 3 trained: 7 × 200; Availability 3 + 2 × 2 (a command's +2) + 1
  expect(critterPrice(x, data)).toMatchObject({ cost: 1400, avail: 8, ok: true })
  expect(critterPrice(x, data).parts[0]).toBe('Pet (Exotic) Body x 200 nuyen at Body 4 + 3 trained (p. 183): 1,400¥')
  // the critter's own Body (its critterware's price, its stat line) is not raised
  expect(priced(x, data, cr).body).toBe(4)
  // Awakened: (Body + 1 + Magic) × 1,100; its Availability from its Magic, + the command's 2
  const cat = owning('zz.glowcat', { trained: [C('fetch-fizz')] })
  expect(critterPrice(cat.x, cat.data)).toMatchObject({ cost: 6600, avail: 6 })
})

test('a net Karma bonus comes off the whole price, training included, never below 0; a net cost adds per point', () => {
  const { x, data } = owning('zz.fuzzpup', { pet: 'exotic', trained: [C('fetch-fizz'), C('hum-along')] })
  // (4 + 2) × 200 = 1,200; Grumpy's 4 bonus: −40% of all of it
  x.critterQualities = [{ uid: 'g', id: 'zz.grumpy', level: 1 }]
  expect(critterPrice(x, data).cost).toBe(720)
  expect(critterPrice(x, data).parts.at(-1)).toMatch(/4 Karma bonus: −40% of the whole price/)
  // Snuggly's 2 cost against the 4 bonus: net −2, −20%
  x.critterQualities.push({ uid: 's', id: 'zz.snuggly', level: 1 })
  expect(critterPrice(x, data).cost).toBe(960)
  // Untrainable 3 more: net −8, −80%; Untrainable 6: past 100%, 0, never negative
  x.critterQualities.push({ uid: 'u', id: 'zz.untrainable', level: 3 })
  expect(critterPrice(x, data).cost).toBe(240)
  x.critterQualities[2].level = 6
  expect(critterPrice(x, data).cost).toBe(0)
  // a net cost: +300 a point on top
  x.critterQualities = [{ uid: 'k', id: 'zz.keen', level: 1 }]
  expect(critterPrice(x, data).cost).toBe(1200 + 900)
})

test('taught later: the OPTIONS row’s price each (+400, +600), no Availability, never discounted; a tamed critter’s always', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup', { pet: 'exotic' })
  x.trained = [C('fetch-fizz', true), T('harness-training', true)]
  x.critterQualities = [{ uid: 'g', id: 'zz.grumpy', level: 1 }]
  // 800 − 40%, then 400 + 600 taught; Availability 3 − 1 (the negative)
  expect(critterPrice(x, data)).toMatchObject({ cost: 480 + 1000, avail: 2 })
  expect(critterPrice(x, data).parts.slice(-2)).toEqual(['1 command taught later: +400¥', '1 special training taught later: +600¥'])
  // tamed: no price, no Availability; what it is taught is still paid
  x.critterQualities = []
  x.trained = [C('hum-along')]
  expect(apply(b, { op: 'critter', uid: x.uid, tamed: true }, data, cr)).toEqual(ok)
  expect(x.trained[0].taught).toBeUndefined() // (isTaught reads a tamed critter's as taught)
  x.critterQualities = []
  expect(critterPrice(x, data)).toMatchObject({ cost: 400, avail: 0, ok: true })
  expect(apply(b, { op: 'critterTrained', host: x.uid, id: 'zz.harness-training' }, data, cr)).toEqual(ok)
  expect(x.trained[1]).toMatchObject({ what: 'training', id: 'zz.harness-training', name: 'Harness Training', taught: true })
  expect(critterPrice(x, data)).toMatchObject({ cost: 1000, avail: 0 })
})

test('a tamed critter has no price; taming brings Wild Soul and High Maintenance 1, untaming takes them away', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup', { pet: 'wild' })
  expect(apply(b, { op: 'critter', uid: x.uid, tamed: true }, data, cr)).toEqual(ok)
  expect(x.tamed).toBe(true)
  expect(x.critterQualities?.map(q => [q.id, q.how])).toEqual([
    ['zz.wild-soul', 'tamed'],
    ['zz.high-maintenance.1', 'tamed'],
  ])
  expect(critterPrice(x, data)).toMatchObject({ cost: 0, avail: 0, ok: true })
  expect(view(x, data, cr).warnings).toEqual([])
  // the default negative swapped for another: still balanced; with none, a warning
  const hm = x.critterQualities!.find(q => q.id === 'zz.high-maintenance.1')!
  expect(apply(b, { op: 'critterQuality', host: x.uid, remove: hm.uid }, data, cr)).toEqual(ok)
  expect(view(x, data, cr).warnings.map(w => w.page)).toEqual([184])
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.grumpy', how: 'tamed' }, data, cr)).toEqual(ok)
  expect(view(x, data, cr).warnings).toEqual([])
  expect(apply(b, { op: 'critter', uid: x.uid, tamed: false }, data, cr)).toEqual(ok)
  expect(x.tamed).toBeUndefined()
  expect(x.critterQualities).toBeUndefined()
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.grumpy', how: 'tamed' }, data, cr)).toEqual({ ok: false, reason: 'not-tamed' })
})

test('tamed then untamed: the price and Availability come back exactly; a Wild Soul it had is neither doubled nor taken', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup', { pet: 'exotic' })
  x.trained = [C('fetch-fizz'), T('harness-training', true)]
  x.critterQualities = [{ uid: 'w', id: 'zz.wild-soul', level: 1 }]
  const before = critterPrice(x, data)
  expect(apply(b, { op: 'critter', uid: x.uid, tamed: true }, data, cr)).toEqual(ok)
  expect(x.critterQualities.map(q => [q.id, q.how])).toEqual([
    ['zz.wild-soul', undefined],
    ['zz.high-maintenance.1', 'tamed'],
  ])
  expect(apply(b, { op: 'critter', uid: x.uid, tamed: false }, data, cr)).toEqual(ok)
  expect(x.critterQualities).toEqual([{ uid: 'w', id: 'zz.wild-soul', level: 1 }])
  expect(x.trained.map(t => t.taught)).toEqual([undefined, true])
  expect(critterPrice(x, data)).toEqual(before)
})

test('critter qualities are a critter’s only; set, levelled, removed; commands and training picked by name, set, removed', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup')
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.critter-bond' }, data, cr)).toEqual({ ok: false, reason: 'not-a-critter-quality' })
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.receptive' }, data, cr)).toEqual(ok)
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.receptive' }, data, cr)).toEqual({ ok: false, reason: 'already-taken' })
  const uid = x.critterQualities![0].uid
  expect(apply(b, { op: 'critterQuality', host: x.uid, uid, level: 2 }, data, cr)).toEqual(ok)
  expect(x.critterQualities![0].level).toBe(2)
  expect(apply(b, { op: 'critterQuality', host: x.uid, remove: uid }, data, cr)).toEqual(ok)
  expect(x.critterQualities).toBeUndefined()
  // only the book's two lists: an Edge action, or nothing, is refused
  expect(apply(b, { op: 'critterTrained', host: x.uid, id: 'zz.glow-dodge' }, data, cr)).toEqual({ ok: false, reason: 'not-critter-training' })
  expect(apply(b, { op: 'critterTrained', host: x.uid, id: 'zz.nothing' }, data, cr)).toEqual({ ok: false, reason: 'unknown-entry' })
  // the same one twice is two (Teamwork for two skills); one taught later, then back with the purchase; one taken off
  for (const id of ['zz.fetch-fizz', 'zz.fetch-fizz', 'zz.harness-training']) expect(apply(b, { op: 'critterTrained', host: x.uid, id }, data, cr)).toEqual(ok)
  expect(x.trained?.map(t => [t.what, t.id, t.taught])).toEqual([
    ['command', 'zz.fetch-fizz', undefined],
    ['command', 'zz.fetch-fizz', undefined],
    ['training', 'zz.harness-training', undefined],
  ])
  const [one, , tr] = x.trained!
  expect(apply(b, { op: 'critterTrained', host: x.uid, uid: tr.uid, taught: true }, data, cr)).toEqual(ok)
  expect(tr.taught).toBe(true)
  expect(apply(b, { op: 'critterTrained', host: x.uid, uid: tr.uid, taught: false }, data, cr)).toEqual(ok)
  expect(tr.taught).toBeUndefined()
  expect(apply(b, { op: 'critterTrained', host: x.uid, remove: one.uid }, data, cr)).toEqual(ok)
  expect(x.trained).toHaveLength(2)
  expect(apply(b, { op: 'critterTrained', host: x.uid, remove: one.uid }, data, cr)).toEqual({ ok: false, reason: 'not-taken' })
})

test('limits: commands Logic × 2 and training Intuition × 2, moved by Receptive and Untrainable; six qualities; all warnings', () => {
  const { x, data, cr } = owning('zz.fuzzpup', {
    trained: [...[...Array(5)].map(() => C('fetch-fizz')), ...[...Array(7)].map(() => T('harness-training', true))],
  })
  expect(view(x, data, cr)).toMatchObject({ commands: { n: 5, max: 4 }, training: { n: 7, max: 6 } })
  expect(view(x, data, cr).warnings.map(w => w.page)).toEqual([180, 180])
  x.critterQualities = [{ uid: 'r', id: 'zz.receptive', level: 2 }]
  expect(view(x, data, cr)).toMatchObject({ commands: { max: 6 }, training: { max: 8 } })
  x.critterQualities.push({ uid: 'u', id: 'zz.untrainable', level: 3 })
  expect(view(x, data, cr)).toMatchObject({ commands: { max: 3 }, training: { max: 5 } })
  x.trained = []
  x.critterQualities = ['snuggly', 'keen', 'wild-soul', 'grumpy', 'receptive', 'untrainable', 'high-maintenance.2'].map(id => ({
    uid: id,
    id: `zz.${id}`,
    level: 1,
  }))
  expect(view(x, data, cr).warnings).toEqual([expect.objectContaining({ message: expect.stringMatching(/7 qualities .* six/), page: 184 })])
})

test('critter powers come with it at 0 Karma: the stat block’s, never priced, never the runner’s', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup')
  expect(view(x, data, cr)).toMatchObject({ powers: 'Glow Nose, Thick Fur', weaknesses: 'Allergy (soap)' })
  const p = makeProvider(b.method, data, cr)
  expect(karmaBudget(b, data, cr, p).breakdown.some(l => l.tab === 'critters')).toBe(false)
  expect(essenceBudget(b, data, cr).spent).toBe(0)
})

test('the bond at creation: the runner’s Karma for bonded positives less bonded negatives; one negative per positive', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup')
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.keen', how: 'bonded' }, data, cr)).toEqual(ok)
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.high-maintenance.2', how: 'bonded' }, data, cr)).toEqual(ok)
  expect(bondKarma(x, data)).toBe(1)
  const line = karmaBudget(b, data, cr, makeProvider(b.method, data, cr)).breakdown.find(l => l.key === 'critterBond')
  expect(line).toMatchObject({ amount: 1, tab: 'critters', sign: 'spend' })
  // the bonus never pays the runner
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.grumpy', how: 'bonded' }, data, cr)).toEqual(ok)
  expect(bondKarma(x, data)).toBe(0)
  // Review: two negatives for one positive, and no Critter Bond on the runner (warnings)
  const ch = { ...blankSr6('karma', 'r'), build: b }
  const v = validateSr6(data, cr, ch).filter(y => y.code === 'critter.rules')
  expect(v.map(y => [y.severity, y.path, y.page])).toEqual([
    ['warning', `critters.${x.uid}`, 184],
    ['warning', `critters.${x.uid}`, 139],
  ])
  b.qualities.push({ uid: 'cb', id: 'zz.critter-bond', level: 1 })
  expect(
    validateSr6(data, cr, ch)
      .filter(y => y.code === 'critter.rules')
      .map(y => y.page),
  ).toEqual([184])
})

test('critterware and critter gear: on a critter only, priced at its Body, +10% a Body over 8; its Essence and Magic', () => {
  const { b, x, data, cr } = owning('zz.glowcat')
  const fit = (id: string, kind: 'gear' | 'augmentations') => apply(b, { op: 'accessory', host: x.uid, kind, id }, data, cr)
  expect(fit('zz.fuzz-harness', 'gear')).toEqual(ok)
  expect(fit('zz.zap-claws', 'augmentations')).toEqual(ok)
  // Body 3: the harness 90; the claws as printed; the critter itself 5,500
  expect(priced(x, data, cr)).toMatchObject({ cost: 5500 + 90 + 1000, essence: 1.2, ok: true })
  // its augmentation takes its Essence, not the runner's, and a started point of Magic (Body Shop p. 140)
  expect(view(x, data, cr)).toMatchObject({ essence: { base: 6, left: 4.8 }, magic: { base: 2, now: 0 } })
  expect(essenceBudget(b, data, cr).spent).toBe(0)
  // a runner's own line takes no critter equipment
  expect(apply(b, { op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.1' }, data, cr)).toEqual(ok)
  expect(apply(b, { op: 'accessory', host: b.purchases[1].uid, kind: 'gear', id: 'zz.fuzz-harness' }, data, cr)).toEqual({ ok: false, reason: 'critters-only' })
  // a big critter: +10% a point of Body over 8 on its augmentations (11: +30%)
  const moose = owning('zz.megamoose')
  expect(apply(moose.b, { op: 'accessory', host: moose.x.uid, kind: 'augmentations', id: 'zz.zap-claws' }, moose.data, moose.cr)).toEqual(ok)
  expect(priced(moose.x, moose.data, moose.cr).cost).toBe(11 * 70 + 1300)
  // Body under 2: a warning, never refused
  const mouse = owning('zz.squeak')
  expect(apply(mouse.b, { op: 'accessory', host: mouse.x.uid, kind: 'augmentations', id: 'zz.zap-claws' }, mouse.data, mouse.cr)).toEqual(ok)
  expect(view(mouse.x, mouse.data, mouse.cr).warnings.map(w => [w.source, w.page])).toEqual([['BS', 135]])
})

test('without Wild Life’s table in the catalog a critter is unpriced, said once', () => {
  const data = sr6Data(fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/critters.xml', xml: CRITTERS }])),
    cr = fixtureCreation(),
    b = blankBuild('karma')
  expect(apply(b, { op: 'purchase', kind: 'critters', id: 'zz.fuzzpup' }, data, cr)).toEqual(ok)
  expect(priced(b.purchases[0], data, cr)).toMatchObject({ cost: 0, ok: false, unpriced: true, notes: [expect.stringMatching(/Pet \(Mundane\).*p\. 180/)] })
})

/** A finalized runner owning a Fuzzpup (uid c1), 20 karma and 9,000¥. */
function career(): { ch: Sr6Character; data: ReturnType<typeof world>['data']; cr: ReturnType<typeof world>['cr'] } {
  const w = world(),
    ch = blankSr6('karma', 'r', '2026-10-16T00:00:00.000Z')
  ch.build.purchases = [
    { uid: 'c1', kind: 'critters', id: 'zz.fuzzpup', qty: 1, accessories: [], critterQualities: [{ uid: 'r', id: 'zz.receptive', level: 1 }] },
  ]
  Object.assign(ch, { finalizedAt: '2026-10-16T00:00:00.000Z', final: { karma: 20, nuyen: 9000 } })
  ch.ledger = [{ id: 'f', at: '2026-10-16T00:00:00.000Z', type: 'finalize', karma: 20, nuyen: 9000 }]
  return { ch, ...w }
}

test('career: a critter bought, critter gear fitted, a quality bonded (negative first, then doubled), voidable', async () => {
  let { ch } = career()
  const { data, cr } = career()
  const step = (a: Parameters<typeof record>[1]) => {
    const r = record(ch, a, data, cr)
    if (!r.ok) throw new Error(r.reason)
    ch = r.ch
    return ch.ledger.at(-1)!
  }
  // bought trained: (Body 3 + 1 + Magic 2) × 1,100
  expect(
    step({
      op: 'purchase',
      line: { uid: '', kind: 'critters', id: 'zz.glowcat', qty: 1, accessories: [], trained: [{ uid: '', what: 'command', id: 'zz.hum-along' }] },
    }),
  ).toMatchObject({ nuyen: 6600, label: 'Glowcat' })
  // taught to the Fuzzpup after: +400 a command, +600 a special training (past its limit: recorded, Review warns)
  expect(step({ op: 'teach', target: 'c1', line: { uid: '', what: 'command', id: 'zz.fetch-fizz' } })).toMatchObject({
    nuyen: 400,
    label: 'Taught: Fetch Fizz (command) to Fuzzpup',
  })
  expect(step({ op: 'teach', target: 'c1', line: { uid: '', what: 'training', id: 'zz.harness-training' } })).toMatchObject({ nuyen: 600 })
  const taught = ch.ledger.at(-1)!.id
  expect(preview(ch, { op: 'teach', target: 'c1', line: { uid: '', what: 'command', id: 'zz.harness-training' } }, data, cr)).toEqual({
    ok: false,
    reason: 'not-critter-training',
  })
  expect(currentBuild(ch).purchases[0].trained?.map(t => [t.name, t.taught])).toEqual([
    ['Fetch Fizz', true],
    ['Harness Training', true],
  ])
  expect(currentBuild(ch).purchases[1].trained).toEqual([{ uid: expect.any(String), what: 'command', id: 'zz.hum-along', name: 'Hum Along' }])
  // voided: the special training it was taught goes again
  const un = voidEntry(ch, taught, 'never learned it')
  expect(un.ok && currentBuild(un.ch).purchases[0].trained?.map(t => t.name)).toEqual(['Fetch Fizz'])
  expect(step({ op: 'fit', target: 'c1', line: { uid: '', kind: 'gear', id: 'zz.fuzz-harness', qty: 1, accessories: [] } })).toMatchObject({ nuyen: 120 })
  // Keen (3) with Grumpy (4): nothing left to double
  expect(step({ op: 'bond', target: 'c1', line: { uid: '', id: 'zz.keen', level: 1 }, with: { uid: '', id: 'zz.grumpy', level: 1 } })).toMatchObject({
    karma: 0,
    label: 'Critter bond: Keen with Grumpy on Fuzzpup',
  })
  // Receptive to Training 1 → 3: two levels, 6 Karma × the career factor (3); bought with the Fuzzpup at 1, its price
  // and Availability still read level 1 (the bond paid the rest)
  const pupPrice = () => (x => ({ cost: priced(x, data, cr).cost, avail: priced(x, data, cr).avail }))(currentBuild(ch).purchases[0])
  const was = pupPrice()
  expect(step({ op: 'bond', target: 'c1', line: { uid: 'r', id: 'zz.receptive', level: 3 } })).toMatchObject({ karma: 18 })
  expect(pupPrice()).toEqual(was)
  const b = currentBuild(ch),
    pup = b.purchases.find(x => x.uid === 'c1')!
  expect(pup.critterQualities?.map(y => [y.id, y.level, y.how])).toEqual([
    ['zz.receptive', 3, undefined],
    ['zz.keen', 1, 'bonded'],
    ['zz.grumpy', 1, 'bonded'],
  ])
  expect(b.purchases.map(x => x.id)).toEqual(['zz.fuzzpup', 'zz.glowcat'])
  // refusals: a negative bought, one already there, critter gear on nothing but a critter
  expect(preview(ch, { op: 'bond', target: 'c1', line: { uid: '', id: 'zz.grumpy', level: 1 } }, data, cr)).toEqual({ ok: false, reason: 'not-positive' })
  expect(preview(ch, { op: 'bond', target: 'c1', line: { uid: '', id: 'zz.keen', level: 1 } }, data, cr)).toEqual({ ok: false, reason: 'already-taken' })
  // the newest voided: Receptive back at 1
  const v = voidEntry(ch, ch.ledger.at(-1)!.id, 'oops')
  expect(v.ok && currentBuild(v.ch).purchases[0].critterQualities?.find(y => y.uid === 'r')?.level).toBe(1)
  // the file keeps it all
  expect(await valid(sr6ToXml(ch))).toEqual([])
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character).toEqual(ch)
})

test('career refusals: bond and teach name a critter, a critter quality, a level that adds, a negative not taken; a book row to price it', () => {
  const { ch, data, cr } = career()
  ch.build.purchases[0].critterQualities!.push({ uid: 'g', id: 'zz.grumpy', level: 1 })
  const why = (a: Parameters<typeof preview>[1], d = data) => (r => (r.ok ? 'ok' : r.reason))(preview(ch, a, d, cr))
  const keen = { uid: '', id: 'zz.keen', level: 1 }
  expect(why({ op: 'bond', target: 'nope', line: keen })).toBe('unknown-host')
  expect(why({ op: 'bond', target: 'c1', line: { ...keen, id: 'zz.nothing' } })).toBe('unknown-entry')
  expect(why({ op: 'bond', target: 'c1', line: { ...keen, id: 'zz.critter-bond' } })).toBe('not-a-critter-quality')
  expect(why({ op: 'bond', target: 'c1', line: { ...keen, level: 0 } })).toBe('below-one')
  expect(why({ op: 'bond', target: 'c1', line: { uid: 'r', id: 'zz.receptive', level: 1 } })).toBe('already-known')
  expect(why({ op: 'bond', target: 'c1', line: keen, with: { uid: '', id: 'zz.snuggly', level: 1 } })).toBe('not-negative')
  expect(why({ op: 'bond', target: 'c1', line: keen, with: { uid: '', id: 'zz.grumpy', level: 1 } })).toBe('already-taken')
  const fetch = { uid: '', what: 'command' as const, id: 'zz.fetch-fizz' }
  expect(why({ op: 'teach', target: 'nope', line: fetch })).toBe('unknown-host')
  expect(why({ op: 'teach', target: 'c1', line: { ...fetch, id: 'zz.nothing' } })).toBe('unknown-entry')
  // without Wild Life's OPTIONS rows there is no price to teach at
  const bare = sr6Data(
    fixtureCatalog(
      undefined,
      [
        ['critters', CRITTERS],
        ['actions', ACTIONS],
        ['qualities', QUALITIES],
      ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml })),
    ),
  )
  expect(why({ op: 'teach', target: 'c1', line: fetch }, bare)).toBe('book-value')
})

test('applying a ledger entry whose line is gone does nothing (a voided purchase under a later fit, move, bond or teach)', () => {
  const b = blankBuild('karma')
  const before = structuredClone(b)
  for (const a of [
    { op: 'unfit', target: 'gone' },
    { op: 'shift', target: 'gone', from: 'chassis', to: 'powertrain' },
    { op: 'move', target: 'gone', mount: 'm' },
    { op: 'bond', target: 'gone', line: { uid: 'q', id: 'zz.keen', level: 1 } },
    { op: 'teach', target: 'gone', line: { uid: 't', what: 'command' } },
  ] as Parameters<typeof applyAdvance>[1][])
    applyAdvance(b, a)
  expect(b).toEqual(before)
  // a bond without a negative alongside, on a critter with no qualities yet
  b.purchases.push({ uid: 'c', kind: 'critters', id: 'zz.fuzzpup', qty: 1, accessories: [] })
  applyAdvance(b, { op: 'bond', target: 'c', line: { uid: 'q', id: 'zz.keen', level: 1, how: 'bonded' } })
  expect(b.purchases[0].critterQualities).toEqual([{ uid: 'q', id: 'zz.keen', level: 1, how: 'bonded' }])
})

test('refusals on the Critters tab: a critter line, a quality or training it has, a level from 1, a catalog entry', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup')
  const why = (op: Parameters<typeof apply>[1]) => (r => (r.ok ? 'ok' : r.reason))(apply(b, op, data, cr))
  expect(why({ op: 'critter', uid: 'nope', tamed: true })).toBe('unknown-line')
  expect(why({ op: 'critterTrained', host: 'nope', id: 'zz.fetch-fizz' })).toBe('unknown-host')
  expect(why({ op: 'critterTrained', host: x.uid, uid: 'nope', taught: true })).toBe('not-taken')
  expect(why({ op: 'critterTrained', host: x.uid, id: 'zz.fetch-fizz' })).toBe('ok')
  expect(why({ op: 'critterTrained', host: x.uid, remove: x.trained![0].uid })).toBe('ok')
  expect(x.trained).toBeUndefined() // (the last one gone: none)
  expect(why({ op: 'critterQuality', host: 'nope', id: 'zz.keen' })).toBe('unknown-host')
  expect(why({ op: 'critterQuality', host: x.uid, remove: 'nope' })).toBe('not-taken')
  expect(why({ op: 'critterQuality', host: x.uid, uid: 'nope', level: 2 })).toBe('not-taken')
  expect(why({ op: 'critterQuality', host: x.uid, id: 'zz.nothing' })).toBe('unknown-entry')
  expect(why({ op: 'critterQuality', host: x.uid, id: 'zz.keen' })).toBe('ok')
  expect(why({ op: 'critterQuality', host: x.uid, uid: x.critterQualities![0].uid, level: 0 })).toBe('below-one')
})

test('a price the app can’t read, an option row missing, a custom critter, Essence past what it has: noted and warned', () => {
  const files = (gear: string) =>
    sr6Data(
      fixtureCatalog(
        undefined,
        [
          ['critters', CRITTERS],
          ['gear', gear],
          ['qualities', QUALITIES],
          ['augmentations', AUGS],
        ].map(([k, xml]) => ({ file: `custom/sr6/imported/zz/${k}.xml`, xml })),
      ),
    )
  const odd = files(GEAR.replace('Body x 70 nuyen', 'ask the fixer').replace(/<gear id="zz.trained-command"[^\n]*/, ''))
  const x: Sr6Purchase = { uid: 'c', kind: 'critters', id: 'zz.fuzzpup', qty: 1, accessories: [], trained: [C('fetch-fizz')] }
  expect(critterPrice(x, odd)).toMatchObject({ cost: 0, ok: false })
  expect(critterPrice(x, odd).notes).toEqual([
    'Pet (Mundane)’s price “ask the fixer” isn’t a number the app can read',
    'Wild Life’s Purchasing a Critter row “Trained: Command” (p. 180) isn’t in the catalog',
  ])
  // a custom critter (no id): by its name, Essence 6; five Zap Claws take 6
  const custom: Sr6Purchase = { uid: 'k', kind: 'critters', name: 'Gutter Dog', qty: 1, accessories: [] }
  const v = critterView(custom, odd, 6.5)
  expect(v.name).toBe('Gutter Dog')
  expect(v.essence).toEqual({ base: 6, left: -0.5 })
  expect(v.warnings.map(w => w.message)).toContain('Gutter Dog: its augmentations take 6.5 Essence; it has 6.')
})

test('a file’s critter quality how and trained what are one of the known; a tamed Awakened critter’s sheet notes', () => {
  const ch = blankSr6('karma', 'r', '2026-10-16T00:00:00.000Z')
  ch.build.purchases = [
    {
      uid: 'c1',
      kind: 'critters',
      id: 'zz.glowcat',
      qty: 1,
      tamed: true,
      trained: [{ uid: 't', what: 'command', id: 'zz.fetch-fizz' }],
      critterQualities: [{ uid: 'q', id: 'zz.wild-soul', level: 1, how: 'tamed' }],
      accessories: [{ uid: 'z', kind: 'augmentations', id: 'zz.zap-claws', qty: 1, accessories: [] }],
    },
  ]
  const xml = sr6ToXml(ch)
  expect(xmlToSr6(xml.replace('how="tamed"', 'how="stolen"'))).toMatchObject({ ok: false, reason: expect.stringMatching(/how “stolen”/) })
  expect(xmlToSr6(xml.replace('what="command"', 'what="trick"'))).toMatchObject({ ok: false, reason: expect.stringMatching(/what “trick”/) })
  const { data, cr } = world()
  const notes = critterNotes(ch.build.purchases[0], data, cr)
  expect(notes[0]).toBe('Awakened, tamed')
  expect(notes).toContain('Essence 4.8 after its augmentations, Magic 0')
})

const XSD = readFileSync('public/data/sr6/schema/character.xsd', 'utf8')
const valid = async (xml: string) =>
  (await validateXML({ xml: { fileName: 'r.xml', contents: xml }, schema: { fileName: 'character.xsd', contents: XSD } })).errors.map(e => e.message)

test('the file: a critter line round-trips and validates; an unknown pet class is repaired', async () => {
  const ch: Sr6Character = blankSr6('karma', 'r', '2026-10-16T00:00:00.000Z')
  ch.build.purchases = [
    {
      uid: 'c1',
      kind: 'critters',
      id: 'zz.fuzzpup',
      qty: 1,
      pet: 'wild',
      tamed: true,
      trained: [
        { uid: 't1', what: 'command', id: 'zz.fetch-fizz', name: 'Fetch Fizz', taught: true },
        { uid: 't2', what: 'training', id: 'zz.harness-training', taught: true },
      ],
      critterQualities: [
        { uid: 'a', id: 'zz.wild-soul', level: 1, name: 'Wild Soul', how: 'tamed' },
        { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded' },
        { uid: 'c', id: 'zz.snuggly', level: 1 },
      ],
      accessories: [{ uid: 'h', kind: 'gear', id: 'zz.fuzz-harness', qty: 1, accessories: [] }],
    },
  ]
  const xml = sr6ToXml(ch)
  expect(xml).toContain('<purchase uid="c1" kind="critters" id="zz.fuzzpup" qty="1" pet="wild" tamed="true">')
  expect(xml).toContain('<trained uid="t1" what="command" id="zz.fetch-fizz" name="Fetch Fizz" taught="true"/>')
  expect(await valid(xml)).toEqual([])
  const r = xmlToSr6(xml)
  expect(r.ok && r.character).toEqual(ch)
  // a pet class the app doesn't know: repaired to none, noted
  const fix: string[] = []
  const bad = xmlToSr6(xml.replace('pet="wild"', 'pet="feral"'), { repair: fix })
  expect(bad.ok && bad.character.build.purchases[0].pet).toBeUndefined()
  expect(fix).toEqual([expect.stringMatching(/pet class “feral”/)])
})

test('an older file’s counts of commands and training load as that many unnamed ones, noted; written the new way', async () => {
  const old = (tamed: string) => {
    const ch = blankSr6('karma', 'r', '2026-10-16T00:00:00.000Z')
    ch.build.purchases = [{ uid: 'c1', kind: 'critters', id: 'zz.fuzzpup', qty: 1, accessories: [] }]
    return sr6ToXml(ch).replace('<purchase uid="c1" kind="critters" id="zz.fuzzpup" qty="1"', `$&${tamed} commands="2" training="1"`)
  }
  expect(old('')).toMatch(/commands="2" training="1"/)
  const { data } = world()
  const fix: string[] = []
  const r = xmlToSr6(old(''), { repair: fix })
  if (!r.ok) throw new Error(r.reason)
  const x = r.character.build.purchases[0]
  expect(x.trained).toEqual([
    { uid: 'c1-command-1', what: 'command' },
    { uid: 'c1-command-2', what: 'command' },
    { uid: 'c1-training-1', what: 'training' },
  ])
  expect(fix).toEqual([expect.stringMatching(/3 trained commands and special training had no names.*Critters tab/)])
  expect(critterNotes(x, data, fixtureCreation())).toContain('Commands 2 of 4: Unnamed command, Unnamed command')
  // (bought with it: Body 4 + 3 at the mundane 70)
  expect(critterPrice(x, data).cost).toBe(490)
  // a tamed critter's were taught
  const t = xmlToSr6(old(' tamed="true"'))
  expect(t.ok && t.character.build.purchases[0].trained?.every(y => y.taught)).toBe(true)
  const again = sr6ToXml(r.character)
  expect(again).not.toMatch(/commands="/)
  expect(await valid(again)).toEqual([])
  expect(await valid(old(''))).toEqual([]) // (the older attributes still validate)
})

test('an older file’s counts: past 99 read as 99, not a whole number from 0 left out; noted in repair, refused without', () => {
  const ch = blankSr6('karma', 'r', '2026-10-16T00:00:00.000Z')
  ch.build.purchases = [{ uid: 'c1', kind: 'critters', id: 'zz.fuzzpup', qty: 1, accessories: [] }]
  const old = (attrs: string) => sr6ToXml(ch).replace('<purchase uid="c1" kind="critters" id="zz.fuzzpup" qty="1"', `$& ${attrs}`)
  const fix: string[] = []
  const r = xmlToSr6(old('commands="1e9" training="-2"'), { repair: fix })
  if (!r.ok) throw new Error(r.reason)
  expect(r.character.build.purchases[0].trained).toHaveLength(99)
  expect(fix).toEqual([
    expect.stringMatching(/commands count 1000000000 .* read as 99/),
    expect.stringMatching(/training count “-2” isn’t a whole number/),
    expect.stringMatching(/99 trained commands/),
  ])
  for (const a of ['commands="1e9"', 'training="1.5"']) expect(xmlToSr6(old(a))).toMatchObject({ ok: false })
})

test('every sheet’s critter lines and the export: class, stats, powers, qualities, training, what it wears', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup', { pet: 'exotic', trained: [C('fetch-fizz'), C('hum-along', true)] })
  x.critterQualities = [
    { uid: 'a', id: 'zz.snuggly', level: 1 },
    { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded' },
  ]
  x.critterQualities[0].bought = { id: 'zz.snuggly', level: 1 } // (a career bond's: never exported)
  expect(apply(b, { op: 'accessory', host: x.uid, kind: 'gear', id: 'zz.fuzz-harness' }, data, cr)).toEqual(ok)
  expect(critterNotes(x, data, cr)).toEqual([
    'Exotic pet',
    'BOD 4, AGI 3, REA 3, STR 3, WIL 2, LOG 2, INT 3, CHA 2, Essence 6',
    'Powers (innate, 0 Karma): Glow Nose, Thick Fur',
    'Weaknesses: Allergy (soap)',
    'Qualities: Snuggly, Receptive to Training 2 (bonded)',
    'Commands 2 of 6: Fetch Fizz, Hum Along (taught)',
    'Special training 0 of 8',
    'With: Fuzz Harness',
  ])
  const { c } = worldCatalog()
  const ch: Sr6Character = { ...blankSr6('karma', 'r'), build: b as Sr6Build }
  const out = exportSr6Runner(c, data, cr, ch, { descriptions: false, now: '2026-10-16T00:00:00.000Z', appVersion: 't' }).purchases[0]
  expect(out.critter).toEqual({
    class: 'exotic',
    tamed: false,
    commands: 2,
    training: 0,
    trained: [
      { what: 'command', name: 'Fetch Fizz', taught: false },
      { what: 'command', name: 'Hum Along', taught: true },
    ],
    qualities: [
      { uid: 'a', id: 'zz.snuggly', level: 1, name: 'Snuggly', positive: true },
      { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded', name: 'Receptive to Training', positive: true },
    ],
  })
  expect(out.npc?.stats.find(s => s.key === 'bod')?.value).toBe('4')
})

// Critters a runner owns (owner 2026-10-16, BUILDER Q9-Q10): Wild Life p. 180's prices by class (the player's pet class;
// Awakened and Emerged from Magic or Resonance), companion qualities with the purchase, from taming and by the bond,
// commands and special training, critter powers at 0 Karma, critterware and critter gear on a critter only, its Body in
// their prices, its Essence and Magic; the file and the career ledger. Invented entries, invented numbers.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { apply } from '../../src/sr6/engine/actions'
import { essenceBudget, priced } from '../../src/sr6/engine/budgets'
import { currentBuild, preview, record, voidEntry } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { bondKarma, critterPrice, critterValue, critterView } from '../../src/sr6/engine/critters'
import { sr6Data } from '../../src/sr6/engine/data'
import { karmaBudget } from '../../src/sr6/engine/karma'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { exportSr6Runner } from '../../src/sr6/engine/export'
import { critterNotes } from '../../src/sr6/print/view'
import { blankBuild, blankSr6, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../../src/sr6/model/character'
import { fixtureCatalog, fixtureCreation } from './fixture'

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

const worldCatalog = () => {
  const files = [
    ['critters', CRITTERS],
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

test('qualities with the purchase: ±1 Availability each, only the net Karma moves the price; commands and training', () => {
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
  // each command +400 / Availability +2, each special training +600 / +1
  x.critterQualities = []
  Object.assign(x, { commands: 2, training: 1 })
  expect(critterPrice(x, data)).toMatchObject({ cost: 800 + 800 + 600, avail: 3 + 4 + 1 })
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

test('critter qualities are a critter’s only; set, levelled, removed; commands and training never below 0', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup')
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.critter-bond' }, data, cr)).toEqual({ ok: false, reason: 'not-a-critter-quality' })
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.receptive' }, data, cr)).toEqual(ok)
  expect(apply(b, { op: 'critterQuality', host: x.uid, id: 'zz.receptive' }, data, cr)).toEqual({ ok: false, reason: 'already-taken' })
  const uid = x.critterQualities![0].uid
  expect(apply(b, { op: 'critterQuality', host: x.uid, uid, level: 2 }, data, cr)).toEqual(ok)
  expect(x.critterQualities![0].level).toBe(2)
  expect(apply(b, { op: 'critter', uid: x.uid, commands: -1 }, data, cr)).toEqual({ ok: false, reason: 'below-zero' })
  expect(apply(b, { op: 'critter', uid: x.uid, commands: 3, training: 2, pet: 'exotic' }, data, cr)).toEqual(ok)
  expect(x).toMatchObject({ commands: 3, training: 2, pet: 'exotic' })
  expect(apply(b, { op: 'critter', uid: x.uid, commands: 0 }, data, cr)).toEqual(ok)
  expect(x.commands).toBeUndefined()
  expect(apply(b, { op: 'critterQuality', host: x.uid, remove: uid }, data, cr)).toEqual(ok)
  expect(x.critterQualities).toBeUndefined()
})

test('limits: commands Logic × 2 and training Intuition × 2, moved by Receptive and Untrainable; six qualities; all warnings', () => {
  const { x, data, cr } = owning('zz.fuzzpup', { commands: 5, training: 7 })
  expect(view(x, data, cr)).toMatchObject({ commands: { n: 5, max: 4 }, training: { n: 7, max: 6 } })
  expect(view(x, data, cr).warnings.map(w => w.page)).toEqual([180, 180])
  x.critterQualities = [{ uid: 'r', id: 'zz.receptive', level: 2 }]
  expect(view(x, data, cr)).toMatchObject({ commands: { max: 6 }, training: { max: 8 } })
  x.critterQualities.push({ uid: 'u', id: 'zz.untrainable', level: 3 })
  expect(view(x, data, cr)).toMatchObject({ commands: { max: 3 }, training: { max: 5 } })
  x.commands = x.training = 0
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
  expect(step({ op: 'purchase', line: { uid: '', kind: 'critters', id: 'zz.glowcat', qty: 1, accessories: [], commands: 1 } })).toMatchObject({
    nuyen: 5500 + 400,
    label: 'Glowcat',
  })
  expect(step({ op: 'fit', target: 'c1', line: { uid: '', kind: 'gear', id: 'zz.fuzz-harness', qty: 1, accessories: [] } })).toMatchObject({ nuyen: 120 })
  // Keen (3) with Grumpy (4): nothing left to double
  expect(step({ op: 'bond', target: 'c1', line: { uid: '', id: 'zz.keen', level: 1 }, with: { uid: '', id: 'zz.grumpy', level: 1 } })).toMatchObject({
    karma: 0,
    label: 'Critter bond: Keen with Grumpy on Fuzzpup',
  })
  // Receptive to Training 1 → 3: two levels, 6 Karma × the career factor (3)
  expect(step({ op: 'bond', target: 'c1', line: { uid: 'r', id: 'zz.receptive', level: 3 } })).toMatchObject({ karma: 18 })
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
      commands: 2,
      training: 1,
      critterQualities: [
        { uid: 'a', id: 'zz.wild-soul', level: 1, name: 'Wild Soul', how: 'tamed' },
        { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded' },
        { uid: 'c', id: 'zz.snuggly', level: 1 },
      ],
      accessories: [{ uid: 'h', kind: 'gear', id: 'zz.fuzz-harness', qty: 1, accessories: [] }],
    },
  ]
  const xml = sr6ToXml(ch)
  expect(xml).toContain('<purchase uid="c1" kind="critters" id="zz.fuzzpup" qty="1" pet="wild" tamed="true" commands="2" training="1">')
  expect(await valid(xml)).toEqual([])
  const r = xmlToSr6(xml)
  expect(r.ok && r.character).toEqual(ch)
  // a pet class the app doesn't know: repaired to none, noted
  const fix: string[] = []
  const bad = xmlToSr6(xml.replace('pet="wild"', 'pet="feral"'), { repair: fix })
  expect(bad.ok && bad.character.build.purchases[0].pet).toBeUndefined()
  expect(fix).toEqual([expect.stringMatching(/pet class “feral”/)])
})

test('every sheet’s critter lines and the export: class, stats, powers, qualities, training, what it wears', () => {
  const { b, x, data, cr } = owning('zz.fuzzpup', { pet: 'exotic', commands: 2 })
  x.critterQualities = [
    { uid: 'a', id: 'zz.snuggly', level: 1 },
    { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded' },
  ]
  expect(apply(b, { op: 'accessory', host: x.uid, kind: 'gear', id: 'zz.fuzz-harness' }, data, cr)).toEqual(ok)
  expect(critterNotes(x, data, cr)).toEqual([
    'Exotic pet',
    'BOD 4, AGI 3, REA 3, STR 3, WIL 2, LOG 2, INT 3, CHA 2, Essence 6',
    'Powers (innate, 0 Karma): Glow Nose, Thick Fur',
    'Weaknesses: Allergy (soap)',
    'Qualities: Snuggly, Receptive to Training 2 (bonded)',
    'Commands 2 of 6, special training 0 of 8',
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
    qualities: [
      { uid: 'a', id: 'zz.snuggly', level: 1, name: 'Snuggly' },
      { uid: 'b', id: 'zz.receptive', level: 2, how: 'bonded', name: 'Receptive to Training' },
    ],
  })
  expect(out.npc?.stats.find(s => s.key === 'bod')?.value).toBe('4')
})

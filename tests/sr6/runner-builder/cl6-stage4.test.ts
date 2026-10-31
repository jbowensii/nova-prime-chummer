// Commlink6 behaviour-gap plan, Stage 4 (docs/analysis/sr6-cl6-behaviour-gaps.md): PRICEMOD price modifiers from data,
// the user item flags, UNMODIFYABLE, the RULE refs Commlink6 acts on (Redliner, Cyber Singularity Seeker, Neoteny), All
// Business, Empathic Retention and omega grade's Bad Luck. Invented entries on the made-up fixture.
import { expect, test } from 'vitest'
import { apply, type Op } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { allBudgets, attrRating, priceMods, priced } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { deriveSr6 } from '../../../src/sr6/runner-builder/domain/creation/derive'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { runnerRules, type CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { stampOrder } from '../../../src/sr6/runner-builder/domain/creation/cyberadept'
import { gradeFactor } from '../../../src/sr6/runner-builder/domain/creation/grades'
import { buildOf, fixtureCatalog, fixtureCreation, STONE } from '../catalog/fixture'

const doc = (kind: string, rows: string) => `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="${kind}" version="1">${rows}</sr6:data>`
const rule = (ref: string) => `<modifier kind="itemmod" type="RULE" ref="${ref}"/>`
const q = (id: string, name: string, extra = '', attrs = '') =>
  `<quality id="x.${id}" source="CRB" page="1" kind="positive" karma="5"${attrs}><name>${name}</name>${extra}</quality>`
const EXTRA = [
  {
    file: 'custom/sr6/imported/x/qualities.xml',
    xml: doc(
      'qualities',
      q('arms', 'Many Arms', '<modifier kind="valmod" type="PRICEMOD" ref="ARMOR" value="0.1"/>', ' perLevel="true" maxLevel="3"') +
        q('redliner', 'Redliner', rule('REDLINER')) +
        q('seeker', 'Cyber Singularity Seeker', rule('CYBER_SINGULARITY_SEEKER')) +
        q('neoteny', 'Neoteny', rule('PHYSICAL_ROUND_DOWN')) +
        q('business', 'All Business', rule('MAX_3_CONTACT_LOYALTY')) +
        q('empathic', 'Empathic Retention', '', ' perLevel="true" maxLevel="2"') +
        q('badluck', 'Bad Luck') +
        q('damage', 'Permanent Damage', rule('CANNOT_USE_ESSENCE_HOLE')) +
        q('regrowth', 'Essence Regrowth', rule('ESSENCE_REGROWTH')) +
        q('novice', 'Cyberadept Novice', rule('CYBERADEPT_NOVICE')) +
        q('maxjack', 'Cyberjack Maximization', rule('ADD_2_TWO_LOWEST_CYBERJACK_ATTRIBUTES')) +
        '<quality id="x.feathers" source="CRB" page="1" kind="negative" karma="4"><name>Feathers</name></quality>',
    ),
  },
  {
    file: 'custom/sr6/imported/x/augmentations.xml',
    xml: doc(
      'augmentations',
      '<augmentation id="x.arm" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="1" avail="1" cost="10"><name>Cyberarm (obvious)</name></augmentation>' +
        '<augmentation id="x.leg" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="1" avail="1" cost="10"><name>Cyberleg (obvious)</name></augmentation>' +
        '<augmentation id="x.hand" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="0.5" avail="1" cost="10"><name>Cyberhand</name></augmentation>' +
        '<augmentation id="x.spurs" source="CRB" page="1" type="bioware" category="Bodyware" essence="0.1" avail="1" cost="10"><name>Spurs</name><modifier kind="valmod" type="PRICEMOD" ref="EVERYTHING" value="0.05"/></augmentation>' +
        '<augmentation id="x.cosmetic" source="CRB" page="1" type="cyberware" category="Cosmetic" essence="*" avail="4" cost="*"><name>Metagenic cosmetic alteration</name><flag>NUYEN_COST_KARMA1000</flag></augmentation>' +
        '<augmentation id="x.jack" source="CRB" page="283" type="cyberware" category="Cyberjack" essence="1" avail="3" cost="45000"><name>Cyberjack (Rating 1)</name><text>**Attributes (d/f):** 4/3 **Matrix init bonus:** +1</text></augmentation>',
    ),
  },
  {
    file: 'custom/sr6/imported/x/weapons.xml',
    xml: doc(
      'weapons',
      '<weapon id="x.bracelet" source="CRB" page="1" category="Pistol" type="Pistol" avail="1" cost="100"><name>Dart Bracelet</name><flag>UNMODIFYABLE</flag></weapon>',
    ),
  },
]

function setup(rules: Record<string, CreationValue> = {}) {
  const data = sr6Data(fixtureCatalog(undefined, EXTRA)),
    base = fixtureCreation()
  for (const [key, value] of Object.entries(rules)) base.set(key, { key, value })
  const cr = runnerRules(base)
  const ch: Sr6Character = blankSr6('priority', 'r1', '2026-10-31T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'ACDBE', metatype: STONE, magic: 'mundane' })
  const b = ch.build,
    p = makeProvider('priority', data, cr)
  const act = (op: Op) => apply(b, op, data, cr)
  const nuyen = () => allBudgets(b, data, cr, p).nuyen
  const codes = () => validateSr6(data, cr, ch).map(v => v.code)
  const quality = (id: string, level = 1) => b.qualities.push({ uid: id, id: `x.${id}`, level })
  return { data, cr, ch, b, p, act, nuyen, codes, quality }
}
const line = (s: ReturnType<typeof setup>, key: string) => s.nuyen().breakdown?.find(l => l.key === key)

test('PRICEMOD: a levelled quality’s share times its level, and a ware’s, add up; one budget line', () => {
  const s = setup({ metatypeSizePricing: true })
  s.quality('arms', 2)
  s.b.purchases.push(
    { uid: 'v', kind: 'armor', id: 'crb.padded-vest', qty: 1, accessories: [] },
    { uid: 'w', kind: 'augmentations', id: 'x.spurs', qty: 1, accessories: [] },
  )
  expect(priceMods(s.b, s.data)).toEqual({ everything: 0.05, armor: 0.2, clothing: 0 })
  const vest = priced(s.b.purchases[0], s.data, s.cr).cost,
    spurs = priced(s.b.purchases[1], s.data, s.cr).cost
  expect(line(s, 'sizePricing')).toMatchObject({
    label: 'Price modifiers: 5% on everything bought, 20% on armor',
    amount: Math.round(vest * 0.25 + spurs * 0.05),
  })
  expect(line(setup({ metatypeSizePricing: false }), 'sizePricing')).toBeUndefined()
})

test('user flags: custom-fitted adds 7,000¥ per Agility and Strength point above 2; a knockoff costs half (owner ruling 1); armor only', () => {
  const s = setup()
  s.b.attributes.agi.points = 3
  s.b.attributes.str.points = 4
  s.b.purchases.push(
    { uid: 'v', kind: 'armor', id: 'crb.padded-vest', qty: 1, accessories: [] },
    { uid: 'g', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [] },
  )
  expect(s.act({ op: 'itemFlag', uid: 'g', flag: 'CUSTOM_FITTED', on: true })).toEqual({ ok: false, reason: 'armor-only' })
  expect(s.act({ op: 'itemFlag', uid: 'v', flag: 'CUSTOM_FITTED', on: true })).toEqual({ ok: true })
  expect(s.act({ op: 'itemFlag', uid: 'v', flag: 'CHEAP_KNOCK_OFF', on: true })).toEqual({ ok: true })
  const over2 = (k: 'agi' | 'str') => Math.max(0, attrRating(s.b, k, s.p) - 2)
  expect(line(s, 'customFitted:v')?.amount).toBe(7000 * (over2('agi') + over2('str')))
  // owner ruling 1 (2026-10-31): a knockoff costs half price, a gain line of half the price
  const vest = priced(s.b.purchases[0], s.data, s.cr).cost
  expect(line(s, 'knockOff:v')).toMatchObject({ amount: Math.round(vest / 2), sign: 'gain' })
  const custom = line(s, 'customFitted:v')!.amount
  s.act({ op: 'itemFlag', uid: 'v', flag: 'CUSTOM_FITTED', on: false })
  const n = s.nuyen()
  s.act({ op: 'itemFlag', uid: 'v', flag: 'CHEAP_KNOCK_OFF', on: false })
  expect(s.nuyen().left - n.left).toBe(-Math.round(vest / 2))
  expect(custom).toBeGreaterThan(0)
  s.act({ op: 'itemFlag', uid: 'v', flag: 'CUSTOM_FITTED', on: false })
  s.act({ op: 'itemFlag', uid: 'v', flag: 'CHEAP_KNOCK_OFF', on: false })
  expect(s.b.purchases[0].flags).toBeUndefined()
})

test('UNMODIFYABLE: the item takes no accessory', () => {
  const s = setup()
  s.b.purchases.push({ uid: 'w', kind: 'weapons', id: 'x.bracelet', qty: 1, accessories: [] })
  expect(s.act({ op: 'accessory', host: 'w', kind: 'gear', id: 'crb.zap-scope' })).toEqual({ ok: false, reason: 'This item can’t be modified.' })
})

test('Redliner and Cyber Singularity Seeker: +1 per pair of full cyberlimbs, at most +2 (a hand does not count)', () => {
  const s = setup()
  const aug = () => deriveSr6(s.data, s.cr, s.ch).attrs
  const before = aug()
  s.quality('redliner')
  s.quality('seeker')
  s.b.purchases.push(
    { uid: 'a', kind: 'augmentations', id: 'x.arm', qty: 2, accessories: [] },
    { uid: 'h', kind: 'augmentations', id: 'x.hand', qty: 1, accessories: [] },
  )
  const one = aug()
  expect(one.agi.augmented - before.agi.augmented).toBe(1)
  expect(one.str.augmented - before.str.augmented).toBe(1)
  expect(one.wil.augmented - before.wil.augmented).toBe(1)
  s.b.purchases.push({ uid: 'l', kind: 'augmentations', id: 'x.leg', qty: 4, accessories: [] })
  expect(aug().agi.augmented - before.agi.augmented).toBe(2)
})

test('Neoteny: the Physical monitor’s Body half rounds down', () => {
  const s = setup()
  const phys = () => deriveSr6(s.data, s.cr, s.ch).monitors.physical!
  const bod = deriveSr6(s.data, s.cr, s.ch).attrs.bod.augmented
  const up = phys()
  s.quality('neoteny')
  expect(phys()).toBe(bod % 2 ? up - 1 : up)
})

test('All Business: no contact’s Loyalty above 3 (refused, and Review flags one set before)', () => {
  const s = setup()
  s.act({ op: 'contact', name: 'Fixer', connection: 2, loyalty: 4 })
  expect(s.codes()).not.toContain('contact.allBusiness')
  s.quality('business')
  expect(s.codes()).toContain('contact.allBusiness')
  expect(s.act({ op: 'contact', uid: s.b.contacts[0].uid, loyalty: 5 })).toEqual({ ok: false, reason: 'loyalty-max-3' })
  expect(s.act({ op: 'contact', uid: s.b.contacts[0].uid, loyalty: 3 })).toEqual({ ok: true })
})

test('Essence loss lowers the Social Rating 1 per 2 points; Empathic Retention takes its level off', () => {
  const s = setup()
  const social = () => deriveSr6(s.data, s.cr, s.ch).socialRating
  const none = social()
  s.b.purchases.push({ uid: 'l', kind: 'augmentations', id: 'x.leg', qty: 4, accessories: [] }) // 4 Essence
  expect(social()).toBe(none - 2)
  s.quality('empathic', 1)
  expect(social()).toBe(none - 1)
})

test('omega-grade ware asks for the Bad Luck quality', () => {
  const s = setup()
  s.b.purchases.push({ uid: 'a', kind: 'augmentations', id: 'x.arm', qty: 1, grade: 'omega', accessories: [] })
  expect(s.codes()).toContain('grade.omegaBadLuck')
  s.quality('badluck')
  expect(s.codes()).not.toContain('grade.omegaBadLuck')
})

test('owner ruling 4: metagenic cosmetic alteration costs 1,000¥ and 0.1 Essence per Karma of the chosen quality (BS p. 34)', () => {
  const s = setup()
  s.b.purchases.push({ uid: 'c', kind: 'augmentations', id: 'x.cosmetic', qty: 1, note: 'Feathers', accessories: [] })
  expect(priced(s.b.purchases[0], s.data, s.cr)).toMatchObject({ cost: 4000, essence: 0.4, ok: true })
})

test('owner ruling 4: Permanent Damage fills no Essence hole and needs Essence below 6 (BS p. 16)', () => {
  const s = setup({ transhumanism: true })
  s.b.transhuman = 1
  s.b.purchases.push({ uid: 'l', kind: 'augmentations', id: 'x.hand', qty: 1, accessories: [] }) // 0.5 Essence
  const spent = () => allBudgets(s.b, s.data, s.cr, s.p).essence.spent
  expect(spent()).toBe(0)
  s.quality('damage')
  expect(spent()).toBe(0.5)
  expect(s.codes()).not.toContain('quality.permanentDamage')
  s.b.purchases.length = 0
  expect(s.codes()).toContain('quality.permanentDamage')
})

test('owner ruling 4: Essence Regrowth can’t be taken at character creation (BS p. 16)', () => {
  const s = setup()
  s.quality('regrowth')
  expect(s.codes()).toContain('quality.essenceRegrowth')
  s.ch.finalizedAt = '2026-10-31T00:00:00Z'
  expect(s.codes()).not.toContain('quality.essenceRegrowth')
})

test('owner ruling 4: Cyberjack Maximization adds 1 to the lower of the cyberjack’s printed Data Processing / Firewall (SWC p. 133)', () => {
  const s = setup()
  s.b.purchases.push({ uid: 'j', kind: 'augmentations', id: 'x.jack', qty: 1, accessories: [] })
  const jack = () => deriveSr6(s.data, s.cr, s.ch).hosts.find(h => h.uid === 'j')?.text
  expect(jack()).toBe('DATA PROCESSING 4, FIREWALL 3')
  s.quality('maxjack')
  expect(jack()).toBe('DATA PROCESSING 4, FIREWALL 4')
})

test('order: each action stamps the next order number on a new line and quality', () => {
  const s = setup()
  expect(s.act({ op: 'quality', id: 'x.badluck' })).toMatchObject({ ok: true })
  s.b.purchases.push({ uid: 'a', kind: 'augmentations', id: 'x.arm', qty: 1, accessories: [] })
  stampOrder(s.b)
  const q = s.b.qualities.find(x => x.id === 'x.badluck')!
  expect(s.b.purchases[0].seq).toBeGreaterThan(q.seq!)
})

test('owner ruling 4: Cyberadept Novice raises earlier ware a grade into an Essence hole; later ware must be alpha (H&S p. 86)', () => {
  const s = setup()
  const alpha = gradeFactor(s.cr, s.data, 'alpha', 'essence')!
  s.b.purchases.push({ uid: 'a', kind: 'augmentations', id: 'x.arm', qty: 1, seq: 1, accessories: [] }) // 1 Essence
  s.b.qualities.push({ uid: 'n', id: 'x.novice', level: 1, seq: 2 })
  s.b.purchases.push({ uid: 'h', kind: 'augmentations', id: 'x.hand', qty: 1, seq: 3, accessories: [] }) // 0.5 Essence
  const spent = allBudgets(s.b, s.data, s.cr, s.p).essence.spent
  expect(spent).toBeCloseTo(1 + Math.max(0, 0.5 - (1 - alpha)), 2)
  expect(s.codes()).toContain('grade.cyberadept')
  s.b.purchases[1].grade = 'alpha'
  expect(s.codes()).not.toContain('grade.cyberadept')
})

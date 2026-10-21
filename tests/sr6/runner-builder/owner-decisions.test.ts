// The owner's decisions on SR6 rules with no book behind them (2026-10-11), on the made-up fixture with invented entries
// and invented numbers: what Review notes or flags, what the editor refuses or doesn't offer, and the house rules and
// options (each off by default) that change a number.
import { expect, test } from 'vitest'
import { apply, type Op } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { allBudgets, augmentationRoom, cargoFactor, magicCap, metatypeSize } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { exportSr6Runner } from '../../../src/sr6/foundry/domain/export'
import { aboutOf, runnerRules, type CreationRules, type CreationValue } from '../../../src/sr6/table-setup/domain/creation'
import { qualityFitsMetatype, qualityMetatypes, sr6Data, type Sr6Data } from '../../../src/sr6/catalog/domain/data'
import { gradesFor } from '../../../src/sr6/runner-builder/domain/creation/grades'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { canFinalizeSr6, validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type MagicKind, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
import { buildOf, fixtureCatalog, fixtureCreation, STONE } from '../catalog/fixture'

const doc = (kind: string, rows: string) => `<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="${kind}" version="1">${rows}</sr6:data>`
// invented entries: two metatypes the posers' words name, two posers with invented descriptions, an exotic skill, ware
const EXTRA = [
  {
    file: 'custom/sr6/imported/x/metatypes.xml',
    xml: doc(
      'metatypes',
      ['human', 'ork', 'troll', 'gnome']
        .map(m => `<metatype id="x.${m}" source="CRB" page="1"><name>${m[0].toUpperCase()}${m.slice(1)}</name></metatype>`)
        .join(''),
    ),
  },
  {
    file: 'custom/sr6/imported/x/qualities.xml',
    xml: doc(
      'qualities',
      '<quality id="x.elf-poser" source="CRB" page="1" kind="negative" karma="2"><name>Elf Poser</name></quality>' +
        '<quality id="x.human-looking" source="CRB" page="1" kind="positive" karma="3"><name>Human-Looking</name></quality>',
    ),
  },
  {
    file: 'custom/sr6/imported/x/skills.xml',
    xml: doc('skills', '<skill id="x.exotic" source="CRB" page="1" attr="agi" untrained="false"><name>Exotic Weapons</name></skill>'),
  },
  {
    file: 'custom/sr6/imported/x/augmentations.xml',
    xml: doc(
      'augmentations',
      '<augmentation id="x.arm-a" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="1" avail="1" cost="10"><name>Arm (synthetic)</name></augmentation>' +
        '<augmentation id="x.arm-b" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="1" avail="1" cost="10"><name>Arm (obvious)</name></augmentation>' +
        '<augmentation id="x.torso" source="CRB" page="1" type="cyberware" category="Cyberlimb" essence="1" avail="1" cost="10"><name>Torso (synthetic)</name></augmentation>' +
        '<augmentation id="x.buzz-2" source="CRB" page="1" type="cyberware" category="Bodyware" essence="1" avail="1" cost="10"><name>Buzz Wires 2</name></augmentation>' +
        '<augmentation id="x.buzz-3" source="CRB" page="1" type="cyberware" category="Bodyware" essence="1" avail="1" cost="10"><name>Buzz Wires 3</name></augmentation>' +
        '<augmentation id="x.recorder" source="CRB" page="1" type="cyberware" category="Bodyware" essence="0.1" avail="1" cost="10"><name>Recorder (Skill)</name></augmentation>' +
        '<augmentation id="x.cultured" source="CRB" page="1" type="bioware" category="Cultured bioware" essence="0.2" avail="1" cost="10"><name>Grown Gland</name></augmentation>',
    ),
  },
]
function setup(rules: Record<string, CreationValue> = {}, o: { metatype?: string; magic?: MagicKind; letters?: string } = {}) {
  const cat = fixtureCatalog(undefined, EXTRA)
  cat.entries.qualities.get('x.elf-poser')!.text = 'Your blood may be human or ork, but your ears say elf. More words.'
  cat.entries.qualities.get('x.human-looking')!.text = 'Small orks and tall dwarfs do exist. You look human.'
  const data: Sr6Data = sr6Data(cat),
    base = fixtureCreation()
  for (const [key, value] of Object.entries(rules)) base.set(key, { key, value })
  const cr: CreationRules = runnerRules(base)
  const ch: Sr6Character = blankSr6('priority', 'r1', '2026-10-11T00:00:00Z')
  ch.build = buildOf('priority', { letters: o.letters ?? 'ACDBE', metatype: o.metatype ?? STONE, magic: o.magic ?? 'mundane' })
  const act = (op: Op) => apply(ch.build, op, data, cr)
  const v = () => validateSr6(data, cr, ch),
    codes = () => v().map(x => x.code)
  const budgets = () => allBudgets(ch.build, data, cr, makeProvider('priority', data, cr))
  return { cat, data, cr, ch, b: ch.build, act, v, codes, budgets }
}
const ok = { ok: true },
  no = (reason: string) => ({ ok: false, reason })

test('1, 7, 8: points left, no lifestyle, no name or alias are notes, never blocks', () => {
  const { ch, b, v } = setup()
  const notes = v().filter(x => ['points.unspent', 'lifestyle.none', 'identity.name'].includes(x.code))
  expect(notes.every(x => x.severity === 'warning')).toBe(true)
  expect(notes.map(x => x.message)).toEqual(
    expect.arrayContaining([
      expect.stringMatching(/attribute points left: they’re lost/),
      expect.stringMatching(/skill points left/),
      'No lifestyle bought: the runner lives somewhere (a lifestyle goes on a SIN).',
      'The runner has no name and no alias.',
    ]),
  )
  ch.identity.streetName = 'Moth'
  b.sins = [{ uid: 's', name: 'Me', kind: 'real', licences: [], lifestyles: [{ uid: 'l', id: 'crb.cozy', months: 1 }] }]
  expect(v().filter(x => x.code === 'lifestyle.none')).toEqual([])
  expect(v().find(x => x.code === 'identity.name')?.message).toBe('The runner has no name.')
})

test('2: Aptitude and Incompetent never on the same skill: the second note is refused; a file holding both is an error', () => {
  const { b, act, codes } = setup({ incompetentQuality: 'crb.butterfingers' })
  expect(act({ op: 'quality', id: 'crb.knack' })).toEqual(ok)
  expect(act({ op: 'quality', id: 'crb.knack', uid: b.qualities[0].uid, note: 'Tinkering' })).toEqual(ok)
  expect(act({ op: 'quality', id: 'crb.butterfingers' })).toEqual(ok)
  const inc = b.qualities[1]
  expect(act({ op: 'quality', id: 'crb.butterfingers', uid: inc.uid, note: 'Tinkering' })).toEqual(no('aptitude-incompetent'))
  expect(act({ op: 'quality', id: 'crb.butterfingers', uid: inc.uid, note: 'Gab' })).toEqual(ok)
  expect(codes()).not.toContain('quality.aptitudeIncompetent')
  inc.note = 'Tinkering'
  expect(codes()).toContain('quality.aptitudeIncompetent')
})

test('3: a pure adept takes no Magic skill but Astral: refused, and Review flags one a file holds', () => {
  const { b, act, codes } = setup({}, { magic: 'adept', letters: 'ACBDE' })
  expect(act({ op: 'skill', target: 'crb.glowcraft', pool: 'points', delta: 1 })).toEqual(no('not-for-adept'))
  b.skills.push({ id: 'crb.glowcraft', points: 1, karma: 0 })
  expect(codes()).toContain('skill.restricted')
  b.magic = 'mystic-adept'
  expect(act({ op: 'skill', target: 'crb.hexing', pool: 'points', delta: 1 })).toEqual(ok)
})

test('4: a poser quality is for the metatypes its description names, less the one it imitates', () => {
  expect(qualityMetatypes('Elf Poser', 'Your blood may be human or ork, but your ears say elf.')).toEqual(['human', 'ork'])
  expect(qualityMetatypes('Human-Looking', 'Small orks, tall dwarfs, and ugly elves do exist. You look human.')).toEqual(['ork', 'dwarf', 'elf'])
  expect(qualityMetatypes('Knack', 'Elves and orks.')).toBeUndefined()
  expect(qualityMetatypes('Ork Poser', '')).toBeUndefined()
  const { data, b, act, codes } = setup({}, { metatype: 'x.ork' })
  expect(qualityFitsMetatype(data, 'x.ork', 'x.elf-poser')).toBe(true)
  expect(qualityFitsMetatype(data, 'x.human', 'x.human-looking')).toBe(false)
  expect(act({ op: 'quality', id: 'x.human-looking' })).toEqual(ok)
  b.metatype = 'x.human'
  expect(act({ op: 'quality', id: 'x.elf-poser' })).toEqual(ok)
  expect(codes()).toContain('quality.metatype') // the human-looking human
  b.metatype = STONE
  expect(act({ op: 'quality', id: 'crb.knack' })).toEqual(ok)
  expect(setup({}, { metatype: STONE }).act({ op: 'quality', id: 'x.elf-poser' })).toEqual(no('not-for-metatype'))
})

test('5, 12: a mentor spirit brings its quality and its Karma; removing the quality removes the mentor; a mystic adept picks one advantage', () => {
  const { b, act, budgets, codes } = setup({ mentorSpiritQuality: 'crb.knack' }, { magic: 'mystic-adept', letters: 'ACBDE' })
  const karma = budgets().karma.spent
  expect(act({ op: 'mentor', id: 'crb.glow-moth' })).toEqual(ok)
  expect(b.mentorSpirit).toBe('crb.glow-moth')
  expect(b.qualities.map(q => q.id)).toEqual(['crb.knack'])
  expect(budgets().karma.spent).toBe(karma + 13)
  expect(codes()).toContain('magic.mentorAdvantage')
  expect(act({ op: 'mentor', advantage: 'adept' })).toEqual(ok)
  expect(codes()).not.toContain('magic.mentorAdvantage')
  expect(act({ op: 'quality', remove: b.qualities[0].uid })).toEqual(ok)
  expect([b.mentorSpirit, b.mentorAdvantage]).toEqual([undefined, undefined])
  expect(act({ op: 'mentor', id: 'crb.glow-moth' })).toEqual(ok)
  expect(act({ op: 'mentor', id: null })).toEqual(ok)
  expect([b.mentorSpirit, b.qualities.length]).toEqual([undefined, 0])
  // the house rule: both advantages, nothing to pick
  const both = setup({ mentorSpiritQuality: 'crb.knack', mentorBothAdvantages: true }, { magic: 'mystic-adept', letters: 'ACBDE' })
  both.act({ op: 'mentor', id: 'crb.glow-moth' })
  expect(both.codes()).not.toContain('magic.mentorAdvantage')
  expect(both.act({ op: 'mentor', advantage: 'adept' })).toEqual(ok)
  expect(setup().act({ op: 'mentor', advantage: 'adept' })).toEqual(no('not-mystic-adept'))
})

test('6: one native language a runner', () => {
  const { b, act } = setup()
  expect(act({ op: 'knowledge', name: 'Sperethiel', kind: 'language', native: true })).toEqual(ok)
  expect(act({ op: 'knowledge', name: 'Or’zet', kind: 'language', native: true })).toEqual(no('one-native'))
  expect(act({ op: 'knowledge', name: 'Or’zet', kind: 'language' })).toEqual(ok)
  expect(act({ op: 'knowledge', uid: b.knowledge[1].uid, native: true })).toEqual(no('one-native'))
  expect(act({ op: 'knowledge', uid: b.knowledge[0].uid, native: false })).toEqual(ok)
  expect(act({ op: 'knowledge', uid: b.knowledge[1].uid, native: true })).toEqual(ok)
})

test('6 (continued), effects 12: no language above languageMax; the Native one counts as that level, shown native', () => {
  const { cat, data, cr, ch, b, act } = setup({ languageMax: 4 })
  expect(act({ op: 'knowledge', name: 'Sperethiel', kind: 'language', native: true })).toEqual(ok)
  expect(act({ op: 'knowledge', name: 'Or’zet', kind: 'language' })).toEqual(ok)
  expect(act({ op: 'knowledge', name: 'Made-up lore', kind: 'knowledge' })).toEqual(ok)
  expect(act({ op: 'knowledgeRank', uid: b.knowledge[1].uid, pool: 'points', delta: 3 })).toEqual(ok) // 4
  expect(act({ op: 'knowledgeRank', uid: b.knowledge[1].uid, pool: 'karma', delta: 1 })).toEqual(no('language-max'))
  expect(act({ op: 'knowledgeRank', uid: b.knowledge[2].uid, pool: 'points', delta: 5 })).toEqual(ok) // a knowledge skill: no cap here
  const out = exportSr6Runner(cat, data, cr, ch, { descriptions: false, now: '2026-10-11T00:00:00.000Z', appVersion: 'test' })
  expect(out.knowledge.map(k => [k.name, k.native, k.rank])).toEqual([
    ['Sperethiel', true, 4],
    ['Or’zet', false, 4],
    ['Made-up lore', false, 6],
  ])
})

test('effects 15 (house rule, on by default): a troll-sized runner pays 10% more on everything bought, a dwarf-sized one on armor', () => {
  const bought = (metatype: string, on = true) => {
    const s = setup({ metatypeSizePricing: on }, { metatype })
    s.b.purchases.push(
      { uid: 'v', kind: 'armor', id: 'crb.padded-vest', qty: 1, accessories: [] },
      { uid: 's', kind: 'gear', id: 'crb.zap-scope', qty: 2, accessories: [] },
    )
    const line = s.budgets().nuyen.breakdown.find(l => l.key === 'sizePricing')
    return [s.budgets().nuyen.spent, line?.label]
  }
  expect(metatypeSize(setup().data, 'x.troll')).toBe('troll')
  expect(metatypeSize(setup().data, 'x.gnome')).toBe('dwarf')
  expect(metatypeSize(setup().data, 'x.ork')).toBeUndefined()
  expect(bought('x.ork')).toEqual([1100, undefined])
  expect(bought('x.troll')).toEqual([1210, 'Troll-sized: 10% more on everything bought'])
  expect(bought('x.gnome')).toEqual([1140, 'Dwarf-sized: 10% more on armor'])
  expect(bought('x.troll', false)).toEqual([1100, undefined])
  expect(aboutOf('metatypeSizePricing')).toMatch(/\(house rule\)\.$/)
})

test('9: each augmentation once (its ratings one), a cyberlimb once a body part and side, a choice-naming one per choice', () => {
  const { b, data, act, codes } = setup()
  const buy = (id: string) => act({ op: 'purchase', kind: 'augmentations', id })
  expect(buy('x.buzz-2')).toEqual(ok)
  expect(buy('x.buzz-3')).toEqual(no('once-per-runner'))
  expect([buy('x.arm-a'), buy('x.arm-b'), buy('x.arm-a')]).toEqual([ok, ok, no('once-per-runner')])
  expect([buy('x.torso'), buy('x.torso')]).toEqual([ok, no('once-per-runner')])
  expect([buy('x.recorder'), buy('x.recorder')]).toEqual([ok, ok])
  expect(augmentationRoom(b, data, data.entry('augmentations', 'x.arm-b'))).toBe(0)
  expect(codes()).not.toContain('gear.augmentationTwice')
  b.purchases.push({ uid: 'dup', kind: 'augmentations', id: 'x.buzz-3', qty: 1, accessories: [] })
  expect(codes()).toContain('gear.augmentationTwice')
})

test('10 (house rule): the first Exotic Weapons specialization costs nothing', () => {
  const run = (on: boolean) => {
    const s = setup({ exoticFirstSpecFree: on })
    s.b.skills.push({ id: 'x.exotic', points: 0, karma: 1, spec: 'Whips' })
    return s.budgets().karma.spent
  }
  expect(run(false) - run(true)).toBe(7) // the fixture's specialization price
})

test('11: a gun with no ammunition for it is a reminder', () => {
  const { b, v } = setup()
  b.purchases.push({ uid: 'g', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] })
  expect(
    v()
      .filter(x => x.code === 'gear.ammo')
      .map(x => [x.severity, x.message]),
  ).toEqual([['warning', 'Zap Gun has no ammunition bought for it.']])
  b.purchases.push({ uid: 'a', kind: 'gear', id: 'crb.zap-pellets', qty: 1, accessories: [] })
  expect(
    v()
      .filter(x => x.code === 'gear.ammo')
      .map(x => x.message + x.path),
  ).toEqual([])
})

test('13 (house rule): data structures cost their level in Karma and level × the price in nuyen; the GM’s caps flag past them', () => {
  const { b, act, budgets, codes, v } = setup({ dataStructureNuyen: 100 }, { magic: 'technomancer', letters: 'ACBDE' })
  expect(act({ op: 'pick', kind: 'datastructures', id: 'crb.zap-shell' })).toEqual(ok)
  expect(act({ op: 'pick', kind: 'datastructures', id: 'crb.zap-shell' })).toEqual(ok) // level 2
  expect(b.picks[0].level).toBe(2)
  expect(budgets().karma.breakdown?.find(l => l.key === 'dataStructures')?.amount).toBe(2)
  expect(budgets().nuyen.breakdown?.find(l => l.key === 'dataStructures')?.amount).toBe(200)
  expect(codes()).not.toContain('magic.dataStructureCaps')
  const capped = setup({ dataStructureCaps: true, 'dataStructure.maxCount': 0, 'dataStructure.maxRating': 1 }, { magic: 'technomancer', letters: 'ACBDE' })
  capped.b.picks.push({ uid: 'd', kind: 'datastructures', id: 'crb.zap-shell', level: 2 })
  expect(
    capped
      .v()
      .filter(x => x.code === 'magic.dataStructureCaps')
      .map(x => x.severity),
  ).toEqual(['error', 'error'])
  expect(v().filter(x => x.code === 'setting.unset')).toEqual([])
})

test('14 (house rule): no used grade on cultured bioware', () => {
  const { data, cr } = setup({ 'grade:used:essence': 1.1, 'grade:used:cost': 0.5 })
  const e = data.entry('augmentations', 'x.cultured')!
  expect(gradesFor(cr, data, e)).toContain('used')
  const off = setup({ 'grade:used:essence': 1.1, 'grade:used:cost': 0.5, noUsedCulturedBioware: true })
  expect(gradesFor(off.cr, off.data, e)).not.toContain('used')
  expect(gradesFor(off.cr, off.data, off.data.entry('augmentations', 'crb.spring-tendons'))).toContain('used')
})

test('15 (house rule): the GM’s grade caps at creation', () => {
  const { b, codes } = setup({ gradeCapAtCreation: true, 'gradeCap.initiation': 1, 'gradeCap.submersion': 1 }, { magic: 'adept', letters: 'ACBDE' })
  b.initiation = 2
  expect(codes()).toContain('magic.gradeCapCreation')
  b.initiation = 1
  expect(codes()).not.toContain('magic.gradeCapCreation')
})

test('16 (house rule): adjustment points on an attribute whose metatype maximum is lowered', () => {
  // Stonefolk: Logic 5, below the base 6
  const run = (on: boolean) => {
    const s = setup({ adjustOnLoweredMax: on })
    s.b.attributes.log.adjust = 1
    return s.codes().includes('attr.adjustTargets')
  }
  expect([run(false), run(true)]).toEqual([true, false])
})

test('17, 21 (house rules): numbers that are the rule itself, while on', () => {
  const on = (rules: Record<string, CreationValue>) => setup(rules).cr
  expect(on({ pointBuyErrataNuyen: true }).get('pointBuy.max.nuyen')?.value).toBe(450000)
  expect(on({ availabilitySeven: true }).get('maxAvailability')?.value).toBe(7)
  expect(on({ eliteSumToThirteen: true }).get('sumToTenTarget')?.value).toBe(11) // needs Elite
  expect(on({ eliteSumToThirteen: true, levelSwcElite: true, 'swcElite.sumToTen': 12 }).get('sumToTenTarget')?.value).toBe(13)
  expect(on({}).get('maxAvailability')?.value).toBe(5)
})

test('18 (house rule): knowledge points from Logic + Intuition', () => {
  const k = (on: boolean) => {
    const s = setup({ knowledgeLogicIntuition: on })
    s.b.attributes.int.points = 2
    return s.budgets().knowledgePoints.max
  }
  expect(k(true) - k(false)).toBe(2 * 3) // INT 3 × the fixture's 2 a point
})

test('19: negative Karma or nuyen blocks Finalize, whatever a GM approves', () => {
  const { ch, b, v } = setup({ maxKarmaLeft: 999, maxNuyenLeft: 9e9 })
  b.attributes.bod.karma = 9
  ch.overrides = [{ code: 'karma.overspent', path: 'review', note: 'fine' }]
  const k = v().find(x => x.code === 'karma.overspent')!
  expect([k.hard, k.approved]).toEqual([true, undefined])
  expect(canFinalizeSr6(v())).toBe(false)
})

test('20 (option): Magic at creation up to the highest plus the initiation grade', () => {
  const { b, cr } = setup({}, { magic: 'adept' })
  b.initiation = 2
  expect(magicCap(b, cr, 'mag')).toBe(7)
  expect(magicCap(b, setup({ magicAboveSixByGrade: true }).cr, 'mag')).toBe(9)
})

test('22 (option): a vehicle’s Cargo Factor, and seats removed add to it', () => {
  const car = { attrs: { category: 'Car', seats: '2/4' } } as unknown as Sr6Entry,
    bike = { attrs: { category: 'Bike', seats: '2' } } as unknown as Sr6Entry
  const truck = { attrs: { category: 'Truck', seats: '2' } } as unknown as Sr6Entry
  const line = (n?: number) => ({ uid: 'v', kind: 'vehicles' as const, qty: 1, accessories: [], ...(n ? { seatsRemoved: n } : {}) })
  expect(cargoFactor(line(), car)).toEqual({ seats: 4, cargo: 6 })
  expect(cargoFactor(line(2), car)).toEqual({ seats: 2, cargo: 9 })
  expect(cargoFactor(line(1), bike)).toEqual({ seats: 1, cargo: 3 })
  expect(cargoFactor(line(), truck)).toEqual({ seats: 2, cargo: 7 })
  const { b, act } = setup()
  b.purchases.push({ uid: 'p', kind: 'vehicles', id: 'crb.putt-putt', qty: 1, accessories: [] })
  expect([act({ op: 'seats', uid: 'p', removed: 1 }), act({ op: 'seats', uid: 'p', removed: 2 })]).toEqual([ok, no('at-maximum')])
})

test('U25–U28: a value under its toggle applies only while the toggle is on', () => {
  const base = { karmaToNuyenMax: 2, positiveQualityFactor: 3, 'advance.powerPoint': 4, 'karmaBuild.start': 99 }
  const off = setup({ ...base, karmaToNuyenCap: false, positiveQualityMultiplier: false, buyPowerPoints: false, karmaBuildMethod: false }).cr
  expect(['karmaToNuyenMax', 'positiveQualityFactor', 'advance.powerPoint', 'karmaBuild.start'].filter(k => off.has(k))).toEqual([])
  const { b, act } = setup({ ...base, karmaToNuyenCap: false })
  expect(act({ op: 'karmaToNuyen', delta: 5 })).toEqual(ok) // no limit: the book prints none
  expect(b.karmaToNuyen).toBe(5)
  expect(setup({ ...base, karmaToNuyenCap: true }).act({ op: 'karmaToNuyen', delta: 3 })).toEqual(no('conversion-cap'))
})

test('U24, U31: an expertise with skill points is cited as the book’s discrepancy; the illegal-only reading as the 2019 printing', () => {
  expect(aboutOf('skillPointsExpertise')).toMatch(/pp\. 65, 68\)\.$/)
  const { ch, codes, v } = setup()
  ch.rules = [{ key: 'availabilityCapIllegalOnly', value: 'true', assumed: true, source: 'CRB', page: 66 }]
  expect(codes()).toContain('rules.assumed')
  expect(v().find(x => x.code === 'rules.assumed')?.message).toMatch(/assumed: 2019 printing/)
})

test('23, L1, 0 (verified): metatype traits never count toward the six in any method; one level of play; Karma to nuyen and back', () => {
  for (const method of ['priority', 'pointbuy', 'lifepath'] as const) {
    const { ch, data, cr } = setup({ qualityMaxCount: 1 })
    ch.build = buildOf(method, { letters: method === 'priority' ? 'ACDBE' : undefined, metatype: STONE })
    ch.build.qualities = [
      { uid: 't1', id: 'crb.stoneskin', level: 1, free: true },
      { uid: 't2', id: 'crb.lucky-streak', level: 1, free: true },
      { uid: 'q', id: 'crb.knack', level: 1 },
    ]
    expect(
      validateSr6(data, cr, ch).map(x => x.code),
      method,
    ).not.toContain('quality.maxCount')
  }
  const levels = setup({ levelStreet: true, levelSwcElite: true, levelPrime: true }).cr
  expect(['levelStreet', 'levelPrime', 'levelSwcStreet', 'levelSwcElite'].filter(k => levels.get(k)?.value === true)).toHaveLength(1)
  const { b, act } = setup()
  expect([act({ op: 'karmaToNuyen', delta: 2 }), act({ op: 'karmaToNuyen', delta: -2 }), act({ op: 'karmaToNuyen', delta: -1 })]).toEqual([
    ok,
    ok,
    no('below-zero'),
  ])
  expect(b.karmaToNuyen).toBe(0)
})

test('nuyen overspent (no GM can approve it) names the size pricing house rule when it adds to the cost', () => {
  const message = (on: boolean) => {
    const s = setup({ metatypeSizePricing: on }, { metatype: 'x.troll' })
    s.b.purchases.push({ uid: 's', kind: 'gear', id: 'crb.zap-scope', qty: 50000, accessories: [] })
    return s.v().find(x => x.code === 'nuyen.overspent')?.message
  }
  expect(message(true)).toMatch(/^Nuyen overspent by [\d,]+¥; the house rule ‘size pricing’ adds [\d,]+¥\.$/)
  expect(message(false)).toMatch(/^Nuyen overspent by [\d,]+¥\.$/)
})

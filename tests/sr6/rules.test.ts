// Creation rules, Review's checks (src/sr6/engine/rules.ts), on the made-up fixture and its invented creation rules: each
// SR6 Forge validation test's idea re-expressed with invented numbers, plus the Review data (pages, unset settings,
// entries gone from the catalog, approvals).
import { expect, test } from 'vitest'
import { blankSr6, type MagicKind, type PurchaseKind, type Sr6Build, type Sr6Character, type Sr6Purchase } from '../../src/sr6/model/character'
import { canFinalizeSr6, validateSr6 } from '../../src/sr6/engine/rules'
import { buildOf, GLIM, made, STONE } from './fixture'

type Over = Parameters<typeof made>[0]
/** A legal priority runner: Stonefolk at A, attributes C (13), magic D, skills B (23), resources E (8,200¥). */
function runner(o: { letters?: string; magic?: MagicKind; metatype?: string; method?: Sr6Build['method'] } = {}): Sr6Character {
  const ch = blankSr6(o.method ?? 'priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf(o.method ?? 'priority', { letters: o.method && o.method !== 'priority' ? undefined : o.letters ?? 'ACDBE',
    metatype: o.metatype ?? STONE, magic: o.magic ?? 'mundane' })
  return ch
}
const check = (ch: Sr6Character, over?: Over) => { const { data, cr } = made(over); return validateSr6(data, cr, ch) }
const codes = (ch: Sr6Character, over?: Over) => check(ch, over).map(v => v.code)
const only = (ch: Sr6Character, code: string, over?: Over) => check(ch, over).filter(v => v.code === code)
let n = 0
const buy = (b: Sr6Build, kind: PurchaseKind, id: string | undefined, more: Partial<Sr6Purchase> = {}): Sr6Purchase => {
  const p: Sr6Purchase = { uid: `p${++n}`, kind, id, qty: 1, accessories: [], ...more }
  b.purchases.push(p)
  return p
}
const quality = (b: Sr6Build, id: string, level = 1, free?: true) => {
  const uid = `q${++n}`
  b.qualities.push({ uid, id, level, ...(free ? { free } : {}) })
  return uid
}
const pick = (b: Sr6Build, kind: Sr6Build['picks'][number]['kind'], id: string, more: object = {}) => {
  const uid = `k${++n}`
  b.picks.push({ uid, kind, id, ...more })
  return uid
}
/** The fixture's three unresolved metatype traits are warnings from the catalog itself (data.unresolved). */
const errors = (ch: Sr6Character, over?: Over) => check(ch, over).filter(v => v.severity === 'error').map(v => v.code)

test('a blank legal runner has no errors; the catalog’s own problems pass through as warnings', () => {
  const v = check(runner())
  expect(v.filter(x => x.severity === 'error')).toEqual([])
  expect(v.filter(x => x.code === 'data.unresolved')).toHaveLength(3)
})

// priorities and legality
test('priority: every column needs a letter, each letter once', () => {
  const ch = runner()
  ch.build.priorities.skills = null
  expect(codes(ch)).toEqual(expect.arrayContaining(['prio.allAssigned', 'prio.lettersValid']))
  ch.build.priorities.skills = 'A'
  expect(codes(ch)).not.toContain('prio.allAssigned')
  expect(codes(ch)).toContain('prio.lettersValid')
})

test('sum to ten: letters over the target are flagged with the target’s page', () => {
  const ch = runner({ method: 'sumtoten' })
  ch.build.priorities = { metatype: 'A', attributes: 'A', magic: 'C', skills: 'E', resources: 'E' }
  expect(only(ch, 'prio.lettersValid')).toMatchObject([{ severity: 'error', source: 'CRB', page: 67 }])
})

test('the metatype and magic kind must be legal at their letters', () => {
  const ch = runner({ metatype: '' })
  expect(only(ch, 'prio.metatypeAllowed')[0].message).toBe('Pick a metatype.')
  ch.build.metatype = STONE
  expect(codes(ch, { data: d => { delete d.priorities.A!.metatypes[STONE] } })).toContain('prio.metatypeAllowed')
  ch.build.magic = 'full' // magic D: adept and aspected only
  expect(only(ch, 'prio.magicAllowed')[0].message).toBe('Full magician isn’t available at magic priority D.')
})

// attributes
test('attributes: the creation maximum comes from the metatype; Edge too', () => {
  const ch = runner()
  ch.build.attributes.bod.points = 8 // 9, Stonefolk's maximum
  expect(codes(ch)).not.toContain('attr.creationMax')
  ch.build.attributes.bod.points = 9
  expect(only(ch, 'attr.creationMax')).toMatchObject([{ path: 'attributes.bod', message: 'BOD 10 is above Stonefolk’s maximum of 9.' }])
  ch.build.attributes.bod.points = 0
  ch.build.attributes.edg.karma = 3
  expect(only(ch, 'attr.creationMax')[0].path).toBe('attributes.edg')
})

test('attributes: only one may sit at its maximum, when the setting says so', () => {
  const ch = runner()
  ch.build.attributes.bod.points = 8
  ch.build.attributes.str.points = 8
  expect(only(ch, 'attr.oneAtMax')).toMatchObject([{ page: 61 }])
  expect(codes(ch, { rules: { oneAttributeAtMax: false } })).not.toContain('attr.oneAtMax')
})

test('attributes: adjustment points go on Edge, Magic and raised attributes only', () => {
  const ch = runner()
  ch.build.attributes.edg.adjust = 1
  ch.build.attributes.bod.adjust = 1 // Stonefolk BOD max 9, above 6
  expect(codes(ch)).not.toContain('attr.adjustTargets')
  ch.build.attributes.log.adjust = 1 // max 5
  expect(only(ch, 'attr.adjustTargets')).toMatchObject([{ path: 'attributes.log' }])
})

test('attributes: overspent points and adjustment points are flagged', () => {
  const ch = runner()
  ch.build.attributes.agi.points = 14
  ch.build.attributes.edg.adjust = 12
  expect(codes(ch)).toEqual(expect.arrayContaining(['attr.overspent', 'adjust.overspent']))
})

test('attributes: Magic above the setting is flagged', () => {
  const ch = runner({ letters: 'ACBDE', magic: 'adept' }) // magic B: adept 5
  ch.build.attributes.mag.karma = 2
  expect(codes(ch)).not.toContain('attr.specialMax')
  ch.build.attributes.mag.karma = 3
  expect(only(ch, 'attr.specialMax')).toMatchObject([{ path: 'attributes.mag', page: 62 }])
})

// skills
test('skills: a Magic skill needs an awakened runner; an aspected magician keeps to its one', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.hexing', points: 2, karma: 0 })
  expect(only(ch, 'skill.restricted')).toMatchObject([{ path: 'skills.crb.hexing' }])
  ch.build.magic = 'aspected'
  ch.build.aspectedSkill = 'crb.hexing'
  expect(codes(ch)).not.toContain('skill.restricted')
  ch.build.skills.push({ id: 'crb.glowcraft', points: 1, karma: 0 })
  expect(only(ch, 'skill.restricted')).toMatchObject([{ path: 'skills.crb.glowcraft' }])
  ch.build.skills.push({ id: 'crb.wirespeak', points: 1, karma: 0 })
  expect(only(ch, 'skill.restricted').map(v => v.path)).toContain('skills.crb.wirespeak')
})

test('skills: the cap, karma ranks counting toward it; with the aptitude quality one skill may go one higher', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 4, karma: 1 })
  expect(codes(ch)).not.toContain('skill.cap')
  ch.build.skills[0].karma = 2
  expect(only(ch, 'skill.cap')).toMatchObject([{ path: 'skills.crb.gab', page: 61 }])
  quality(ch.build, 'crb.knack')
  expect(codes(ch)).not.toContain('skill.cap')
  ch.build.skills.push({ id: 'crb.tinkering', points: 6, karma: 0 })
  expect(only(ch, 'skill.cap')).toHaveLength(1)
})

test('skills: only one at the highest rank when the table says so; no expertise at creation unless it is priced', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 5, karma: 0 }, { id: 'crb.tinkering', points: 5, karma: 0 })
  expect(codes(ch)).not.toContain('skill.oneAtMax')  // the fixture's oneSkillAtMax is false
  expect(only(ch, 'skill.oneAtMax', { rules: { oneSkillAtMax: true } })).toHaveLength(1)
  ch.build.skills[1].points = 4
  expect(codes(ch, { rules: { oneSkillAtMax: true } })).not.toContain('skill.oneAtMax')
  ch.build.skills[0].spec = 'Haggling'
  ch.build.skills[0].expertise = 'Bargains'
  expect(codes(ch)).not.toContain('skill.expertise')
  expect(only(ch, 'skill.expertise', { unset: ['skillPointsExpertise'] })).toMatchObject([{ path: 'skills.crb.gab' }])
})

test('skills: overspent skill points are flagged', () => {
  const ch = runner()
  ch.build.skills.push({ id: 'crb.gab', points: 5, karma: 0, spec: 'Fibbing' }, { id: 'crb.tinkering', points: 5, karma: 0 },
    { id: 'crb.hexing', points: 0, karma: 0 })
  expect(codes(ch)).not.toContain('skill.overspent') // 5 + 3 + 5 = 13 of 23
  ch.build.skills[1].points = 16
  expect(codes(ch)).toContain('skill.overspent')
})

// qualities
test('qualities: the cap is on net bonus karma; free traits don’t count toward the most', () => {
  const ch = runner()
  quality(ch.build, 'crb.butterfingers')
  quality(ch.build, 'crb.deep-pockets-debt') // 17 net, the cap
  quality(ch.build, 'crb.stoneskin', 1, true)
  expect(codes(ch)).not.toContain('quality.netBonusCap')
  expect(only(ch, 'quality.netBonusCap', { rules: { qualityNetBonusCap: 16 } })).toMatchObject([{ message: 'Negative qualities give 17 karma more than positive ones cost; the most is 16.' }])
  expect(codes(ch, { rules: { qualityMaxCount: 2 } })).not.toContain('quality.maxCount')
  expect(codes(ch, { rules: { qualityMaxCount: 1 } })).toContain('quality.maxCount')
})

test('qualities: a level above the highest is flagged, with the quality’s page', () => {
  const ch = runner()
  const uid = quality(ch.build, 'crb.lucky-streak', 4)
  expect(only(ch, 'quality.level')).toMatchObject([{ path: `qualities.${uid}`, source: 'CRB', page: 70 }])
  ch.build.qualities[0].level = 3
  const knack = quality(ch.build, 'crb.knack', 2)
  expect(only(ch, 'quality.level')).toMatchObject([{ path: `qualities.${knack}` }])
})

// karma, nuyen, gear
test('karma and nuyen overspent are errors; leftovers above the settings are warnings', () => {
  const ch = runner()
  quality(ch.build, 'crb.knack')
  ch.build.attributes.bod.karma = 4
  buy(ch.build, 'weapons', 'crb.fizz-rifle-70', { qty: 8 })
  expect(errors(ch)).toEqual(expect.arrayContaining(['karma.overspent', 'nuyen.overspent']))
  const rich = runner({ letters: 'ACDBA' })
  expect(only(rich, 'leftover.karma')).toMatchObject([{ severity: 'warning', page: 64 }])
  expect(only(rich, 'leftover.nuyen')).toMatchObject([{ severity: 'warning' }])
})

test('gear: Availability by rating against the cap; an accessory counts too', () => {
  const ch = runner({ letters: 'ACDBA' })
  const box = buy(ch.build, 'electronics', 'crb.buzz-box', { rating: 5 })
  expect(codes(ch)).not.toContain('gear.availCap')
  box.rating = 6
  expect(only(ch, 'gear.availCap')).toMatchObject([{ path: `gear.${box.uid}`, message: 'Buzz Box’s Availability 6 is above 5.', page: 63 }])
  box.rating = 1
  buy(ch.build, 'weapons', 'crb.zap-gun', { accessories: [{ uid: 'acc', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [] }] })
  expect(only(ch, 'gear.availCap', { data: d => { d.entry('gear', 'crb.zap-scope')!.attrs.avail = '6' } }))
    .toMatchObject([{ message: 'Zap Scope’s Availability 6 is above 5.' }])
})

test('gear: a rating outside the item’s range is flagged; Essence at 0 is flagged', () => {
  const ch = runner({ letters: 'ACDBA' })
  const eyes = buy(ch.build, 'augmentations', 'crb.glow-eyes', { rating: 4 })
  expect(only(ch, 'gear.ratingRange')).toMatchObject([{ path: `augmentations.${eyes.uid}`, message: 'Glow Eyes comes in ratings 1–3, not 4.', page: 283 }])
  eyes.rating = 2
  expect(codes(ch)).not.toContain('essence.positive')
  expect(codes(ch, { rules: { essence: 0.2 } })).toContain('essence.positive')
})

test('gear: a value the app can’t read is a warning with the entry’s page', () => {
  const ch = runner({ letters: 'ACDBA' })
  const gun = buy(ch.build, 'weapons', 'crb.zap-gun')
  expect(only(ch, 'catalog.bookValue', { data: d => { d.entry('weapons', 'crb.zap-gun')!.attrs.cost = '12x' } }))
    .toMatchObject([{ severity: 'warning', path: `gear.${gun.uid}`, source: 'CRB', page: 250 }])
})

// magic
test('magic: spells for a mundane, forms for a magician and powers for a non-adept are flagged', () => {
  const ch = runner()
  pick(ch.build, 'spells', 'crb.glow-ward')
  expect(only(ch, 'magic.spellsAllowed')[0].message).toBe('A mundane can’t have Glow Ward.')
  ch.build.picks = []
  ch.build.magic = 'aspected'
  pick(ch.build, 'complexforms', 'crb.static-veil')
  pick(ch.build, 'adeptpowers', 'crb.quick-step')
  expect(codes(ch)).toEqual(expect.arrayContaining(['magic.spellsAllowed', 'adept.ppBudget']))
})

test('magic: overspent power points; a mystic adept buys no more than its priority Magic', () => {
  const ch = runner({ letters: 'ACDBE', magic: 'adept' }) // magic D: adept 1
  pick(ch.build, 'adeptpowers', 'crb.quick-step', { level: 4 })
  expect(codes(ch)).not.toContain('adept.ppBudget')
  pick(ch.build, 'adeptpowers', 'crb.quick-step', { level: 1 })
  expect(codes(ch)).toContain('adept.ppBudget')
  const m = runner({ letters: 'ACBDE', magic: 'mystic-adept' }) // magic B: mystic adept 3
  m.build.powerPointsBought = 3
  expect(codes(m)).not.toContain('adept.ppCap')
  m.build.powerPointsBought = 4
  expect(codes(m)).toContain('adept.ppCap')
})

// contacts and knowledge
test('contacts: a rating above Charisma and overspent points are flagged', () => {
  const ch = runner()
  ch.build.attributes.cha.points = 2 // CHA 3: 9 points, cap 3
  ch.build.contacts.push({ uid: 'c1', name: 'Fixer', archetype: 'fixer', connection: 2, loyalty: 2 })
  expect(codes(ch)).not.toContain('contact.ratingCap')
  ch.build.contacts.push({ uid: 'c2', name: 'Mr. Smith', archetype: 'johnson', connection: 4, loyalty: 1 })
  expect(only(ch, 'contact.ratingCap')).toMatchObject([{ path: 'contacts.c2' }])
  expect(codes(ch)).not.toContain('contact.budget')
  ch.build.contacts.push({ uid: 'c3', name: 'Doc', archetype: 'doc', connection: 1, loyalty: 1 })
  expect(codes(ch)).toContain('contact.budget')
})

test('knowledge: overspent knowledge points are flagged', () => {
  const ch = runner()
  ch.build.knowledge.push({ uid: 'k1', name: 'Rooftops', kind: 'knowledge', points: 3, karma: 0 })
  expect(codes(ch)).toContain('knowledge.budget') // LOG 1 × 2
})

// point buy
test('point buy: every character point must be spent, with the setting’s page; overspending is flagged', () => {
  const ch = runner({ method: 'pointbuy' })
  expect(only(ch, 'pointbuy.unspent')).toMatchObject([{ severity: 'error', message: '90 character points left: spend them all.', source: 'CRB', page: 68 }])
  Object.assign(ch.build.cp, { attribute: 19, skill: 19, adjustment: 11 })
  expect(codes(ch)).toContain('pointbuy.overspent')
  expect(codes(ch)).not.toContain('pointbuy.unspent')
})

test('point buy: each pool has its most; only one specialization', () => {
  const ch = runner({ method: 'pointbuy' })
  Object.assign(ch.build.cp, { attribute: 20 })
  expect(only(ch, 'pointbuy.poolCap')[0].message).toBe('20 character points in attribute points; the most is 19.')
  ch.build.cp.attribute = 0
  ch.build.cp.resources = 27 // 405,000¥ over 390,000
  expect(codes(ch)).toContain('pointbuy.poolCap')
  ch.build.cp.resources = 0
  ch.build.skills.push({ id: 'crb.gab', points: 2, karma: 0, spec: 'Fibbing' }, { id: 'crb.tinkering', points: 2, karma: 0 })
  expect(codes(ch)).not.toContain('pointbuy.oneSpecialization')
  ch.build.skills[1].spec = 'Gizmos'
  expect(codes(ch)).toContain('pointbuy.oneSpecialization')
})

// lifepath
test('lifepath: exactly the setting’s count of adult modules; every mixed choice assigned', () => {
  const ch = runner({ method: 'lifepath', magic: 'full' })
  expect(only(ch, 'lifepath.moduleCount')[0]).toMatchObject({ message: '0 adult life modules taken; take 7.', page: 72 })
  for (const id of ['crb.street-sweeper', 'crb.wage-drone', 'crb.back-alley-medic', 'crb.glow-apprentice', 'crb.rooftop-runner',
    'crb.dock-rat', 'crb.gutter-poet']) ch.build.lifepath.push({ id, choices: {} })
  expect(codes(ch)).not.toContain('lifepath.moduleCount')
  expect(only(ch, 'lifepath.mixedChoices')).toMatchObject([{ path: 'method.crb.glow-apprentice', message: 'Glow Apprentice: pick where its choice goes.' }])
  ch.build.lifepath[3].choices = { 0: 'edg' }
  expect(codes(ch)).not.toContain('lifepath.mixedChoices')
})

// Review data
test('every violation whose setting has a page carries it', () => {
  const ch = runner()
  ch.build.attributes.bod.points = 8; ch.build.attributes.str.points = 8
  ch.build.skills.push({ id: 'crb.gab', points: 6, karma: 0 })
  for (const v of check(ch).filter(x => ['attr.oneAtMax', 'skill.cap'].includes(x.code))) expect(v.page, v.code).toBeGreaterThan(0)
})

test('an unset setting is one warning naming it, and the rule it feeds is skipped', () => {
  const ch = runner({ letters: 'ACDBA' })
  buy(ch.build, 'electronics', 'crb.buzz-box', { rating: 6 })
  buy(ch.build, 'electronics', 'crb.buzz-box', { rating: 6 })
  const v = check(ch, { unset: ['maxAvailability'] })
  expect(v.filter(x => x.code === 'gear.availCap')).toEqual([])
  expect(v.filter(x => x.code === 'setting.unset')).toMatchObject([{ severity: 'warning', message: 'Highest Availability isn’t set: Game data → Creation rules.' }])
})

test('a line whose entry left the catalog is an error naming it from its snapshot or stored name', () => {
  const ch = runner({ letters: 'ACDBA' })
  const { data } = made()
  const gun = buy(ch.build, 'weapons', 'crb.zap-gun', { snapshot: { ...data.entry('weapons', 'crb.zap-gun')!, name: 'Old Zap Gun' } })
  quality(ch.build, 'crb.gone')
  ch.build.qualities[0].name = 'Vanished Luck'
  pick(ch.build, 'spells', 'crb.nope', { name: 'Lost Spell' })
  ch.build.skills.push({ id: 'crb.forgotten', points: 1, karma: 0 })
  const v = only(ch, 'catalog.missing', { data: d => { const e = d.entry; d.entry = (k, id) => (id === 'crb.zap-gun' ? undefined : e(k, id)) } })
  expect(v.map(x => x.message)).toEqual(['crb.forgotten is no longer in the catalog.', 'Vanished Luck is no longer in the catalog.',
    'Lost Spell is no longer in the catalog.', 'Old Zap Gun is no longer in the catalog.'])
  expect(v.find(x => x.message.startsWith('Old'))?.path).toBe(`gear.${gun.uid}`)
  expect(v.every(x => x.severity === 'error')).toBe(true)
})

test('a GM override approves an error; canFinalizeSr6 then allows it', () => {
  const ch = runner()
  ch.build.attributes.bod.points = 9
  expect(canFinalizeSr6(check(ch))).toBe(false)
  ch.overrides.push({ code: 'attr.creationMax', path: 'attributes.bod', note: 'Born big' })
  const v = check(ch)
  expect(v.find(x => x.code === 'attr.creationMax')?.approved).toBe(true)
  expect(canFinalizeSr6(v)).toBe(true)
})

test('Glimmerkin and karma build: nothing throws on a runner with every list filled', () => {
  const ch = runner({ method: 'karma', metatype: GLIM, magic: 'technomancer' })
  pick(ch.build, 'complexforms', 'crb.static-veil')
  buy(ch.build, 'gear', undefined, { name: 'Lucky charm', cost: 5 })
  ch.build.lifestyle = { id: 'crb.cozy', months: 1 }
  ch.build.sins.push({ uid: 's', name: 'Jo', kind: 'fake', rating: 1, licences: [] })
  expect(() => check(ch)).not.toThrow()
  expect(codes(ch)).toContain('nuyen.overspent') // the karma build has no nuyen but what karma buys
})

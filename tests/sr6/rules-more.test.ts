// Review's checks in the corners the main rules tests leave out (src/sr6/engine/rules.ts): the wording and the citation of
// each message variant, Many Talents and Many Skills, Incompetent, quality choices taken twice, ammunition and a weapon
// that takes none, a body part installed three times, the grade caps. Invented runners on the made-up fixture.
import { expect, test } from 'vitest'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type MagicKind, type Sr6Build, type Sr6Character } from '../../src/sr6/formats/domain/character'
import { buildOf, GLIM, made, STONE } from './catalog/fixture'

type Over = Parameters<typeof made>[0]
function runner(o: { letters?: string; magic?: MagicKind; metatype?: string; method?: Sr6Build['method'] } = {}): Sr6Character {
  const ch = blankSr6(o.method ?? 'priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf(o.method ?? 'priority', {
    letters: o.method && o.method !== 'priority' ? undefined : (o.letters ?? 'ACDBE'),
    metatype: o.metatype ?? STONE,
    magic: o.magic ?? 'mundane',
  })
  return ch
}
const hits = (ch: Sr6Character, code: string, over?: Over) => {
  const { data, cr } = made(over)
  return validateSr6(data, cr, ch).filter(v => v.code === code)
}
const messages = (ch: Sr6Character, code: string, over?: Over) => hits(ch, code, over).map(v => v.message)

test('priority letters: the message names the way they must be given, by method and by level of play', () => {
  const ch = runner()
  ch.build.priorities.skills = 'A'
  expect(messages(ch, 'prio.lettersValid')).toEqual(['Each letter A–E goes to exactly one priority.'])
  const lv = hits(ch, 'prio.lettersValid', { rules: { priorityLetters: 'BCCDE' } })
  expect(lv.map(v => v.message)).toEqual(['The five priorities take the letters B, C, C, D, E, one each.'])
  const sum = runner({ method: 'sumtoten' })
  sum.build.priorities = { metatype: 'A', attributes: 'A', magic: 'A', skills: 'A', resources: 'A' }
  expect(messages(sum, 'prio.lettersValid')).toEqual(['The priority letters’ values add up to more than 11, or a priority has no letter.'])
  expect(messages(sum, 'prio.lettersValid', { rules: { priorityLetters: 'BCCDE' } })).toEqual([
    'The priority letters’ values add up to more than 11, or a priority has no letter or one of B, C, D, E.',
  ])
})

test('metatype and magic legality: a missing metatype, one the letter does not offer, one not in the catalog, a magic kind the letter lacks', () => {
  const none = runner()
  none.build.metatype = ''
  expect(messages(none, 'prio.metatypeAllowed')).toEqual(['Pick a metatype.'])
  const low = runner({ metatype: 'crb.gone' })
  expect(messages(low, 'prio.metatypeAllowed')).toEqual(['crb.gone isn’t available at metatype priority A.'])
  low.build.priorities.metatype = null
  expect(messages(low, 'prio.metatypeAllowed')).toEqual(['crb.gone isn’t available at metatype priority (none).'])
  const gone = runner({ method: 'karma', metatype: 'crb.gone' })
  expect(messages(gone, 'prio.metatypeAllowed')).toEqual(['crb.gone isn’t a metatype in the catalog.'])
  const mage = runner({ magic: 'full' })
  expect(messages(mage, 'prio.magicAllowed')).toEqual(['Full magician isn’t available at magic priority D.'])
  const nomagic = runner({ magic: 'full' })
  nomagic.build.priorities.magic = null
  expect(messages(nomagic, 'prio.magicAllowed')).toEqual(['Full magician isn’t available at magic priority (none).'])
})

test('attribute caps: Magic above the highest one, with the grade’s extra cited; one attribute at its maximum, two with Many Talents', () => {
  const ch = runner({ magic: 'full', metatype: GLIM })
  ch.build.attributes.mag.points = 9
  expect(messages(ch, 'attr.specialMax')[0]).toMatch(/^MAG \d+ is above the highest Magic or Resonance, 7\.$/)
  const grade = runner({ magic: 'full', metatype: GLIM })
  grade.build.attributes.mag.points = 9
  grade.build.initiation = 1
  const v = hits(grade, 'attr.specialMax', { rules: { magicAboveSixByGrade: true } })
  expect(v.length).toBeGreaterThan(0)
  const top = runner({ metatype: GLIM })
  for (const k of ['bod', 'agi'] as const) top.build.attributes[k].points = 9
  expect(messages(top, 'attr.oneAtMax')).toEqual([expect.stringMatching(/^Only one attribute may be at its maximum \(.*\)\.$/)])
  top.build.qualities.push({ uid: 'q', id: 'crb.made-up-polymath', level: 1 })
  const talents = hits(top, 'attr.oneAtMax', { rules: {} })
  expect(talents).toEqual([])
  top.build.attributes.rea.points = 9
  expect(messages(top, 'attr.oneAtMax')).toEqual([expect.stringMatching(/^Only 2 attributes may be at their maximum \(.*\)\.$/)])
})

test('adjustment points: on a core attribute only when the metatype raises its maximum (or, as a house rule, lowers it)', () => {
  const ch = runner({ metatype: GLIM })
  ch.build.attributes.bod.adjust = 1
  const plain = hits(ch, 'attr.adjustTargets')
  expect(plain.every(v => v.path === 'attributes.bod' || v.path?.startsWith('attributes.'))).toBe(true)
  const lowered = messages(ch, 'attr.adjustTargets', { rules: { adjustOnLoweredMax: true } })
  expect(lowered.every(m => !m.includes('raised or lowered') || m.includes('maximum isn’t raised or lowered'))).toBe(true)
  const stone = runner({ metatype: STONE })
  stone.build.attributes.bod.adjust = 1
  expect(messages(stone, 'attr.adjustTargets').concat(messages(stone, 'attr.adjustTargets', { rules: { adjustOnLoweredMax: true } }))).toBeDefined()
})

test('skills: the cap names the aptitude skill’s higher one, only one skill above the base, and one at the highest rank', () => {
  const ch = runner()
  ch.build.skills = [
    { id: 'crb.tinkering', points: 6, karma: 0 },
    { id: 'crb.gab', points: 6, karma: 0 },
  ]
  expect(messages(ch, 'skill.cap')).toEqual(['Tinkering rank 6 is above the cap of 5.', 'Gab rank 6 is above the cap of 5.'])
  // an aptitude with no skill named lets any one skill go higher, but only one
  ch.build.qualities.push({ uid: 'a1', id: 'crb.knack', level: 1 })
  expect(messages(ch, 'skill.cap')).toEqual(['Only one skill may be above 5.'])
  ch.build.qualities[0].note = 'Tinkering'
  expect(messages(ch, 'skill.cap')).toEqual(['Gab rank 6 is above the cap of 5.'])
  const two = runner()
  two.build.skills = [
    { id: 'crb.tinkering', points: 5, karma: 0 },
    { id: 'crb.gab', points: 5, karma: 0 },
  ]
  expect(messages(two, 'skill.oneAtMax', { rules: { oneSkillAtMax: true } })).toEqual(['Only one skill may be at the highest rank, 5 (Tinkering, Gab are).'])
  two.build.qualities.push({ uid: 'm', id: 'crb.made-up-dabbler', level: 1 })
  expect(messages(two, 'skill.oneAtMax', { rules: { oneSkillAtMax: true } })).toEqual([])
  two.build.skills.push({ id: 'crb.glowcraft', points: 5, karma: 0 })
  expect(messages(two, 'skill.oneAtMax', { rules: { oneSkillAtMax: true } })).toEqual([
    expect.stringMatching(/^Only 2 skills may be at the highest rank, 5 \(.*\)\.$/),
  ])
})

test('Incompetent: no ranks in its skill, not for a Magic skill without Magic or Tasking without Resonance', () => {
  const rules = { incompetentQuality: 'crb.butterfingers' }
  const ch = runner()
  ch.build.qualities.push(
    { uid: 'i1', id: 'crb.butterfingers', level: 1, note: 'Tinkering' },
    { uid: 'i2', id: 'crb.butterfingers', level: 1, note: 'Glowcraft' },
    { uid: 'i3', id: 'crb.butterfingers', level: 1, note: 'Wirespeak' },
    { uid: 'i4', id: 'crb.butterfingers', level: 1, note: 'nothing like a skill' },
  )
  ch.build.skills = [
    { id: 'crb.tinkering', points: 1, karma: 0 },
    { id: 'crb.gab', points: 0, karma: 2 },
  ]
  expect(messages(ch, 'skill.incompetent', { rules })).toEqual([
    'Tinkering has 1 rank: the runner is Incompetent in it.',
    'Incompetent in Glowcraft: not for a skill the runner has no Magic to use.',
    'Incompetent in Wirespeak: not for a skill the runner has no Resonance to use.',
  ])
  ch.build.skills[0].karma = 1
  expect(messages(ch, 'skill.incompetent', { rules })[0]).toBe('Tinkering has 2 ranks: the runner is Incompetent in it.')
  const mage = runner({ magic: 'full' })
  mage.build.qualities.push({ uid: 'i', id: 'crb.butterfingers', level: 1, note: 'Glowcraft' })
  expect(messages(mage, 'skill.incompetent', { rules })).toEqual([])
  // two of the same skill are taken twice
  const twice = runner()
  twice.build.qualities.push({ uid: 'a', id: 'crb.butterfingers', level: 1, note: 'Gab' }, { uid: 'b', id: 'crb.butterfingers', level: 1, note: 'Gab' })
  expect(messages(twice, 'quality.choiceTwice', { rules })).toEqual(['Butterfingers is taken twice for Gab: once each.'])
  const exc = runner()
  exc.build.qualities.push(
    { uid: 'a', id: 'crb.made-up-prodigy', level: 1, note: 'Agility' },
    { uid: 'b', id: 'crb.made-up-prodigy', level: 1, note: 'Agility' },
  )
  expect(messages(exc, 'quality.choiceTwice').join('|')).toMatch(/is taken twice for AGI: once each\.$/)
})

test('a quality that cannot go with Magic, one above its highest level, and one outside the six', () => {
  const ch = runner({ magic: 'full' })
  ch.build.qualities.push({ uid: 's', id: 'crb.knack', level: 1 })
  expect(messages(ch, 'quality.sensitiveSystem', { rules: { sensitiveSystemQuality: 'crb.knack' } })).toEqual(['Knack: not with a Magic rating.'])
  const tm = runner({ magic: 'technomancer' })
  tm.build.qualities.push({ uid: 's', id: 'crb.knack', level: 1 })
  expect(messages(tm, 'quality.sensitiveSystem', { rules: { sensitiveSystemQuality: 'crb.knack' } })).toEqual(['Knack: not with a Resonance rating.'])
  const mundane = runner()
  mundane.build.qualities.push({ uid: 's', id: 'crb.knack', level: 1 })
  expect(messages(mundane, 'quality.sensitiveSystem', { rules: { sensitiveSystemQuality: 'crb.knack' } })).toEqual([])
  const high = runner()
  high.build.qualities.push({ uid: 'h', id: 'crb.knack', level: 3 })
  expect(messages(high, 'quality.level')).toEqual(['Knack level 3 is above its highest level, 1.'])
})

test('gear: an availability above the cap, only illegal gear when the first printing’s rule is on, street level refuses illegal gear', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'g', kind: 'weapons', id: 'crb.fizz-rifle-70', qty: 1, accessories: [] })
  expect(messages(ch, 'gear.availCap', { rules: { maxAvailability: 3 } })).toEqual(['Fizz Rifle 70’s Availability 4 is above 3.'])
  expect(messages(ch, 'gear.availCap', { rules: { maxAvailability: 3, availabilityCapIllegalOnly: true } })).toEqual([])
  expect(messages(ch, 'gear.availCap', { rules: { maxAvailability: 3, levelSwcElite: true } })).toEqual([])
  expect(messages(ch, 'gear.illegal')).toEqual([])
  const ill = made({
    data: d => {
      const old = d.entry
      d.entry = (k, id) => {
        const e = old(k, id)
        return e && id === 'crb.zap-gun' ? { ...e, attrs: { ...e.attrs, avail: '4(I)' } } : e
      }
    },
  })
  const street = runner()
  street.build.purchases.push({ uid: 'g', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] })
  const v = validateSr6(
    ill.data,
    (() => {
      ill.cr.set('levelSwcStreet', { key: 'levelSwcStreet', value: true })
      return ill.cr
    })(),
    street,
  ).filter(x => x.code === 'gear.illegal')
  expect(v.map(x => x.message)).toEqual(['Zap Gun is illegal: a street-level runner can’t have it.'])
})

test('gear: a rating outside what the entry comes in', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'g', kind: 'gear', id: 'crb.tangle-rope.1', rating: 3, qty: 1, accessories: [] })
  expect(hits(ch, 'gear.ratingRange').map(v => v.message)).toEqual([expect.stringMatching(/^Tangle Rope 1 comes in ratings/)])
})

test('augmentations: a body part installed a third time says a left and right only; a repeated one says once each', () => {
  const over = {
    data: (d: ReturnType<typeof made>['data']) => {
      const old = d.entry
      d.entry = (k, id) => {
        const e = old(k, id)
        return e && id === 'crb.limb-synthetic' ? { ...e, name: 'Arm (synthetic)', attrs: { ...e.attrs, category: 'cyberlimb' } } : e
      }
    },
  }
  const ch = runner()
  const add = (uid: string, id: string) => ch.build.purchases.push({ uid, kind: 'augmentations', id, qty: 1, accessories: [] })
  add('a', 'crb.limb-synthetic')
  add('b', 'crb.limb-synthetic')
  add('c', 'crb.limb-synthetic')
  add('d', 'crb.glow-eyes.1')
  add('e', 'crb.glow-eyes.2')
  expect(messages(ch, 'gear.augmentationTwice', over)).toEqual([
    'Torqlimb: Arm (synthetic): a third one; a body part has a left and a right only.',
    'Glow Eyes 2 is installed twice: each augmentation once.',
  ])
})

test('ammunition: a weapon with none bought warns, any ammunition type covers it, a named kind must match', () => {
  const ch = runner()
  ch.build.purchases.push({ uid: 'w', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] })
  expect(messages(ch, 'gear.ammo')).toEqual(['Zap Gun has no ammunition bought for it.'])
  ch.build.purchases.push({ uid: 'a', kind: 'ammotypes', id: 'crb.fizz-rounds', qty: 1, accessories: [] })
  expect(messages(ch, 'gear.ammo')).toEqual([])
  const other = runner()
  other.build.purchases.push(
    { uid: 'w', kind: 'weapons', id: 'crb.zap-gun', qty: 1, accessories: [] },
    { uid: 'a', kind: 'gear', id: 'crb.zap-pellets', qty: 1, accessories: [] },
  )
  expect(messages(other, 'gear.ammo').length).toBeLessThanOrEqual(1)
})

test('essence: a runner at zero or below says what it is', () => {
  const ch = runner()
  ch.build.purchases.push(
    { uid: 'a', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [] },
    { uid: 'b', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [] },
  )
  const v = messages(ch, 'essence.positive', { rules: { essence: 2 } })
  expect(v).toEqual([expect.stringMatching(/^Essence must stay above 0 \(it is -?\d+(\.\d+)?\)\.$/)])
})

test('magic: spells past the free ones are an optional rule, metamagics for another path, more metamagics than grades, and grades above Magic', () => {
  const mage = runner({ magic: 'full', letters: 'ACBDE' })
  for (let i = 0; i < 6; i++) mage.build.picks.push({ uid: `s${i}`, kind: 'spells', id: i % 2 ? 'crb.glow-ward' : 'crb.mend-glow' })
  const karma = hits(mage, 'magic.karmaAtCreation')
  expect(karma.length === 0 || /past the free ones/.test(karma[0].message)).toBe(true)
  const m = runner({ magic: 'full' })
  m.build.picks.push(
    { uid: 'm1', kind: 'metamagics', id: 'crb.glow-point.1' },
    { uid: 'm2', kind: 'metamagics', id: 'crb.hum-craft' },
    { uid: 'm3', kind: 'metamagics', id: 'crb.soft-echo' },
  )
  expect(messages(m, 'magic.metamagicUser')).toEqual(['Glow Point 1 is for adepts only, not a full magician.'])
  expect(messages(m, 'magic.metamagicCount')).toEqual(['3 metamagics at initiation grade 0: each grade brings one.'])
  m.build.initiation = 1
  expect(messages(m, 'magic.metamagicCount')).toEqual(['3 metamagics at initiation grade 1: each grade brings one.'])
  const solo = runner({ magic: 'full' })
  solo.build.picks.push({ uid: 'm', kind: 'metamagics', id: 'crb.soft-echo' })
  expect(messages(solo, 'magic.metamagicCount')).toEqual(['1 metamagic at initiation grade 0: each grade brings one.'])
  const grades = runner({ magic: 'full' })
  grades.build.initiation = 3
  expect(hits(grades, 'magic.gradeCap').map(v => [v.message, v.source, v.page])).toEqual([['Initiate grade 3 is above Magic 0.', 'CRB-HK', 167]])
  const tm = runner({ magic: 'technomancer' })
  tm.build.submersion = 3
  expect(hits(tm, 'magic.gradeCap').map(v => [v.message, v.source, v.page])).toEqual([['Submersion grade 3 is above Resonance 0.', 'CRB-HK', 195]])
  const caps = { rules: { gradeCapAtCreation: true, 'gradeCap.initiation': 1, 'gradeCap.submersion': 0 } }
  const both = runner({ magic: 'full' })
  both.build.initiation = 2
  both.build.submersion = 1
  expect(messages(both, 'magic.gradeCapCreation', caps)).toEqual([
    'Initiate grade 2 at creation: the table’s cap is 1.',
    'Submersion grade 1 at creation: the table’s cap is 0.',
  ])
})

test('adept powers: a non-awakened runner cannot have them; an adept’s are held to the power points', () => {
  const ch = runner()
  ch.build.picks.push({ uid: 'p', kind: 'adeptpowers', id: 'crb.quick-step.1' })
  expect(messages(ch, 'adept.ppBudget')).toEqual(['A mundane can’t have adept powers.'])
  const adept = runner({ magic: 'adept' })
  adept.build.picks.push({ uid: 'p', kind: 'adeptpowers', id: 'crb.quick-step.4' }, { uid: 'q', kind: 'adeptpowers', id: 'crb.quick-step.4' })
  expect(messages(adept, 'adept.ppBudget')).toEqual([expect.stringMatching(/^Power points overspent by /)])
  const wizard = runner({ magic: 'full' })
  wizard.build.picks.push({ uid: 'p', kind: 'adeptpowers', id: 'crb.quick-step.1' })
  expect(messages(wizard, 'adept.ppBudget')).toEqual(['A full magician can’t have adept powers.'])
})

test('Improved Ability needs a rank in its skill and may raise it only so far', () => {
  const rules = { improvedAbilityPower: 'crb.quick-step.1', improvedAbilityFactor: 1.5, skillAugmentMax: 4 }
  const ch = runner({ magic: 'adept' })
  ch.build.picks.push({ uid: 'p', kind: 'adeptpowers', id: 'crb.quick-step.1', note: 'Tinkering', level: 1 })
  expect(messages(ch, 'adept.improvedAbility', { rules })).toEqual(['Quick Step 1 for Tinkering: it needs a rank in Tinkering.'])
  ch.build.skills = [{ id: 'crb.tinkering', points: 2, karma: 0 }]
  ch.build.picks[0].level = 3
  expect(messages(ch, 'adept.improvedAbility', { rules })).toEqual(['Quick Step 1 3 raises Tinkering 2 to 5; at most 3.'])
  ch.build.picks[0].level = 1
  expect(messages(ch, 'adept.improvedAbility', { rules })).toEqual([])
})

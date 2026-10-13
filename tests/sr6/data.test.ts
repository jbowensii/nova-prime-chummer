// Typed views over the SR6 catalog (src/sr6/engine/data.ts) on the made-up fixture.
import { expect, test } from 'vitest'
import { MAGIC_KINDS, sr6Data } from '../../src/sr6/engine/data'
import { normName } from '../../src/sr6/engine/names'
import { missingFor } from '../../src/sr6/engine/creation'
import { setMetatype } from '../../src/sr6/engine/actions'
import { blankSr6 } from '../../src/sr6/model/character'
import { fixtureCatalog, fixtureCreation, made } from './fixture'

test('priorities A–E with metatype ids, attribute/skill points, nuyen and magic ratings per kind', () => {
  const d = sr6Data(fixtureCatalog())
  expect(Object.keys(d.priorities).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
  expect(d.priorities.A).toEqual({
    metatypes: { 'crb.glimmerkin': 13, 'crb.stonefolk': 11 },
    attributes: 22,
    skills: 30,
    magic: { full: 4, 'mystic-adept': 5, adept: 7, technomancer: 4 },
    nuyen: 420000,
    page: 40,
  })
  expect(d.priorities.B!.magic).toEqual({ full: 3, 'mystic-adept': 3, adept: 5, aspected: 5, technomancer: 3 })
  expect(d.priorities.E).toMatchObject({ metatypes: { 'crb.glimmerkin': 1, 'crb.stonefolk': 1 }, magic: { mundane: 0 }, nuyen: 8200 })
})

test('metatypes: ranges per attribute, traits resolved to quality ids; an unresolved one is a warning with the page', () => {
  const d = sr6Data(fixtureCatalog())
  const stone = d.metatypes['crb.stonefolk']
  expect(stone).toMatchObject({ id: 'crb.stonefolk', name: 'Stonefolk', page: 43, traits: ['crb.stoneskin'] })
  expect(stone.ranges.bod).toEqual([3, 9])
  expect(stone.ranges.edg).toEqual([1, 3])
  const unresolved = d.problems.filter(p => p.code === 'data.unresolved')
  expect(unresolved).toContainEqual({
    code: 'data.unresolved',
    severity: 'warning',
    path: 'metatypes.crb.stonefolk',
    message: 'Stonefolk’s trait “Unresolved Trait” isn’t a quality in the catalog.',
    source: 'CRB',
    page: 43,
  })
  expect(unresolved.map(p => p.message)).toHaveLength(3) // Glimmerkin's Moonsight and Quick Fingers aren't fixture qualities either
  expect(d.problems.filter(p => p.code !== 'data.unresolved')).toEqual([])
})

test('a trait printed with a level resolves to the leveled quality at that level; picking the metatype gives it', () => {
  const d = sr6Data(fixtureCatalog((f, x) => (f.endsWith('metatypes.xml') ? x.replace('<trait>Unresolved Trait</trait>', '<trait>Lucky Streak 2</trait>') : x)))
  // (the leveled quality is one entry per level, levels.ts: `Lucky Streak 2` is the level's own entry)
  expect(d.metatypes['crb.stonefolk']).toMatchObject({ traits: ['crb.stoneskin', 'crb.lucky-streak.2'] })
  expect(d.metatypes['crb.stonefolk'].traitLevels).toBeUndefined()
  const ch = blankSr6('priority', 'r', '2026-10-04T00:00:00Z')
  setMetatype(ch, 'crb.stonefolk', d)
  expect(ch.build.qualities.map(q => [q.id, q.level, q.free])).toEqual([
    ['crb.stoneskin', 1, true],
    ['crb.lucky-streak.2', 1, true],
  ])
})

test('skills, qualities, powers and life modules', () => {
  const d = sr6Data(fixtureCatalog())
  expect(d.skills['crb.gab']).toEqual({ id: 'crb.gab', name: 'Gab', attr: 'cha', untrained: true, specs: ['Haggling', 'Fibbing'], page: 99 })
  expect(d.skills['crb.hexing']).toMatchObject({ attr: 'mag', untrained: false })
  // (a leveled quality's parent stays in the view, marked, for a line still naming it; its levels are plain qualities)
  expect(d.qualities['crb.lucky-streak']).toEqual({
    id: 'crb.lucky-streak',
    name: 'Lucky Streak',
    positive: true,
    karma: 4,
    karmaMax: null,
    perLevel: true,
    maxLevel: 3,
    page: 70,
    parent: true,
  })
  expect(d.qualities['crb.lucky-streak.2']).toEqual({
    id: 'crb.lucky-streak.2',
    name: 'Lucky Streak 2',
    positive: true,
    karma: 8,
    karmaMax: null,
    perLevel: false,
    maxLevel: 1,
    page: 70,
  })
  expect(d.qualities['crb.butterfingers']).toMatchObject({ positive: false, karma: 8, perLevel: false, maxLevel: 1 })
  expect(d.qualities['crb.made-up-gift']).toMatchObject({ karma: 0, granted: true, category: 'Wanderer gift' })
  expect(d.qualities['crb.wanderer']).toMatchObject({ karma: 9, choices: [{ category: 'Wanderer gift', count: 1, max: 2 }] })
  expect(d.qualities['crb.knack'].granted).toBeUndefined()
  expect(d.qualities['crb.wander-path-step-1']).toMatchObject({ name: 'Wander Path: Step 1', karma: 10 })
  expect(d.powers['crb.quick-step']).toEqual({ id: 'crb.quick-step', name: 'Quick Step', cost: 0.25, perLevel: true, maxLevel: 4, page: 157, parent: true })
  expect(d.powers['crb.quick-step.3']).toEqual({ id: 'crb.quick-step.3', name: 'Quick Step 3', cost: 0.75, perLevel: false, maxLevel: 1, page: 157 })
  expect(d.lifemodules['crb.hatchling-days']).toEqual({
    id: 'crb.hatchling-days',
    name: 'Hatchling Days',
    stage: 'opening',
    grants: { attributePoints: 3, skillPoints: 1, nuyen: 1000 },
    choices: [],
    page: 31,
  })
  expect(d.lifemodules['crb.glow-apprentice']).toMatchObject({
    stage: 'adult',
    requires: 'awakened',
    grants: { skillPoints: 3 },
    choices: [{ kind: 'mixed', points: 1, options: ['edg', 'skill:crb.hexing', 'nuyen:3000'] }],
  })
  expect(d.entry('weapons', 'crb.zap-gun')?.name).toBe('Zap Gun')
  expect(d.entry('weapons', 'nope')).toBeUndefined()
})

test('an unreadable book number is a data.bookValue warning with the entry and page; the value is null, never NaN', () => {
  const d = sr6Data(
    fixtureCatalog((file, xml) =>
      file.endsWith('crb/qualities.xml')
        ? xml.replace('karma="8"', 'karma="x"')
        : file.endsWith('crb/adeptpowers.xml')
          ? xml.replace('cost="0.25"', 'cost="0.25 + ?"')
          : xml,
    ),
  )
  expect(d.qualities['crb.butterfingers'].karma).toBeNull()
  expect(d.powers['crb.quick-step'].cost).toBeNull()
  expect(d.problems.filter(p => p.code === 'data.bookValue')).toEqual([
    {
      code: 'data.bookValue',
      severity: 'warning',
      path: 'qualities.crb.butterfingers',
      message: 'Butterfingers: the karma “x” isn’t a number the app can read.',
      source: 'CRB',
      page: 74,
    },
    {
      code: 'data.bookValue',
      severity: 'warning',
      path: 'adeptpowers.crb.quick-step',
      message: 'Quick Step: the cost “0.25 + ?” isn’t a number the app can read.',
      source: 'CRB',
      page: 157,
    },
  ])
})

test('a priority row naming an unknown metatype warns; names match loosely (case, accents, punctuation, a leading "the")', () => {
  const d = sr6Data(
    fixtureCatalog((file, xml) =>
      file.endsWith('crb/priorities.xml')
        ? xml.replace('<metatype name="Glimmerkin" points="13"/>', '<metatype name="The GLIMMÉRKIN!" points="13"/><metatype name="Pebblekin" points="2"/>')
        : xml,
    ),
  )
  expect(d.priorities.A!.metatypes).toEqual({ 'crb.glimmerkin': 13, 'crb.stonefolk': 11 })
  expect(d.problems).toContainEqual(
    expect.objectContaining({
      code: 'data.unresolved',
      path: 'priorities.crb.priority-a',
      message: 'Priority A’s metatype “Pebblekin” isn’t a metatype in the catalog.',
      page: 40,
    }),
  )
  expect(normName('Rock & Roll’s “Best”')).toBe('rock and rolls best')
})

test('MAGIC_KINDS flags; the data satisfies what missingFor reads; made() applies changes to a fresh copy', () => {
  expect(MAGIC_KINDS['mystic-adept']).toEqual({ spells: true, powers: true, paysPowers: true, resonance: false })
  expect(MAGIC_KINDS.mundane).toEqual({ spells: false, powers: false, paysPowers: false, resonance: false })
  expect(missingFor('lifepath', fixtureCreation(), sr6Data(fixtureCatalog()))).toEqual([])
  const a = made({
    rules: { startingKarma: 51 },
    unset: ['skillCap'],
    data: d => {
      delete d.priorities.E
    },
  })
  expect(a.cr.get('startingKarma')?.value).toBe(51)
  expect(a.cr.has('skillCap')).toBe(false)
  expect(missingFor('priority', a.cr, a.data)).toEqual(['skillCap', 'priorities A–E'])
  expect(made().data.priorities.E).toBeDefined()
})

test('Knowledge and Language (a skill with a knowledgeskill choice) are free-text entry points, not skills to buy', () => {
  const entry = (id: string, name: string, extra: string) =>
    `<skill id="zz.${id}" source="ZZ" page="1" attr="log" untrained="false"><name>${name}</name>${extra}</skill>`
  const zz = {
    file: 'custom/sr6/imported/zz/skills.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="skills" version="1">' +
      entry('knowledge', 'Knowledge', '<choice kind="knowledgeskill" count="1"/>') +
      entry('language', 'Language', '<choice kind="knowledgeskill" count="1"/>') +
      entry('lore', 'Lore', '') +
      '</sr6:data>',
  }
  const d = sr6Data(fixtureCatalog(undefined, [zz]))
  expect(Object.keys(d.skills).filter(k => k.startsWith('zz.'))).toEqual(['zz.lore'])
})

test('a class attribute (Commlink6’s TYPE/SUBTYPE) on an entry is carried and does no harm', () => {
  const zz = {
    file: 'custom/sr6/imported/zz/gear.xml',
    xml:
      '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="gear" version="1">' +
      '<gear id="zz.rope" source="ZZ" page="1" category="Tool" class="TOOLS/TOOLS"><name>Rope</name></gear></sr6:data>',
  }
  const d = sr6Data(fixtureCatalog(undefined, [zz]))
  expect(d.entry('gear', 'zz.rope')?.attrs.class).toBe('TOOLS/TOOLS')
  expect(d.problems.filter(p => p.message.includes('Rope'))).toEqual([])
})

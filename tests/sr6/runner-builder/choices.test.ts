// choiceOptions: what a choice power or quality may be for, as values noteAttr / noteSkill read back. Made-up entries on the fixture catalog.
import { expect, test } from 'vitest'
import { choiceOptions, choiceSelectOptions, noteAttr, noteSkill } from '../../../src/sr6/runner-builder/domain/creation/choices'
import type { Sr6Entry, Sr6Part } from '../../../src/sr6/formats/domain/types'
import { made } from '../catalog/fixture'
import type { Sr6Data } from '../../../src/sr6/catalog/domain/data'

const entry = (name: string, parts: Sr6Part[] = []) => ({ id: 'x.' + name, kind: 'adeptpowers', name, attrs: {}, parts }) as unknown as Sr6Entry
const part = (tag: string, attrs: Record<string, string>): Sr6Part => ({ tag, text: '', attrs })

test('an attribute choice with the book’s options offers exactly those', () => {
  const { data } = made()
  const e = entry('Attribute Boost (Attribute)', [part('selection', { type: 'ATTRIBUTE', ref: 'CHOICE', options: 'BODY,AGILITY,REACTION,STRENGTH' })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('attribute')
  expect(c.options.map(o => o.value)).toEqual(['Body', 'Agility', 'Reaction', 'Strength'])
  expect(c.options.map(o => noteAttr(o.value))).toEqual(['bod', 'agi', 'rea', 'str'])
})

test('an attribute choice with no options offers the eight core attributes', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Thing', [part('effect', { target: 'attr:choice' })]))!
  expect(c.options.map(o => o.value)).toEqual(['Body', 'Agility', 'Reaction', 'Strength', 'Willpower', 'Logic', 'Intuition', 'Charisma'])
  expect(choiceOptions(data, entry('Exceptional (Attribute)'))?.kind).toBe('attribute')
})

test('a skill choice offers the skills, each read back by noteSkill; a plain entry offers none', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Ability', [part('modifier', { type: 'SKILL', ref: 'CHOICE' })]))!
  expect(c.kind).toBe('skill')
  expect(c.options.length).toBe(Object.keys(data.skills).length)
  for (const o of c.options) expect(data.skills[noteSkill(data, o.value) ?? '']?.name).toBe(o.value)
  expect(choiceOptions(data, entry('Plain Power'))).toBeUndefined()
  expect(choiceOptions(data, undefined)).toBeUndefined()
})

test('a skill choice with the book’s options keeps multi-word skill names (no splitting on spaces)', () => {
  const { data } = made()
  const multi = Object.values(data.skills).find(s => s.name.includes(' '))
  const single = Object.values(data.skills).find(s => !s.name.includes(' '))!
  const names = [multi?.name, single.name].filter(Boolean) as string[]
  const e = entry('Aptitude (Skill)', [part('selection', { type: 'SKILL', ref: 'CHOICE', options: names.join(',') })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('skill')
  expect(c.options.map(o => o.value)).toEqual(names)
})

test('choiceSelectOptions keeps a still-valid note that is not one of the listed values', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Improved Thing', [part('effect', { target: 'attr:choice' })]))!
  expect(choiceSelectOptions(c, 'AGI')[0]).toEqual({ value: 'AGI', label: 'AGI' }) // an older free-text note stays shown
  expect(choiceSelectOptions(c, 'Body')).toHaveLength(c.options.length) // already listed: not duplicated
  expect(choiceSelectOptions(c, '')).toHaveLength(c.options.length)
})

// Stage B: the <selection> part is the universal choice marker, across attribute / skill / quality / matrix domains.
test('an attribute selection behind a non-ATTRIBUTE modifier (a Way’s drain attr) still offers those attributes', () => {
  const { data } = made()
  const e = entry('Burnout’s Way', [
    part('modifier', { kind: 'itemmod', type: 'DRAIN_ADEPT', ref: 'CHOICE:x' }),
    part('selection', { type: 'ATTRIBUTE', options: 'AGILITY,REACTION,STRENGTH' }),
  ])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('attribute')
  expect(c.options.map(o => o.value)).toEqual(['Agility', 'Reaction', 'Strength'])
  expect(c.options.map(o => noteAttr(o.value))).toEqual(['agi', 'rea', 'str'])
})

test('a skill selection whose options are skill ids resolves to the catalog skill names', () => {
  const { data } = made()
  const [id, name] = Object.entries(data.skills)[0] // [skillId, {name,...}]
  const e = entry('Artisan’s Way', [part('selection', { type: 'SKILL', options: id })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('skill')
  expect(c.options.map(o => o.value)).toEqual([(name as { name: string }).name])
})

test('a quality selection (Finding Your Way) offers the named Way qualities, underscore ids mapped to the catalog', () => {
  const { data } = made()
  const ids = Object.keys(data.qualities).slice(0, 2)
  if (ids.length < 2) return // fixture has <2 qualities: nothing to assert
  const e = entry('Finding Your Way', [part('selection', { type: 'QUALITY', options: ids.map(i => i.replace(/-/g, '_')).join(',') })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('quality')
  expect(c.options.map(o => o.value)).toEqual(ids.map(i => data.qualities[i].name))
})

test('a matrix selection offers the Matrix attributes with readable labels', () => {
  const { data } = made()
  const e = entry('Matrix Attribute Advancement', [part('selection', { type: 'ITEM_ATTRIBUTE', options: 'ATTACK,SLEAZE,DATA_PROCESSING,FIREWALL' })])
  const c = choiceOptions(data, e)!
  expect(c.kind).toBe('matrix')
  expect(c.options.map(o => o.value)).toEqual(['Attack', 'Sleaze', 'Data Processing', 'Firewall'])
})

test('a free-text selection (TEXT) is a text box — no dropdown', () => {
  const { data } = made()
  expect(choiceOptions(data, entry('Bane', [part('selection', { type: 'TEXT' })]))?.kind).toBe('text')
})

test('a critter power’s SPELL selection offers the catalog spells A to Z, or just its listed ones', () => {
  const { data } = made()
  const c = choiceOptions(data, entry('Innate Spell', [part('selection', { type: 'SPELL' })]))!
  expect(c.kind).toBe('spell')
  expect(c.options.map(o => o.value)).toEqual(data.spellNames)
  expect(data.spellNames.length).toBeGreaterThan(0)
  expect(data.spellNames).toEqual([...data.spellNames].sort((a, b) => a.localeCompare(b)))
})

test('a skill-specialization choice offers that skill’s specializations (Grease Monkey: Engineering’s)', () => {
  const { data } = made()
  const s = Object.values(data.skills).find(k => k.specs.length)!
  const c = choiceOptions(data, entry('Grease Monkey', [part('selection', { type: 'SKILLSPECIALIZATION', ref: s.id })]))!
  expect(c.kind).toBe('specialization')
  expect(c.options.map(o => o.value)).toEqual(s.specs)
})

// Sweep: every <selection> type Commlink6 1.14.0 uses (scan 2026-10) answers with a picker list or a free-text box, never nothing.
const CL6_SELECTION_TYPES = [
  'ITEM_ATTRIBUTE',
  'ATTRIBUTE',
  'SKILL',
  'TEXT',
  'SUBSELECT',
  'AMMUNITION_TYPE',
  'GEAR',
  'QUALITY',
  'SPELL_CATEGORY',
  'ELEMENT',
  'CARRIED',
  'SPIRIT',
  'SKILLSPECIALIZATION',
  'PROGRAM',
  'ACTION',
  'SPRITE',
  'CONTACT',
  'SIGNATURE_MANEUVERS',
  'SENSE',
  'SPELL',
  'MATRIX_ATTRIBUTE',
  'SPRITE_POWER',
  'PARAGON',
  'DAMAGE_ELEMENT',
  'ADEPT_POWER',
  'MENTOR_SPIRIT',
]
test('every choice type answers with a list or a text box', () => {
  const { data } = made()
  for (const type of [...CL6_SELECTION_TYPES, 'SOMETHING_NEW', '']) {
    const c = choiceOptions(data, entry('X', [part('selection', type ? { type } : {})]))
    expect(c, type).toBeDefined()
    if (c!.kind === 'text') expect(c!.options).toEqual([])
    else expect(c!.options.length, type).toBeGreaterThan(0)
  }
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'ELEMENT' })]))!.options.map(o => o.value)).toContain('Fire')
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'ACTION', options: 'dodge,take_cover' })]))!.options.map(o => o.value)).toEqual([
    'Dodge',
    'Take Cover',
  ])
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'TEXT' })]))!.kind).toBe('text')
})

test('catalog-listed choices: ammo types, contacts, a multi-pick count', () => {
  const { data } = made()
  const ammo = choiceOptions(data, entry('X', [part('selection', { type: 'AMMUNITION_TYPE', ref: 'AMMOTYPE' })]))!
  expect(ammo.kind === 'list' ? ammo.options.map(o => o.value) : []).toEqual(data.kindNames!('ammotypes'))
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'CONTACT' })]))!.kind).toBe('text') // none yet
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'CONTACT' })]), { contacts: ['Mr. Johnson'] })!.options.map(o => o.value)).toEqual([
    'Mr. Johnson',
  ])
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'SUBSELECT', ref: 'vector', count: '4' })]))!.count).toBe(4)
  const sp = choiceOptions(data, entry('X', [part('selection', { type: 'SPRITE_POWER' })]))!
  expect(sp.kind === 'list' ? sp.options.map(o => o.value) : []).toContain('Static Burst')
})

test('gear-bound choices: a ref filters the catalog, CARRIED binds to the runner’s own items', () => {
  const { data } = made()
  const item = (kind: string, name: string, cls: string) => ({ ...entry(name), kind, attrs: { class: cls } }) as unknown as Sr6Entry
  const knife = item('weapons', 'Knife', 'WEAPON_CLOSE_COMBAT/BLADES'),
    gun = item('weapons', 'Ares Predator', 'WEAPON_FIREARMS/PISTOLS_HEAVY'),
    cs = item('gear', 'CS Tear Gas', 'CHEMICALS/TOXINS'),
    rope = item('gear', 'Rope', 'SURVIVAL/TOOLS')
  data.kindEntries = (k => [knife, gun, cs, rope].filter(e => e.kind === k)) as Sr6Data['kindEntries']
  const opts = (sel: Record<string, string>, owned?: Sr6Entry[]) => choiceOptions(data, entry('X', [part('selection', sel)]), { owned })!
  expect(opts({ type: 'GEAR', ref: 'CHEMICALS' }).options.map(o => o.value)).toEqual(['CS Tear Gas']) // Gas Grenade → which chemical
  expect(opts({ type: 'GEAR', ref: 'WEAPON' }).options.map(o => o.value)).toEqual(['Ares Predator', 'Knife']) // autosoft → which weapon
  expect(opts({ type: 'CARRIED', ref: 'MELEE' }).kind).toBe('text') // Weapon Focus, nothing owned yet
  expect(opts({ type: 'CARRIED', ref: 'MELEE' }, [gun, knife, rope]).options.map(o => o.value)).toEqual(['Knife'])
  expect(opts({ type: 'CARRIED' }, [gun, rope]).options.map(o => o.value)).toEqual(['Ares Predator', 'Rope']) // Item Attunement
  expect(opts({ type: 'GEAR', ref: 'CARRIED' }, [rope]).options.map(o => o.value)).toEqual(['Rope'])
})

test('a specialization choice listing skill/spec pairs (Enthralling Performance) offers them by skill', () => {
  const { data } = made()
  const s = Object.values(data.skills).find(k => k.specs.length)!
  const c = choiceOptions(data, entry('Enthralling Performance', [part('selection', { type: 'SKILLSPECIALIZATION', options: `${s.id}/${s.specs[0]}` })]))!
  expect(c.options.map(o => o.value)).toEqual([`${s.name} (${s.specs[0]})`])
})

test('a non-Matrix item-attribute choice is an ordinary list', () => {
  const { data } = made()
  expect(choiceOptions(data, entry('Attribute Overclocking', [part('selection', { type: 'ITEM_ATTRIBUTE', options: 'ATTACK,DEVICE_RATING' })]))!.kind).toBe(
    'list',
  )
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'ITEM_ATTRIBUTE', options: 'ATTACK,SLEAZE' })]))!.kind).toBe('matrix')
})

test('a skill choice’s type ref lists only that type; costCombat adds the combat skills; distr asks for several picks', () => {
  const { data } = made()
  const sk = (id: string, name: string) => ({ id, name, attr: 'agi', untrained: true, specs: [], page: 1 })
  data.skills = Object.fromEntries(
    [sk('athletics', 'Athletics'), sk('stealth', 'Stealth'), sk('firearms', 'Firearms'), sk('con', 'Con'), sk('close_combat', 'Close Combat')].map(s => [
      s.id,
      s,
    ]),
  ) as typeof data.skills
  const phys = choiceOptions(data, entry('Skill Hardwires', [part('selection', { type: 'SKILL', ref: 'PHYSICAL' })]))!.options.map(o => o.value)
  expect(phys).toEqual(['Athletics', 'Stealth'])
  const ia = {
    ...entry('Improved Ability (Skill)', [part('selection', { type: 'SKILL', ref: 'CHOICE', options: 'athletics' })]),
    attrs: { costCombat: '1' },
  } as Sr6Entry
  expect(choiceOptions(data, ia)!.options.map(o => o.value)).toEqual(['Athletics', 'Close Combat', 'Firearms'])
  expect(choiceOptions(data, entry('X', [part('selection', { type: 'SKILL', options: 'athletics,stealth,con', distr: '1 1' })]))!.count).toBe(2)
})

// The SR6 data view's reading of catalog values (src/sr6/engine/data.ts): numbers the app cannot read become a warning
// beside the entry, a metatype's traits at a level, a quality's Karma steps and flags, life modules, and the name index.
// The made-up fixture's files are rewritten per case.
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/engine/data'
import { fixtureCatalog } from './fixture'

const data = (file: string, change: (xml: string) => string) => sr6Data(fixtureCatalog((f, x) => (f.endsWith(`crb/${file}`) ? change(x) : x)))
const warnings = (d: ReturnType<typeof sr6Data>, code = 'data.bookValue') => d.problems.filter(p => p.code === code).map(p => `${p.path}: ${p.message}`)

test('a whole number the app cannot read is 0 (or the default) and a warning citing the entry', () => {
  const d = data('priorities.xml', x => x.replace('<attributes points="22"/>', '<attributes points="lots"/>'))
  expect(d.priorities.A!.attributes).toBe(0)
  expect(warnings(d)).toEqual(['priorities.crb.priority-a: Priority A: the attribute points “lots” isn’t a number the app can read.'])
  const q = data('qualities.xml', x =>
    x.replace(
      '<choice kind="quality" category="Wanderer gift" count="1" max="2"/>',
      '<choice kind="quality" category="Wanderer gift" count="many" max="few"/>',
    ),
  )
  expect(q.qualities['crb.wanderer'].choices).toEqual([{ category: 'Wanderer gift', count: 1, max: 1 }])
  expect(warnings(q)).toHaveLength(2)
})

test('a quality’s Karma that is no number is null with a warning; its steps, flags and category are kept', () => {
  const d = data('qualities.xml', x =>
    x.replace(
      '<quality id="crb.knack" source="CRB" page="71" kind="positive" karma="13">',
      '<quality id="crb.knack" source="CRB" page="71" kind="positive" karma="thirteen" karmaMax="26" karmaSteps="13 18 x 26" category="Gift" uncounted="true">',
    ),
  )
  const k = d.qualities['crb.knack']
  expect(k).toMatchObject({ karma: null, karmaMax: 26, karmaSteps: [13, 18, 26], category: 'Gift', uncounted: true })
  expect(warnings(d)).toEqual(['qualities.crb.knack: Knack: the karma “thirteen” isn’t a number the app can read.'])
  expect(d.qualities['crb.lucky-streak.2']).not.toHaveProperty('uncounted')
})

test('a grade’s factors are decimals; one that is not is null with a warning; its types and what it replaces are kept', () => {
  const d = data('grades.xml', x => x.replace('essence="1.2" cost="0.4" avail="-1"', 'essence="a bit" cost="0.4" avail="-1" types="cyberware" replaces="used"'))
  const g = Object.values(d.grades).find(x => x.name === 'Rustyware')
  expect(g).toMatchObject({ essence: null, types: ['cyberware'], replaces: 'used' })
  expect(warnings(d).some(w => w.includes('the Essence factor “a bit”'))).toBe(true)
})

test('a metatype’s trait at a level (`Name 2`), its priority adjustment points, and a missing range are read; an unknown trait is a warning', () => {
  const d = data('metatypes.xml', x =>
    x
      .replace('<trait>Moonsight</trait>', '<trait>Lucky Streak 2</trait><priority letter="A" points="3"/><priority letter="B" points="2"/>')
      .replace('<range attr="cha" min="1" max="8"/>', ''),
  )
  const m = d.metatypes['crb.glimmerkin']
  expect(m.traits).toContain('crb.lucky-streak.2')
  expect(m.priority).toEqual({ A: 3, B: 2 })
  expect(m.ranges.cha).toEqual([0, 0])
  expect(warnings(d).some(w => w.includes('Glimmerkin has no range for CHA.'))).toBe(true)
  expect(warnings(d, 'data.unresolved').some(w => w.includes('“Unresolved Trait” isn’t a quality in the catalog'))).toBe(true)
  const plain = data('metatypes.xml', x => x)
  expect(plain.metatypes['crb.glimmerkin']).not.toHaveProperty('priority')
})

test('life modules read their contact types, grants and choices', () => {
  const d = data('lifemodules.xml', x =>
    x.replace(/<lifemodule id="crb\.glow-apprentice"/, '<lifemodule id="crb.glow-apprentice" contactTypes="magic  street"'),
  )
  expect(d.lifemodules['crb.glow-apprentice'].contactTypes).toEqual(['magic', 'street'])
  expect(d.lifemodules['crb.wage-drone']).not.toHaveProperty('contactTypes')
})

test('an entry found by its printed name: the kind named first, any kind otherwise; the first of two with one name', () => {
  const d = sr6Data(fixtureCatalog())
  expect(d.named?.('Glow Ward', 'spells')?.id).toBe('crb.glow-ward')
  expect(d.named?.('glow ward')?.id).toBe('crb.glow-ward')
  expect(d.named?.('Glow Ward', 'rituals')).toBeUndefined()
  expect(d.named?.('Nothing Like It')).toBeUndefined()
  expect(d.named?.('Lucky Streak', 'qualities')?.name).toMatch(/^Lucky Streak/)
})

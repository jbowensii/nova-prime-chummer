// A metavariant (Hobgoblin, Nartaki …) is Infected through its PARENT metatype (owner, 2026-10-16): the type selector,
// the type's `when="<base>"` maxima, the human / non-human vampire and Review's infected.metatype all read the parent.
// Made-up fixture metatypes carrying the real metavariant names; invented types and numbers.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { attrMax, qualityKarma } from '../../src/sr6/engine/budgets'
import { sr6Data } from '../../src/sr6/engine/data'
import { baseMetatype, infectedTypes } from '../../src/sr6/engine/infected'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation } from './fixture'

const mt = (id: string, name: string) =>
  `<metatype id="crb.${id}" source="CRB" page="41"><name>${name}</name>` +
  ['bod', 'agi', 'rea', 'str', 'wil', 'log', 'int', 'cha', 'edg'].map(a => `<range attr="${a}" min="1" max="6"/>`).join('') +
  '<text/></metatype>'
const ghoul = (base: string) =>
  `<quality id="crb.zap-ghoul-${base.toLowerCase()}" source="CRB" page="70" kind="positive" karma="20" class="INFECTED"><name>Zap Ghoul (${base})</name>` +
  `<infected strain="III" base="${base}" freePhysical="2" freeMental="2"/><effect target="attr-max:str" op="set" value="9" when="${base}"/><text/></quality>`
const VAMP =
  '<quality id="crb.zap-vampire" source="CRB" page="72" kind="positive" karma="27" class="INFECTED"><name>Zap Vampire</name>' +
  '<infected strain="I" base="Human" freePhysical="2" freeMental="2"/><infectedalt base="other" karma="32" bod="1"/><text/></quality>'
const data = sr6Data(
  fixtureCatalog((f, x) =>
    f.endsWith('crb/metatypes.xml')
      ? x.replace(
          '</sr6:data>',
          [mt('human', 'Human'), mt('ork', 'Ork'), mt('hobgoblin', 'Hobgoblin'), mt('nartaki', 'Nartaki'), mt('pixie', 'Pixie')].join('') + '</sr6:data>',
        )
      : f.endsWith('crb/qualities.xml')
        ? x.replace('</sr6:data>', `${ghoul('Ork')}${ghoul('Human')}${VAMP}</sr6:data>`)
        : x,
  ),
)
const cr = fixtureCreation()
cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
const as = (metatype: string, id: string) => {
  const b = buildOf('karma', { metatype })
  expect(apply(b, { op: 'infected', id }, data, cr)).toMatchObject({ ok: true })
  return b
}

test('a metavariant’s base is its parent; a core metatype and a metasapient are their own', () => {
  expect(['hobgoblin', 'nartaki', 'ork', 'pixie', 'none'].map(m => baseMetatype(data, `crb.${m}`))).toEqual(['Ork', 'Human', 'Ork', 'Pixie', ''])
})

test('a metavariant takes its parent’s types and maxima; the human vampire fits a Human metavariant, the alt any other', () => {
  const names = (m: string) => infectedTypes(data, `crb.${m}`).map(t => `${t.name}:${t.fit}`)
  expect(names('hobgoblin')).toEqual(['Zap Ghoul (Ork):own', 'Zap Vampire:alt'])
  expect(names('nartaki')).toEqual(['Zap Ghoul (Human):own', 'Zap Vampire:own'])
  expect(names('pixie')).toEqual(['Zap Vampire:alt'])
  expect(attrMax(data, cr, as('crb.hobgoblin', 'crb.zap-ghoul-ork'), 'str')).toBe(9)
  expect(attrMax(data, cr, as('crb.nartaki', 'crb.zap-ghoul-human'), 'str')).toBe(9)
  expect(qualityKarma(as('crb.nartaki', 'crb.zap-vampire'), data, cr).pos).toBe(27)
  expect(qualityKarma(as('crb.hobgoblin', 'crb.zap-vampire'), data, cr).pos).toBe(32)
  expect(apply(buildOf('karma', { metatype: 'crb.hobgoblin' }), { op: 'infected', id: 'crb.zap-ghoul-human' }, data, cr)).toEqual({
    ok: false,
    reason: 'not-for-metatype',
  })
})

test('Review’s infected.metatype uses the parent', () => {
  const has = (metatype: string) => {
    const b = as('crb.hobgoblin', 'crb.zap-ghoul-ork')
    b.metatype = metatype
    return validateSr6(data, cr, { ...blankSr6('karma', 'r1', '2026-10-16T00:00:00Z'), build: b }).some(v => v.code === 'infected.metatype')
  }
  expect([has('crb.ork'), has('crb.hobgoblin'), has('crb.nartaki')]).toEqual([false, false, true])
})

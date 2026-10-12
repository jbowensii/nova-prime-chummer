import { expect, test } from 'vitest'
import { nestedOf, nestedProblem, setNested } from '../../src/ui/Review'

// invented core rows, as a core review proposes them
const el = (xml: string) => new DOMParser().parseFromString(xml, 'text/xml').documentElement
const RANGES = ['str', 'agi', 'wil', 'log', 'cha'].map(a => `<range attr="${a}" min="1" max="6"/>`).join('')

test('a metatype’s ranges: read, edited, written back in place of the old ones', () => {
  const e = el(`<metatype id="gnome" edge="1" source="CRB" page="3"><name>Gnome</name><racialQuality>Small</racialQuality>${RANGES}</metatype>`)
  const n = nestedOf(e)
  expect(n.specs).toBeUndefined()
  expect(n.ranges![0]).toEqual({ attr: 'str', min: '1', max: '6' })
  const edited = { ranges: n.ranges!.map(r => (r.attr === 'str' ? { ...r, min: ' 2', max: '4 ' } : r)) }
  expect(nestedProblem(edited)).toBeNull()
  setNested(e, edited)
  expect([...e.children].map(c => c.tagName)).toEqual(['name', 'racialQuality', 'range', 'range', 'range', 'range', 'range'])
  expect(e.getElementsByTagName('range')[0].outerHTML).toBe('<range attr="str" min="2" max="4"/>')
  expect(nestedProblem({ ranges: [{ attr: 'str', min: '5', max: '2' }] })).toMatch(/no lower than its minimum/)
  expect(nestedProblem({ ranges: [{ attr: 'str', min: '0', max: '0' }] })).toMatch(/at least 1/)
  expect(nestedProblem({ ranges: [{ attr: 'str', min: '-1', max: '3' }] })).toMatch(/whole numbers/)
})

test('a skill’s specializations: added (id from the name), renamed, removed; blank names and repeated ids refused', () => {
  const e = el(
    '<skill id="sneak" attr="agi" source="CRB" page="3"><name>Sneak</name><spec id="sneak.quiet" attr="agi">Quiet</spec><spec id="sneak.odd" attr="agi">Odd</spec></skill>',
  )
  const n = nestedOf(e)
  expect(n).toEqual({
    specs: [
      { id: 'sneak.quiet', attr: 'agi', name: 'Quiet' },
      { id: 'sneak.odd', attr: 'agi', name: 'Odd' },
    ],
  })
  const edited = {
    specs: [
      { ...n.specs![0], name: 'Very quiet' },
      { id: '', attr: 'wil', name: 'Soft Steps!' },
    ],
  }
  expect(nestedProblem(edited, 'sneak')).toBeNull()
  setNested(e, edited)
  expect(new XMLSerializer().serializeToString(e)).toBe(
    '<skill id="sneak" attr="agi" source="CRB" page="3"><name>Sneak</name>' +
      '<spec id="sneak.quiet" attr="agi">Very quiet</spec><spec id="sneak.soft-steps" attr="wil">Soft Steps!</spec></skill>',
  )
  expect(nestedProblem({ specs: [{ id: '', attr: 'agi', name: ' ' }] }, 'sneak')).toBe('Each specialization needs a name.')
  expect(nestedProblem({ specs: [{ id: '', attr: 'agi', name: '!?' }] }, 'sneak')).toBe('The specialization “!?” needs a letter or digit in its name.')
  expect(
    nestedProblem(
      {
        specs: [
          { id: '', attr: 'agi', name: 'Quiet' },
          { id: 'sneak.quiet', attr: 'wil', name: 'Other' },
        ],
      },
      'sneak',
    ),
  ).toBe('Two specializations have the id sneak.quiet.')
  expect(nestedOf(el('<level id="street"><name>Street</name></level>'))).toEqual({})
})

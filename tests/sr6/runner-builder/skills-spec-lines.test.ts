// A specialization / expertise shows as its own indented line with the boosted pool; the base line stays (CRB p. 66).
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { SpecLines } from '../../../src/sr6/runner-builder/ui/tabs/Skills'
import { mount } from '../../ui/dom'

test('specialization and expertise render as separate sub-lines with their own pools', async () => {
  const pool = { skill: 'firearms', attr: 'agility', dp: 9, spec: 'Pistols', specDp: 11, expertise: 'Semi-Automatics', expertiseDp: 12 }
  const { el } = await mount(createElement('table', null, createElement('tbody', null, createElement(SpecLines, { pool: pool as never }))))
  const rows = [...el.querySelectorAll('tr.sr6-spec-line')].map(r => (r.textContent ?? '').replace(/\s+/g, ' '))
  expect(rows).toHaveLength(2)
  expect(rows[0]).toContain('Specialization: Pistols')
  expect(rows[0]).toContain('11')
  expect(rows[0]).toContain('the 9 above applies to everything else')
  expect(rows[1]).toContain('Expertise: Semi-Automatics')
  expect(rows[1]).toContain('12')
})

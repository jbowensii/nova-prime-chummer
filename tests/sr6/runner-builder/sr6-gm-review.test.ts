// What a GM sees of a player's runner problems (owner 2026-10-16): the counts on the campaign page's runner rows, the banner
// at the top of the runner's editor (GM only), and Review's "Approved by GM" box (a GM ticks to approve, unticks to revoke;
// the player sees it read only). Made-up runner, campaign and accounts over the design fixture catalog.
import { createElement, type ReactElement } from 'react'
import { expect, test } from 'vitest'
import { Me, type User } from '../../../src/core/ui-kit/auth'
import { sr6ToXml } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { boughtDesign } from '../../../src/sr6/runner-builder/domain/assets/design'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/rules'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { problemParts, Sr6CampaignScreen } from '../../../src/sr6/runner-builder/ui/problems'
import { designCatalog } from './design-fixture'
import { fixtureCreation, GLIM } from '../catalog/fixture'
import { change, click, field, mount, pageText, stubFetch } from '../../ui/dom'

const c = designCatalog(),
  data = sr6Data(c),
  cr = fixtureCreation()
const user = (username: string, role: User['role']) => ({ id: username, username, role, name: username }) as User
const GIL = user('gil', 'editor'),
  PAT = user('pat', 'player')
const as = (u: User, el: ReactElement) => createElement(Me.Provider, { value: u, key: u.username }, el)

/** A design bought on Vehicles: Review warns "needs GM approval" (a warning a GM approves). */
function redZip(): Sr6Character {
  const d = blankSr6('priority', 'd1', '2026-10-16T00:00:00.000Z')
  d.identity.streetName = 'Red Zip'
  d.design = {
    kind: 'vehicle',
    chassis: 'zz.zip-frame',
    powertrain: 'zz.roller',
    console: 'zz.brainbox',
    options: [{ id: 'zz.racing', level: 1 }],
    mods: [],
  }
  return d
}
function pats(fn: (ch: Sr6Character) => void = () => {}) {
  const ch = blankSr6('karma', 'r2', '2026-10-16T00:00:00.000Z')
  ch.identity.streetName = 'Made-up Spur'
  ch.build.metatype = GLIM
  ch.campaign = 'k1'
  ch.build.purchases = [boughtDesign(redZip(), data, cr, 'v1')]
  fn(ch)
  return ch
}
const camp = (rows: object[]) => ({
  id: 'k1',
  name: 'Made-up Run',
  note: '',
  archived: false,
  created: '',
  you: 'gm',
  gms: [{ username: 'gil', name: 'Gil' }],
  members: [{ username: 'pat', name: 'Pat' }],
  runners: rows,
  creation: null,
})
const row = (id: string, streetName: string) => ({ key: id, mine: false, ownerName: 'Pat', owner: 'pat', streetName, level: '', package: '', id })

/** The server as a GM reads it: Pat's runner (owner pat), its campaign, and the approvals route (recorded). */
function server(ch: Sr6Character, rows = [row(ch.id, 'Made-up Spur')]) {
  const approvals: { code: string; path: string; note: string }[][] = []
  const calls = stubFetch([
    [
      /\/api\/sr6\/campaigns\/k1\/runners\/r2\/overrides$/,
      (_u, init) => {
        approvals.push(JSON.parse(String(init?.body)).overrides)
        return { rev: 2 }
      },
    ],
    [/\/api\/sr6\/campaigns\/k1$/, () => camp(rows)],
    [/\/api\/sr6\/characters(\/|$|\?)/, () => [{ file: 'r2.xml', rev: 1, xml: sr6ToXml(ch), owner: 'pat', ownerName: 'Pat' }]],
  ])
  return { approvals, calls }
}
const editor = (u: User, tab = 'concept') => as(u, createElement(Sr6EditorView, { c, data, cr, id: 'r2', tab }))
const banner = () => [...document.querySelectorAll('p.banner')].find(b => /This runner has/.test(b.textContent ?? ''))

test('problemParts: unapproved errors and warnings, singular and plural, nothing when clean', () => {
  const v = (severity: 'error' | 'warning', approved?: boolean) => ({ code: 'x', severity, path: 'p', message: 'm', approved })
  expect(problemParts([])).toEqual([])
  expect(problemParts([v('error'), v('warning')])).toEqual(['1 error', '1 warning'])
  expect(problemParts([v('error'), v('error'), v('error', true), v('warning', true)])).toEqual(['2 errors'])
})

test('the campaign page: each runner row counts its open errors and warnings, linked to Review; a row with no runner behind it has none', async () => {
  const ch = pats()
  const want = problemParts(validateSr6(data, cr, ch)).join(' · ')
  expect(want).toMatch(/error.*warning/)
  const reads = server(ch, [row('r2', 'Made-up Spur'), row('r9', 'Made-up Ghost')])
  await mount(as(GIL, createElement(Sr6CampaignScreen, { id: 'k1', c, data, cr, extra: () => null })))
  const metas = [...document.querySelectorAll('.dossier')].map(d => [d.querySelector('.title')?.textContent, d.querySelector('.meta')?.textContent])
  expect(metas).toEqual([
    ['Made-up Spur', want],
    ['Made-up Ghost', ''],
  ])
  expect(document.querySelector('.meta a')?.getAttribute('href')).toBe('#/sr6/c/r2/review')
  // the runners are read once, by the list the GM already opens runners from
  expect(reads.calls.filter(x => /api\/sr6\/characters/.test(x.url)).length).toBe(1)
})

test('a GM opening a player’s runner is told its open problems on every tab', async () => {
  const ch = pats()
  server(ch)
  const m = await mount(editor(GIL))
  const want = problemParts(validateSr6(data, cr, ch)).join(' and ')
  expect(banner()?.textContent).toBe(`This runner has ${want} — review them.`)
  expect(banner()?.querySelector('a')?.getAttribute('href')).toBe('#/sr6/c/r2/review')
  await m.rerender(editor(GIL, 'gear'))
  expect(banner()).toBeDefined()
})

test('the owner sees no banner', async () => {
  server(pats())
  await mount(editor(PAT))
  expect(pageText()).toMatch(/Made-up Spur/)
  expect(banner()).toBeUndefined()
})

test('Review: the GM ticks Approved by GM (with the optional note) and unticks to revoke; the player sees the box read only', async () => {
  const ch = pats()
  const { approvals } = server(ch)
  const m = await mount(editor(GIL, 'review'))
  const warn = () => [...document.querySelectorAll('.viol')].find(v => /Custom design: needs GM approval/.test(v.textContent ?? ''))!
  const box = () => field<HTMLInputElement>('Approved by GM', warn())
  expect(box().checked).toBe(false)
  await change(field('GM note (optional)', warn()), 'Built in the garage')
  await click(box())
  expect(approvals.at(-1)).toEqual([{ code: 'vehicle.design', path: 'vehicles.v1', note: 'Built in the garage' }])
  expect(box().checked).toBe(true)
  expect(warn().textContent).toMatch(/GM: Built in the garage/)
  await click(box())
  expect(approvals.at(-1)).toEqual([])
  expect(box().checked).toBe(false)
  // the note typed stays in the field for the next tick; cleared, the approval carries none (it is optional)
  await change(field('GM note (optional)', warn()), '')
  await click(box())
  expect(approvals.at(-1)).toEqual([{ code: 'vehicle.design', path: 'vehicles.v1', note: '' }])

  // the player's view of the same runner (approved): the box is checked and can't be changed, with the GM's note
  server(pats(x => (x.overrides = [{ code: 'vehicle.design', path: 'vehicles.v1', note: 'Fine by me' }])))
  await m.rerender(editor(PAT, 'review'))
  expect(box().checked).toBe(true)
  expect(box().disabled).toBe(true)
  expect(pageText(warn())).toMatch(/GM: Fine by me/)
  expect(() => field('GM note (optional)', warn())).toThrow()
})

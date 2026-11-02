// "Go fix" links (plan items 6 and 7): a tab's problems panel, fixAt (where it's fixed, not where it shows), Review's
// links, and #/sr6/c/<id>/<tab>/<target> scrolling to and focusing the row. Made-up runner.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml } from '../../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { fixAtOf, fixHref } from '../../../src/sr6/runner-builder/ui/FixAt'
import { sr6Tabs } from '../../../src/sr6/runner-builder/ui/tabList'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'
import { fakeStore, mount, stubFetch } from '../../ui/dom'

async function open(ch: Sr6Character, tab: string, sub?: string) {
  const c = fixtureCatalog()
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data: sr6Data(c), cr: fixtureCreation(), id: ch.id, tab, sub }))
}
const noMagicPriority = () => {
  const ch = blankSr6('priority', 'made-up-f', '2026-11-02T00:00:00.000Z')
  ch.build = buildOf('priority', { letters: 'CBADA', metatype: GLIM, magic: 'full' })
  ch.build.priorities.magic = null
  return ch
}

test('Magic with no Magic priority: the panel says so, with Go fix to Creation method', async () => {
  await open(noMagicPriority(), 'magic')
  const panel = document.querySelector('.problems')!
  expect(panel.textContent).toContain('Set the Magic priority on Creation method')
  const go = [...panel.querySelectorAll('a')].find(a => /Go fix/.test(a.textContent ?? ''))!
  expect(go.getAttribute('href')).toBe('#/sr6/c/made-up-f/method')
})

test('Review links the problem to where it is fixed', async () => {
  await open(noMagicPriority(), 'review')
  const a = [...document.querySelectorAll('.viol .msg a')].find(a => /Set the Magic priority/.test(a.textContent ?? ''))!
  expect(a.getAttribute('href')).toBe('#/sr6/c/made-up-f/method')
})

test('fixAt defaults to the tab and row the path names; a set one wins', () => {
  const ch = blankSr6('karma', 'r', '2026-11-02T00:00:00.000Z'),
    data = sr6Data(fixtureCatalog()),
    tabs = sr6Tabs('mundane', false)
  const at = fixAtOf(ch, data, tabs, { code: 'x', severity: 'error', path: 'qualities.q1', message: '' })
  expect(at).toEqual({ tab: 'qualities', target: 'q1' })
  expect(fixHref(ch, at!)).toBe('#/sr6/c/r/qualities/q1')
  expect(fixAtOf(ch, data, tabs, { code: 'x', severity: 'error', path: 'magic', message: '', fixAt: { tab: 'attributes' } })).toEqual({ tab: 'attributes' })
})

test('a route target scrolls to its row, flashes it and focuses it', async () => {
  const ch = blankSr6('karma', 'made-up-g', '2026-11-02T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.qualities = [{ uid: 'q1', id: Object.keys(sr6Data(fixtureCatalog()).qualities)[0] }] as typeof ch.build.qualities
  await open(ch, 'qualities', 'q1')
  const row = document.querySelector('[data-target="q1"]')!
  expect(row).not.toBeNull()
  expect(row.classList.contains('target-flash')).toBe(true)
  expect(document.activeElement).toBe(row)
})

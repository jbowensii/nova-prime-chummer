// Switching tabs in the SR6 runner editor (src/sr6/shell/ui/EditorView.tsx, `npm run perf`): Made-Up Mara (career, one of
// every kind of thing) with her purchases LINES times over, on the fixture catalog with the picker kinds padded to a real
// catalog's size (COPIES copies of each entry under new ids). Each tab is opened in turn as a hash-route change does it (a
// render with the new tab); round 0 warms up, the medians of the rest are printed. Made-up data throughout.
// A tab switch neither remounts the editor nor re-runs its validation/derivation (EditorView's calc memo): what's left is
// the new tab's own render, which grows with the runner's lines (Gear, Vehicles, Drones, Critters).
// BUDGET (ms, the slowest tab's median): set 2026-11-02 at ~5x the dev PC's (Gear ~47 ms at LINES=10).
import { act, createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { sr6ToXml } from '../../src/sr6/formats/domain/charxml'
import { Sr6EditorView } from '../../src/sr6/shell/ui/EditorView'
import { sr6Tabs } from '../../src/sr6/runner-builder/ui/tabList'
import { mara, sampleWorld } from '../sr6/runner-builder/samples'
import { fakeStore, mount, stubFetch } from '../ui/dom'

const COPIES = 100,
  LINES = 10,
  ROUNDS = 6,
  BUDGET = 250
const SCALE = Number(process.env.PERF_BUDGET_SCALE ?? 1)
// the kinds the pickers list: a real catalog has hundreds to thousands of each (and a few dozen skills, a handful of grades)
const PADDED = [
  'qualities',
  'weapons',
  'armor',
  'augmentations',
  'electronics',
  'programs',
  'gear',
  'vehicles',
  'spells',
  'adeptpowers',
  'complexforms',
  'metamagics',
  'critterpowers',
] as const

/** `x` with every uid (and the mount naming one) suffixed: a copy of a purchase line that doesn't clash. */
const renamed = (x: unknown, i: number): unknown =>
  Array.isArray(x)
    ? x.map(y => renamed(y, i))
    : x && typeof x === 'object'
      ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === 'uid' || k === 'mount' ? `${v}-${i}` : renamed(v, i)]))
      : x

test('switching every tab of a heavy career runner', async () => {
  const w = sampleWorld()
  for (const k of PADDED) {
    const m = w.c.entries[k]
    for (const e of [...m.values()]) for (let i = 1; i <= COPIES; i++) m.set(`${e.id}-x${i}`, { ...e, id: `${e.id}-x${i}`, name: `${e.name} ${i}` })
  }
  const data = sr6Data(w.c)
  const ch = mara(w)
  ch.build.purchases = Array.from({ length: LINES }, (_, i) => renamed(ch.build.purchases, i) as typeof ch.build.purchases).flat()
  stubFetch([fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) }).route])
  const view = (tab: string) => createElement(Sr6EditorView, { c: w.c, data, cr: w.cr, id: ch.id, tab })
  const m = await mount(view('concept'))
  const tabs = sr6Tabs(ch.build.magic, true)
    .map(([k]) => k)
    .filter(k => k !== 'print')
  const times: Record<string, number[]> = {}
  for (let round = 0; round < ROUNDS; round++)
    for (const t of tabs) {
      const s = performance.now()
      act(() => m.root.render(view(t)))
      if (round) (times[t] ??= []).push(performance.now() - s)
    }
  const med = Object.entries(times).map(([k, v]) => [k, v.sort((a, b) => a - b)[v.length >> 1]] as const)
  for (const [k, v] of med) console.log(`perf sr6 tab ${k}: median ${v.toFixed(1)} ms`)
  expect(document.body.textContent).toMatch(/Ledger/)
  const [slow, worst] = med.reduce((a, b) => (b[1] > a[1] ? b : a))
  expect(worst, `slowest tab ${slow} ${worst.toFixed(1)} ms`).toBeLessThan(BUDGET * SCALE)
}, 120_000)

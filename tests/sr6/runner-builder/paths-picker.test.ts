// The Quality Paths picker: the Paths section on a fixture catalog and fixture paths (no fetch), a path walked through
// the buttons (start, advance, back, remove) with the quality rows following, and the DEA mentor-spirit loop.
import { readFileSync } from 'node:fs'
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import type { QualityPath } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { advancePath, rewindPath, startPath } from '../../../src/sr6/runner-builder/domain/paths'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { PathsSection } from '../../../src/sr6/runner-builder/ui/tabs/PathsSection'
import { buildOf, made } from '../catalog/fixture'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const step = (id: string, level: number, modifications: QualityPath['steps'][0]['modifications'], nextSteps: string[]) => ({
  id,
  level,
  name: id.toUpperCase(),
  body: '',
  requires: [],
  modifications,
  nextSteps,
})
const FIX: QualityPath = {
  id: 'test_path',
  name: 'Test Path',
  bookKey: 'crb',
  steps: [
    step('s1', 0, [{ op: 'add', ref: 'quality:butterfingers' }], ['s2', 's3']),
    step(
      's2',
      1,
      [
        { op: 'remove', ref: 'quality:butterfingers' },
        { op: 'add', ref: 'quality:stoneskin' },
      ],
      [],
    ),
    step(
      's3',
      1,
      [
        { op: 'add', ref: 'quality:not_in_catalog' },
        { op: 'valmod', ref: 'x', value: '1', attr: 'edge' },
      ],
      [],
    ),
  ],
}

function mount(paths: QualityPath[]) {
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CBADA' })
  const Harness = () => {
    const [, bump] = useState(0)
    const ctx = { ch, data, cr, ro: false, career: false, update: (fn: (c: typeof ch) => void) => (fn(ch), bump(n => n + 1)) } as unknown as Sr6Ctx
    return createElement(Sr6Editor.Provider, { value: ctx }, createElement(PathsSection, { load: async b => (b === 'companion' ? paths : []) }))
  }
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  return { ch, host, render: () => act(async () => root!.render(createElement(Harness))) }
}
const click = (host: HTMLElement, text: string) => act(() => void [...host.querySelectorAll('button')].find(b => b.textContent === text)!.click())
const ids = (ch: { build: { qualities: { id: string }[] } }) => ch.build.qualities.map(q => q.id)

test('renders a fixture path; start, advance, back, remove move pathProgress and the quality rows', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const m = mount([FIX])
  await m.render()
  expect(m.host.textContent).toContain('Test Path')
  await click(m.host, 'Start this path')
  expect(m.ch.pathProgress).toEqual([{ pathId: 'test_path', currentStepId: 's1', visitedStepIds: ['s1'], choicesByStepId: {} }])
  expect(ids(m.ch)).toEqual(['crb.butterfingers'])
  expect(m.host.textContent).toContain('Gains Butterfingers')
  await click(m.host, 'S2')
  expect(m.ch.pathProgress[0].currentStepId).toBe('s2')
  expect(ids(m.ch)).toEqual(['crb.stoneskin'])
  await click(m.host, 'Back a step')
  expect(m.ch.pathProgress[0]).toMatchObject({ currentStepId: 's1', visitedStepIds: ['s1'] })
  expect(ids(m.ch)).toEqual(['crb.butterfingers'])
  await click(m.host, 'S3') // an unresolved add is skipped, not a crash; valmod is only shown
  expect(m.host.textContent).toContain('Skipped')
  expect(m.host.textContent).toContain('applied manually at the table')
  await click(m.host, 'Remove path')
  expect(m.ch.pathProgress).toEqual([])
  expect(ids(m.ch)).toEqual([])
})

test('the DEA mentor-spirit loop: each walk into reject / first_interaction grows visitedStepIds', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const dea = (JSON.parse(readFileSync('importer/sr6/library/deus_ex_arcana/paths.json', 'utf8')) as Omit<QualityPath, 'bookKey'>[]).find(
    p => p.id === 'path_of_mentor_spirit',
  )!
  const path = { ...dea, bookKey: 'deus_ex_arcana' }
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  startPath(ch, path, data, cr)
  const seen = [ch.pathProgress[0].visitedStepIds.length]
  for (const to of ['reject', 'first_interaction', 'reject']) {
    advancePath(ch, path, to, data, cr)
    seen.push(ch.pathProgress[0].visitedStepIds.length)
  }
  expect(ch.pathProgress[0].visitedStepIds).toEqual(['first_interaction', 'reject', 'first_interaction', 'reject'])
  expect(seen).toEqual([1, 2, 3, 4])
  advancePath(ch, path, 'accept', data, cr) // not a next step of reject: refused
  expect(ch.pathProgress[0].currentStepId).toBe('reject')
  rewindPath(ch, path, data, cr)
  expect(ch.pathProgress[0].currentStepId).toBe('first_interaction')
})

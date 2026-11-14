// The Quality Paths picker: the Paths section on a fixture catalog and fixture paths (no fetch), a path walked through
// the buttons (start, advance, back, remove) with the quality rows following, and the DEA mentor-spirit loop.
import { readFileSync } from 'node:fs'
import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import type { QualityPath } from '../../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../../src/sr6/formats/domain/character'
import { advancePath, pathsFor, qualityIdOf, rewindPath, startPath } from '../../../src/sr6/runner-builder/domain/paths'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { PathsSection } from '../../../src/sr6/runner-builder/ui/tabs/PathsSection'
import { validateSr6 } from '../../../src/sr6/runner-builder/domain/review/validate'
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

const pick = (host: HTMLElement, label: string, value: string) =>
  act(() => {
    const el = host.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })

test('a step choice: the select records optionRef, a sub-option select records subOptionRef, "" clears', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path: QualityPath = {
    id: 'choice_path',
    name: 'Choice Path',
    bookKey: 'crb',
    steps: [
      step(
        'c1',
        0,
        [
          {
            op: 'choice',
            ref: 'CHOICE',
            type: 'QUALITY',
            id: 'u1',
            options: [
              { ref: 'phobia', label: 'phobia' },
              { ref: 'bad_memories', label: 'bad_memories' },
            ],
          },
        ],
        ['c2'],
      ),
      step(
        'c2',
        0,
        [
          {
            op: 'choice',
            ref: 'crittertype',
            type: 'SUBSELECT',
            id: 'u2',
            options: [{ ref: 'herbivore', label: 'herbivore', subOptions: [{ ref: 'deer', label: 'deer' }] }],
          },
        ],
        [],
      ),
    ],
  }
  const m = mount([path])
  await m.render()
  await click(m.host, 'Start this path')
  await pick(m.host, 'Path choice', 'phobia')
  expect(m.ch.pathProgress[0].choicesByStepId).toEqual({ c1: { optionRef: 'phobia' } })
  await pick(m.host, 'Path choice', '')
  expect(m.ch.pathProgress[0].choicesByStepId).toEqual({})
  await click(m.host, 'C2')
  await pick(m.host, 'Path choice', 'herbivore')
  await pick(m.host, 'Path sub-option', 'deer')
  expect(m.ch.pathProgress[0].choicesByStepId.c2).toEqual({ optionRef: 'herbivore', subOptionRef: 'deer' })
})

test('path visibility by requirement: met, unmet and negate', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const req = (id: string, r: string): QualityPath => ({ id, name: id, bookKey: 'crb', steps: [{ ...step('a', 0, [], []), requires: [r] }] })
  const q = (ref: string, negate = false) => `<datareq type="QUALITY" ref="${ref}"${negate ? ' negate="true"' : ''} apply="CHARACTER" />`
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CBADA' })
  startPath(ch, FIX, data, cr)
  const all = [
    req('met', q('butterfingers')),
    req('unmet', q('stoneskin')),
    req('negate_hidden', q('butterfingers', true)),
    req('negate_shown', q('stoneskin', true)),
  ]
  expect(pathsFor(ch, data, cr, all).map(p => p.id)).toEqual(['met', 'negate_shown'])
})

test('Review path.progress warns: unknown path, off-graph step, missing choice, uncatalogued mod; MAGIC_RESO gates by kind', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf('priority', { letters: 'CBADA' })
  const P: QualityPath = {
    id: 'p',
    name: 'P',
    bookKey: 'crb',
    steps: [
      step('a', 0, [{ op: 'choice', ref: 'X', type: null, id: null, options: [] }], ['b']),
      step('b', 1, [{ op: 'add', ref: 'quality:not_in_catalog' }], []),
    ],
  }
  ch.pathProgress = [
    { pathId: 'gone', currentStepId: 'a', visitedStepIds: ['a'], choicesByStepId: {} },
    { pathId: 'p', currentStepId: 'b', visitedStepIds: ['b', 'a'], choicesByStepId: {} },
  ]
  expect(validateSr6(data, cr, ch).filter(v => v.code === 'path.progress')).toEqual([])
  const msgs = validateSr6(data, cr, ch, [P]).filter(v => v.code === 'path.progress')
  expect(msgs.every(v => v.severity === 'warning')).toBe(true)
  const text = msgs.map(v => v.message).join(' ')
  for (const w of ['isn’t in the loaded paths', 'doesn’t follow', 'asks for a choice', 'not_in_catalog']) expect(text).toContain(w)
  const mag: QualityPath = {
    ...P,
    id: 'mag',
    steps: [{ ...step('a', 0, [], []), requires: ['<selreq><datareq type="MAGIC_RESO" ref="adept" /><datareq type="MAGIC_RESO" ref="magician" /></selreq>'] }],
  }
  ch.build.magic = 'mundane'
  expect(pathsFor(ch, data, cr, [mag])).toEqual([])
  ch.build.magic = 'full'
  expect(pathsFor(ch, data, cr, [mag])).toEqual([mag])
})

test('a QUALITY choice adds the picked quality, swaps it, and Back / clear take it off; the CHOICE placeholder is not a skip', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const path: QualityPath = {
    id: 'q_choice',
    name: 'Q Choice',
    bookKey: 'crb',
    steps: [
      step(
        'q1',
        0,
        [
          { op: 'add', ref: 'quality:CHOICE' },
          {
            op: 'choice',
            ref: 'CHOICE',
            type: 'QUALITY',
            id: 'u1',
            options: [
              { ref: 'butterfingers', label: 'butterfingers' },
              { ref: 'stoneskin', label: 'stoneskin' },
            ],
          },
        ],
        [],
      ),
    ],
  }
  const m = mount([path])
  await m.render()
  await click(m.host, 'Start this path')
  expect(ids(m.ch)).toEqual([])
  expect(m.host.textContent).not.toContain('Skipped')
  await pick(m.host, 'Path choice', 'butterfingers')
  expect(ids(m.ch)).toEqual(['crb.butterfingers'])
  expect(m.host.textContent).toContain('Butterfingers')
  await pick(m.host, 'Path choice', 'stoneskin')
  expect(ids(m.ch)).toEqual(['crb.stoneskin'])
  await pick(m.host, 'Path choice', '')
  expect(ids(m.ch)).toEqual([])
  await pick(m.host, 'Path choice', 'butterfingers')
  await click(m.host, 'Remove path')
  expect(ids(m.ch)).toEqual([])
  expect(m.ch.pathProgress).toEqual([])
})

test('qualityIdOf finds a path step filed as `<path>: <step>`, and a parenthetical aside is ignored', () => {
  const data = {
    qualities: { 'swc.obsession-momentous-misfortune': { name: 'Obsession: Momentous Misfortune' }, 'fs.phobia-object': { name: 'Phobia (Object)' } },
  } as never
  const path: QualityPath = { id: 'obsession', name: 'Obsession', bookKey: 'companion', steps: [step('obsession_misfortune', 0, [], [])] }
  path.steps[0].name = 'Momentous Misfortune'
  expect(qualityIdOf(data, 'quality:obsession_misfortune')).toBeNull()
  expect(qualityIdOf(data, 'quality:obsession_misfortune', 'companion', path)).toBe('swc.obsession-momentous-misfortune')
  expect(qualityIdOf(data, 'quality:phobia', 'fs', path)).toBe('fs.phobia-object')
})

test('a path shows only when its book is imported, unless the runner is already on it', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { data, cr } = made()
  const ch = blankSr6('priority', 'r1', '2026-10-03T00:00:00Z')
  const book = (id: string, bookKey: string): QualityPath => ({ id, name: id, bookKey, steps: [step('a', 0, [], [])] })
  const all = [book('fs_path', 'firing_squad'), book('swc_path', 'companion'), book('shc_path', 'shadow_cast')]
  const only = { ...data, hasSource: (id: string) => id === 'FS' } as typeof data
  expect(pathsFor(ch, only, cr, all).map(p => p.id)).toEqual(['fs_path'])
  ch.pathProgress = [{ pathId: 'shc_path', currentStepId: 'a', visitedStepIds: ['a'], choicesByStepId: {} }]
  expect(pathsFor(ch, only, cr, all).map(p => p.id)).toEqual(['fs_path', 'shc_path'])
})

test('qualityIdOf answers a ref by the quality’s own Commlink6 id (cl6)', () => {
  const data = {
    qualities: { 'shc.gestalt-step-1': { name: 'Gestalt: Step 1' } },
    named: (n: string) => (n === 'social adept gestalt 1' ? { id: 'shc.gestalt-step-1' } : undefined),
  } as never
  expect(qualityIdOf(data, 'quality:social_adept_gestalt_1')).toBe('shc.gestalt-step-1')
  expect(qualityIdOf(data, 'quality:nothing_here')).toBeNull()
})

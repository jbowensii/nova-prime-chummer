// The Method tab's power-level selector and per-method "set up" checkboxes (ui/tabs/Method.tsx), backed by creation.ts's
// powerLevelOf/powerLevelRules and methodFill/methodOwnKeys. The power level maps to the Sixth World Companion's levels of
// play (levelSwcStreet/levelSwcElite); a checkbox fills a method's settings from the standard values as an assumed,
// undoable runner override. Made-up fixture rules.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { flag, methodFill, methodOwnKeys, missingFor, powerLevelOf, powerLevelRules, runnerRules } from '../../../src/sr6/table-setup/domain/creation'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { Sr6Editor, type Sr6Ctx } from '../../../src/sr6/runner-builder/ui/editor'
import { PowerLevelControl } from '../../../src/sr6/runner-builder/ui/tabs/Method'
import { fixtureCreation, made } from '../catalog/fixture'
import { change, field, mount } from '../../ui/dom'

const { data } = made()

// (a) Street / Elite set the level-of-play toggles as an assumed runner override.
test('a power level sets its level-of-play toggle as an assumed override', () => {
  const base = fixtureCreation() // the fixture is Standard: no level of play on
  expect(powerLevelOf(base)).toBe('standard')

  const elite = runnerRules(base, powerLevelRules('elite'))
  expect(powerLevelOf(elite)).toBe('elite')
  expect(elite.get('levelSwcElite')).toMatchObject({ value: true, from: 'runner', assumed: true })
  expect(flag(elite, 'levelSwcStreet')).toBe(false)

  const street = runnerRules(base, powerLevelRules('street'))
  expect(powerLevelOf(street)).toBe('street')
  expect(flag(street, 'levelSwcStreet')).toBe(true)
  expect(flag(street, 'levelSwcElite')).toBe(false)
})

// (b, domain) the override is undoable: drop the runner rules and the runner tracks the table again.
test('removing the power-level override tracks the table again', () => {
  const base = fixtureCreation()
  const over = powerLevelRules('street')
  expect(over.every(r => r.assumed)).toBe(true)
  expect(powerLevelOf(runnerRules(base, over))).toBe('street')
  expect(powerLevelOf(runnerRules(base, []))).toBe('standard') // undone
})

// (b, UI) overriding the campaign level is gated behind a confirm: declining changes nothing, accepting applies it.
test('overriding the campaign power level is gated behind the confirm', async () => {
  const base = fixtureCreation() // campaign Standard
  let ch: Sr6Character = blankSr6('priority', 'r1')
  const ctx = (): Sr6Ctx =>
    ({
      ch,
      cr: runnerRules(base, ch.rules ?? []),
      table: base,
      ro: false,
      career: false,
      update: (fn: (c: Sr6Character) => void) => {
        const d = structuredClone(ch)
        fn(d)
        ch = d
      },
    }) as unknown as Sr6Ctx
  const view = () => createElement(Sr6Editor.Provider, { value: ctx() }, createElement(PowerLevelControl))
  const { rerender } = await mount(view())

  vi.stubGlobal('confirm', () => false) // GM permission refused
  await change(field('Power level'), 'elite')
  await rerender(view())
  expect(ch.rules).toBeUndefined()
  expect(powerLevelOf(runnerRules(base, ch.rules ?? []))).toBe('standard')

  vi.stubGlobal('confirm', () => true) // GM permission given
  await change(field('Power level'), 'elite')
  await rerender(view())
  expect(powerLevelOf(runnerRules(base, ch.rules ?? []))).toBe('elite')
  expect((ch.rules ?? []).find(r => r.key === 'levelSwcElite')).toMatchObject({ value: 'true', assumed: true })
})

// (c) checking a method's box fills its gating settings from the standard values, so the method becomes usable.
test('setting a method up fills its settings and makes it usable', () => {
  const std = fixtureCreation() // the standard values the checkbox fills from
  const base = fixtureCreation()
  base.delete('karmaBuildMethod') // the table hasn't turned the Karma build on for this runner
  const before = runnerRules(base)
  expect(missingFor('karma', before, data)).toContain('karmaBuildMethod')

  const fill = methodFill('karma', before, data, std)
  expect(fill.map(r => r.key)).toContain('karmaBuildMethod')
  expect(fill.every(r => r.assumed)).toBe(true)

  const after = runnerRules(base, fill)
  expect(flag(after, 'karmaBuildMethod')).toBe(true)
  expect(missingFor('karma', after, data)).toHaveLength(0)

  // undo: the method's own keys are the ones a checkbox clears
  const keys = methodOwnKeys('karma', data)
  expect(keys).toContain('karmaBuildMethod')
  const undone = runnerRules(
    base,
    fill.filter(r => !keys.includes(r.key)),
  )
  expect(missingFor('karma', undone, data)).toContain('karmaBuildMethod')
})

// methodOwnKeys leaves shared settings alone, so clearing one method's box never disturbs another's.
test('methodOwnKeys are exclusive to the method', () => {
  const keys = methodOwnKeys('pointbuy', data) as string[]
  expect(keys).toContain('pointBuy.total')
  expect(keys.some((k: string) => k.startsWith('metatypeKarma:'))).toBe(false) // shared with karma and lifepath
  expect(keys.some((k: string) => k.startsWith('karmaBuild.'))).toBe(false)
})

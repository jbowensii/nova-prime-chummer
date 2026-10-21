// tools/arch-move.mjs: where a file goes, and how an import specifier follows a move.
// @vitest-environment node
import { expect, test } from 'vitest'
// @ts-expect-error: a plain .mjs tool, no types
import { clashes, respec, selected, target } from '../tools/arch-move.mjs'

test('the target rule', () => {
  expect(target('src/ui/nav.tsx', 'core/chrome')).toBe('src/core/chrome/nav.tsx')
  expect(target('src/features/runner-store/repo.ts', 'features/runner-store')).toBe('src/features/runner-store/repo.ts')
  expect(target('src/sr6/catalog/domain/data.ts', 'sr6/catalog')).toBe('src/sr6/catalog/domain/data.ts')
  expect(target('src/sr6/ui/tabs/Ledger.tsx', 'sr6/runner-builder')).toBe('src/sr6/runner-builder/ui/tabs/Ledger.tsx')
  expect(target('src/sr6/engine/budgets.ts', 'sr6/runner-builder', 'creation')).toBe('src/sr6/runner-builder/domain/creation/budgets.ts')
  expect(target('src/print/sheet.tsx', 'ca2/print')).toBe('src/ca2/print/ui/sheet.tsx')
  expect(target('src/ca2/print/ui/sheet.css', 'ca2/print')).toBe('src/ca2/print/ui/sheet.css')
  expect(target('tests/sr6/catalog/fixture.ts', 'sr6/catalog')).toBe('tests/sr6/catalog/fixture.ts')
  for (const [p, m] of [
    ['src/main.tsx', 'core/app'],
    ['tests/server/games.test.ts', 'core/shared'],
    ['tests/fixtures/sr6/npc-grunt.xml', 'sr6/runner-builder'],
    ['tests/ui/dom.ts', 'core/platform'],
    ['server/games.mjs', 'core/shared'],
  ])
    expect(target(p, m)).toBe(p)
  // re-runnable: a moved file is already at its target
  expect(target('src/sr6/runner-builder/ui/tabs/Ledger.tsx', 'sr6/runner-builder')).toBe('src/sr6/runner-builder/ui/tabs/Ledger.tsx')
})

test('same-named tests of one module keep their old folder, and a rerun leaves them', () => {
  const rows = [
    ['tests/old/price.test.ts', 'ca2/x'],
    ['tests/older/price.test.ts', 'ca2/x'],
    ['tests/ui/a.test.ts', 'ca2/x'],
  ]
  const c = clashes(rows)
  expect(target('tests/older/price.test.ts', 'ca2/x', '', c.has('tests/older/price.test.ts'))).toBe('tests/ca2/x/older/price.test.ts')
  expect(target('tests/ui/a.test.ts', 'ca2/x', '', c.has('tests/ui/a.test.ts'))).toBe('tests/ca2/x/a.test.ts')
  expect(target('tests/ca2/x/older/price.test.ts', 'ca2/x', '', true)).toBe('tests/ca2/x/older/price.test.ts')
})

test('specifiers follow the moved file and the moved importer', () => {
  const tracked = new Set(['src/ui/bits.tsx', 'src/ui/app.css', 'src/ui/x.ts', 'tests/ui/a.test.ts', 'src/sr6/engine/index.ts'])
  const moves = new Map([
    ['src/ui/bits.tsx', 'src/core/ui-kit/bits.tsx'],
    ['src/ui/app.css', 'src/core/ui-kit/app.css'],
    ['tests/ui/a.test.ts', 'tests/core/ui-kit/a.test.ts'],
  ])
  expect(respec('src/ui/x.ts', './bits', moves, tracked)).toBe('../core/ui-kit/bits')
  expect(respec('src/ui/x.ts', './app.css?raw', moves, tracked)).toBe('../core/ui-kit/app.css?raw')
  expect(respec('tests/ui/a.test.ts', '../../src/ui/x', moves, tracked)).toBe('../../../src/ui/x')
  expect(respec('tests/ui/a.test.ts', '../../src/sr6/engine', moves, tracked)).toBe('../../../src/sr6/engine')
  expect(respec('src/ui/x.ts', './nowhere', moves, tracked)).toBeUndefined()
  expect(respec('src/sr6/engine/index.ts', '../../ui/x', moves, tracked)).toBeUndefined()
})

test('--except leaves one module of the batch behind', () => {
  expect(selected('sr6/catalog', 'sr6/', 'sr6/runner-builder')).toBe(true)
  expect(selected('sr6/runner-builder', 'sr6/', 'sr6/runner-builder')).toBe(false)
  expect(selected('sr6/runner-builder', 'sr6/')).toBe(true)
  expect(selected('ca2/print', 'sr6/')).toBe(false)
})

// Weapons and armor are core files (the made-up ones here; the real ones come from the core rulebook's import);
// book-catalog checks (gear/spells/amps content) live in tests/ca2/catalog/books/catalog.test.ts.
import { readFileSync } from 'node:fs'
import { test, expect } from 'vitest'

const doc = (f: string) => new DOMParser().parseFromString(readFileSync(`tests/fixtures/mini/custom/imported/core/${f}`, 'utf8'), 'text/xml')
const entries = (f: string) => [...doc(f).documentElement.children]

test('weapons and armor catalogs are non-empty', () => {
  for (const f of ['weapons.xml', 'armor.xml']) expect(entries(f).length).toBeGreaterThan(0)
})

test('weapons: specialist is true or absent; every armor has a rating', () => {
  for (const w of entries('weapons.xml')) expect([null, 'true']).toContain(w.getAttribute('specialist'))
  for (const a of entries('armor.xml')) expect(Number(a.getAttribute('armor'))).toBeGreaterThanOrEqual(1)
})

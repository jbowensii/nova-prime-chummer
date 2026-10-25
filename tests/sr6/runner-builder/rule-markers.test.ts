// The RULE-marker engine (rule-markers.ts) reads CL6's `<modifier type="RULE" ref>` markers off the chosen qualities and
// applies the creation-cost rules — not a hardcoded quality id. Scholastic Mage (KNOWLEDGE_COST2_AT_GEN), Invalid
// Inferences (KARMA_COST_PLUS_1), and Polyglot (POLYGLOT) driven by the marker alone.
import { expect, test } from 'vitest'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import type { Sr6Entry } from '../../../src/sr6/formats/domain/types'
import { activeRules, knowledgeKarma } from '../../../src/sr6/runner-builder/domain/creation/rule-markers'
import { languageKarma, languageCap } from '../../../src/sr6/runner-builder/domain/creation/skills'
import { nuyenBudget } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { karmaBudget } from '../../../src/sr6/runner-builder/domain/creation/karma'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from '../catalog/fixture'

/** A positive quality carrying one `<modifier type="RULE" ref>` marker (as the importer writes it). */
const marked = (id: string, ref: string): Sr6Entry => ({
  id,
  kind: 'qualities',
  name: id,
  source: 'CRB',
  page: 1,
  attrs: { kind: 'positive', karma: '5' },
  parts: [{ tag: 'modifier', attrs: { kind: 'itemmod', type: 'RULE', ref }, text: '' }],
  text: '',
})

/** The fixture world with the given marked qualities added to the catalog, karmaKnowledge = 1, languageMax = 3. */
function world(...quals: Sr6Entry[]) {
  const c = fixtureCatalog()
  for (const e of quals) c.entries.qualities.set(e.id, e)
  const data = sr6Data(c),
    cr = fixtureCreation()
  for (const [key, value] of Object.entries({ karmaKnowledge: 1, languageMax: 3 })) cr.set(key, { key, value })
  return { data, cr }
}

/** A build with two Knowledge ranks and one Language rank (both bought with karma), plus the named qualities. */
function build(...ids: string[]) {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' })
  for (const id of ids) b.qualities.push({ uid: id, id, level: 1 })
  b.knowledge.push({ uid: 'k', name: 'Lore', kind: 'knowledge', points: 0, karma: 2 }, { uid: 'l', name: 'Elvish', kind: 'language', points: 0, karma: 1 })
  return b
}
const knowledgeCost = (b: ReturnType<typeof build>, data: ReturnType<typeof world>['data'], cr: ReturnType<typeof world>['cr']) =>
  karmaBudget(b, data, cr, makeProvider(b.method, data, cr)).breakdown?.find(l => l.key === 'knowledge')?.amount ?? 0

test('activeRules reads the RULE marker off a chosen quality, and ignores unmarked ones', () => {
  const { data } = world(marked('crb.scholastic_mage', 'KNOWLEDGE_COST2_AT_GEN'))
  expect([...activeRules(build('crb.scholastic_mage'), data)]).toEqual(['KNOWLEDGE_COST2_AT_GEN'])
  expect([...activeRules(build(), data)]).toEqual([])
})

test('knowledgeKarma: base 1 doubles to 2 with Scholastic Mage, +1 with Invalid Inferences, both fold', () => {
  const { data } = world(marked('crb.scholastic_mage', 'KNOWLEDGE_COST2_AT_GEN'), marked('crb.invalid_inferences', 'KARMA_COST_PLUS_1'))
  expect(knowledgeKarma(build(), data, 1)).toBe(1)
  expect(knowledgeKarma(build('crb.scholastic_mage'), data, 1)).toBe(2)
  expect(knowledgeKarma(build('crb.invalid_inferences'), data, 1)).toBe(2)
  expect(knowledgeKarma(build('crb.scholastic_mage', 'crb.invalid_inferences'), data, 1)).toBe(3)
})

test('Scholastic Mage: Knowledge ranks cost 2 Karma each at creation; languages untouched', () => {
  const { data, cr } = world(marked('crb.scholastic_mage', 'KNOWLEDGE_COST2_AT_GEN'))
  // without: 2 Knowledge ranks × 1 + 1 language rank × 1 = 3
  expect(knowledgeCost(build(), data, cr)).toBe(3)
  // with: 2 Knowledge ranks × 2 + 1 language rank × 1 (knowledge-only) = 5
  expect(knowledgeCost(build('crb.scholastic_mage'), data, cr)).toBe(5)
  // language per-rank cost is unchanged by a knowledge-cost rule
  expect(languageKarma(build('crb.scholastic_mage'), data, 1)).toBe(1)
})

test('Invalid Inferences: +1 Karma a Knowledge rank at creation; languages untouched', () => {
  const { data, cr } = world(marked('crb.invalid_inferences', 'KARMA_COST_PLUS_1'))
  // with: 2 Knowledge ranks × (1 + 1) + 1 language rank × 1 = 5
  expect(knowledgeCost(build('crb.invalid_inferences'), data, cr)).toBe(5)
})

test('Polyglot driven by the marker alone (no quality id): cheaper language rank and rank-4 cap', () => {
  const { data, cr } = world(marked('crb.linguist', 'POLYGLOT'))
  const b = build('crb.linguist')
  expect(languageKarma(b, data, 3)).toBe(2) // 1 Karma cheaper, never below 1
  expect(languageKarma(b, data, 1)).toBe(1)
  expect(languageCap(b, data, num(cr))).toBe(4) // languageMax 3 raised to 4
  expect(languageCap(build(), data, num(cr))).toBe(3) // without the marker, unchanged
})
const num = (cr: ReturnType<typeof world>['cr']) => cr.get('languageMax')?.value as number

test('Deck Builder: N Karma are N×5000¥ toward a cyberdeck only, and nothing without the quality', () => {
  const part = (id: string, cls: string, cost: string): Sr6Entry => ({
    id,
    kind: 'electronics',
    name: id,
    source: 'CRB',
    page: 1,
    attrs: { class: cls, cost },
    text: '',
  })
  const c = fixtureCatalog()
  for (const e of [part('x.deck', 'ELECTRONICS/CYBERDECK', '8000'), part('x.gizmo', 'ELECTRONICS/OTHER', '3000')]) c.entries.electronics.set(e.id, e)
  c.entries.qualities.set('hs.deck-builder', marked('hs.deck-builder', 'DECK_5000_PER_KARMA'))
  const data = sr6Data(c),
    cr = fixtureCreation()
  const run = (quality: boolean, karma: number) => {
    const b = build(...(quality ? ['hs.deck-builder'] : []))
    b.karmaToDeck = karma
    b.purchases.push(
      { uid: 'p1', kind: 'electronics', id: 'x.deck', qty: 1, accessories: [] },
      { uid: 'p2', kind: 'electronics', id: 'x.gizmo', qty: 1, accessories: [] },
    )
    const p = makeProvider(b.method, data, cr)
    return {
      gain: nuyenBudget(b, data, cr, p).breakdown?.find(l => l.key === 'fromDeckKarma')?.amount ?? 0,
      spent: karmaBudget(b, data, cr, p).breakdown?.find(l => l.key === 'toDeck')?.amount ?? 0,
      left: nuyenBudget(b, data, cr, p).left,
    }
  }
  expect(run(true, 1)).toMatchObject({ gain: 5000, spent: 1 })
  expect(run(true, 5)).toMatchObject({ gain: 8000, spent: 5 }) // capped at the deck's own price: the 3000 gizmo gets nothing
  expect(run(false, 5)).toMatchObject({ gain: 0, spent: 0 })
  // the gain is real nuyen back in the pool, not just a display line: available nuyen rises by exactly the gain
  expect(run(true, 1).left - run(true, 0).left).toBe(5000)
})

test('Deck Builder also covers a cyberhack identified by category, not just the cyberdeck class', () => {
  const hack: Sr6Entry = { id: 'x.hack', kind: 'electronics', name: 'x.hack', source: 'CRB', page: 1, attrs: { category: 'Cyberhack', cost: '2000' }, text: '' }
  const c = fixtureCatalog()
  c.entries.electronics.set(hack.id, hack)
  c.entries.qualities.set('hs.deck-builder', marked('hs.deck-builder', 'DECK_5000_PER_KARMA'))
  const data = sr6Data(c),
    cr = fixtureCreation()
  const b = build('hs.deck-builder')
  b.karmaToDeck = 1
  b.purchases.push({ uid: 'h', kind: 'electronics', id: 'x.hack', qty: 1, accessories: [] })
  const gain = nuyenBudget(b, data, cr, makeProvider(b.method, data, cr)).breakdown?.find(l => l.key === 'fromDeckKarma')?.amount ?? 0
  expect(gain).toBe(2000) // min(1×5000, the 2000¥ cyberhack)
})

// Polyglot (SWC p. 135): languages 1 Karma a rank cheaper (never below 1) and up to rank 4; knowledge skills untouched.
import { expect, test } from 'vitest'
import { apply } from '../../../src/sr6/runner-builder/domain/creation/actions'
import { karmaBudget } from '../../../src/sr6/runner-builder/domain/creation/karma'
import { makeProvider } from '../../../src/sr6/runner-builder/domain/creation/providers'
import { buildOf, GLIM, made } from '../catalog/fixture'

function run(polyglot: boolean) {
  const b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'mundane' }),
    { data, cr } = made({ rules: { languageMax: 3, karmaKnowledge: 3 } })
  if (polyglot) b.qualities.push({ uid: 'qp', id: 'swc.polyglot', level: 1 })
  b.knowledge.push({ uid: 'l', name: 'Elvish', kind: 'language', points: 0, karma: 0 }, { uid: 'k', name: 'Lore', kind: 'knowledge', points: 0, karma: 0 })
  const rank = (uid: string, delta = 1) => apply(b, { op: 'knowledgeRank', uid, pool: 'karma', delta }, data, cr)
  const cost = () => karmaBudget(b, data, cr, makeProvider(b.method, data, cr)).breakdown?.find(l => l.key === 'knowledge')?.amount ?? 0
  return { b, rank, cost }
}

test('without Polyglot: 3 Karma a language rank, capped at languageMax', () => {
  const r = run(false)
  for (let i = 0; i < 3; i++) expect(r.rank('l')).toEqual({ ok: true })
  expect(r.cost()).toBe(9)
  expect(r.rank('l')).toEqual({ ok: false, reason: 'language-max' })
})

test('with Polyglot: 2 Karma a language rank, rank 4 reachable; knowledge ranks stay 3', () => {
  const r = run(true)
  for (let i = 0; i < 4; i++) expect(r.rank('l')).toEqual({ ok: true })
  expect(r.rank('l')).toEqual({ ok: false, reason: 'language-max' })
  expect(r.cost()).toBe(8)
  expect(r.rank('k')).toEqual({ ok: true })
  expect(r.cost()).toBe(11)
})

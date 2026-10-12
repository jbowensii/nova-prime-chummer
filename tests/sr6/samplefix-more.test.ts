// A book sample's corrected lines (src/sr6/engine/samplefix.ts): each field a fix can set, a line already corrected is left
// alone, accessories are reached by their host's path, and a level of a family moves with a rating fix. Invented runners.
import { expect, test } from 'vitest'
import { withSampleFixes } from '../../src/sr6/engine/samplefix'
import { blankSr6, type Sr6Purchase } from '../../src/sr6/model/character'
import type { Sr6SampleFix } from '../../src/sr6/model/types'
import { fixtureCatalog } from './fixture'

const c = fixtureCatalog()
const line = (uid: string, id: string, more: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid, kind: id.startsWith('crb.zap-gun') ? 'weapons' : id.startsWith('crb.glow-eyes') ? 'augmentations' : 'gear', id, qty: 1, accessories: [], ...more })
const fix = (corrects: Sr6SampleFix['corrects']): Sr6SampleFix => ({ id: 'ex.runner', source: 'CRB', page: 85, name: '', text: '', corrects })
const withFix = (f: Sr6SampleFix) => ({ ...c, sampleFixes: new Map([['ex.runner', f]]) })
const runner = (purchases: Sr6Purchase[], key = 'CRB|ex.runner') => { const ch = blankSr6('priority', 'r', '2026-10-01T00:00:00Z'); ch.sampleKey = key; ch.build.purchases = purchases; return ch }

test('no fix for the runner’s sample, or a runner not from a sample, is the runner itself', () => {
  const ch = runner([line('a', 'crb.zap-gun')])
  expect(withSampleFixes(c, ch)).toEqual({ ch, corrections: [] })
  const other = runner([line('a', 'crb.zap-gun')], 'CRB|other')
  expect(withSampleFixes(withFix(fix([{ item: 'crb.zap-gun', field: 'qty', from: '1', to: '2' }])), other).corrections).toEqual([])
  const none = runner([]); delete none.sampleKey
  expect(withSampleFixes(withFix(fix([])), none).corrections).toEqual([])
})

test('a quantity and a grade are set on the line that holds the printed value; a line at another value is left; the runner passed is never changed', () => {
  const ch = runner([line('a', 'crb.zap-gun', { qty: 2 }), line('b', 'crb.zap-gun', { qty: 7, grade: 'alpha' }), line('c', 'crb.zap-pellets')])
  const f = withFix(fix([
    { item: 'crb.zap-gun', field: 'qty', from: '2', to: '3', note: 'misprint' },
    { item: 'crb.zap-gun', field: 'grade', from: 'alpha', to: '' },
    { item: 'crb.zap-pellets', field: 'qty', from: '1', to: '5' },
  ]))
  const r = withSampleFixes(f, ch)
  expect(r.ch.build.purchases.map(p => [p.uid, p.qty, p.grade])).toEqual([['a', 3, undefined], ['b', 7, undefined], ['c', 5, undefined]])
  expect(r.corrections).toEqual([
    { path: 'a', item: 'crb.zap-gun', field: 'qty', from: '2', to: '3', source: 'CRB', page: 85, note: 'misprint' },
    { path: 'b', item: 'crb.zap-gun', field: 'grade', from: 'alpha', to: '', source: 'CRB', page: 85 },
    { path: 'c', item: 'crb.zap-pellets', field: 'qty', from: '1', to: '5', source: 'CRB', page: 85 }])
  expect(ch.build.purchases[0].qty).toBe(2)
  expect(r.ch.corrections).toEqual(r.corrections)
})

test('a fix reaches an accessory by its host’s path; one whose printed value the line no longer holds changes nothing', () => {
  const ch = runner([line('host', 'crb.zap-gun', { accessories: [line('acc', 'crb.zap-scope', { qty: 2 })] })])
  const hit = withSampleFixes(withFix(fix([{ item: 'crb.zap-scope', field: 'qty', from: '2', to: '1' }])), ch)
  expect(hit.corrections.map(k => k.path)).toEqual(['host'])
  expect(hit.ch.build.purchases[0].accessories[0].qty).toBe(1)
  const miss = withSampleFixes(withFix(fix([{ item: 'crb.zap-scope', field: 'qty', from: '9', to: '1' }])), ch)
  expect(miss.ch).toBe(ch)
  expect(miss.corrections).toEqual([])
})

test('a rating fix on a line holding a level of a family moves it to that level; a level the family lacks leaves it', () => {
  const ch = runner([line('eyes', 'crb.glow-eyes.2')])
  const move = withSampleFixes(withFix(fix([{ item: 'crb.glow-eyes', field: 'rating', from: '2', to: '3' }])), ch)
  expect(move.ch.build.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.3', name: 'Glow Eyes 3' })
  expect(move.corrections).toHaveLength(1)
  const lack = withSampleFixes(withFix(fix([{ item: 'crb.glow-eyes', field: 'rating', from: '2', to: '9' }])), ch)
  expect(lack.corrections).toEqual([])
  expect(lack.ch.build.purchases[0].id).toBe('crb.glow-eyes.2')
})

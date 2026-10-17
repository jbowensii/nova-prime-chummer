// A link marked `copied` (the importer put the linked entry's effects on the entry, each `from` its id) is not followed again,
// unless the user has corrected the linked entry (the edits layer, Sr6Entry.edited): then its stored copies are stale and the
// corrected entry is followed live, in the engine and in the export (owner decision 2026-10-17). Invented values.
import { expect, test } from 'vitest'
import { effectBonuses, linkedEntries, liveMaxEffects, ownParts, staleCopies } from '../../src/sr6/engine/effects'
import { exportSr6Books } from '../../src/sr6/engine/export'
import { sr6Data } from '../../src/sr6/engine/data'
import type { Sr6Part } from '../../src/sr6/model/types'
import { fixtureCatalog } from './fixture'

const fx = (target: string, value: string, more: Record<string, string> = {}): Sr6Part => ({
  tag: 'effect',
  attrs: { target, op: 'add', value, ...more },
  text: '',
})
const link = (attrs: Record<string, string>): Sr6Part => ({ tag: 'link', attrs, text: '' })
const OPTS = { descriptions: false, now: '2026-10-17T09:00:00.000Z', appVersion: 't' }

/** An entry holding a copy of its linked entry's attribute effect, the link marked copied. */
function world(edited: boolean) {
  const c = fixtureCatalog()
  const a = c.entries.qualities.get('crb.knack')!,
    b = c.entries.qualities.get('crb.stoneskin')!
  b.parts = [fx('attr:str', edited ? '3' : '1')]
  if (edited) b.edited = true
  a.parts = [fx('skill:athletics', '2'), fx('attr:str', '1', { from: b.id }), link({ rel: 'as', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' })]
  return { c, a, b, data: sr6Data(c) }
}

test('a copied link to an uncorrected entry stays its stored copies: counted once', () => {
  const { a, data } = world(false)
  expect(linkedEntries(data, a)).toEqual([])
  expect(staleCopies(data, a).size).toBe(0)
  expect(effectBonuses(data, a).filter(b => b.target === 'str')).toEqual([{ target: 'str', value: 1 }])
})

test('a copied link to a corrected entry is followed live: its stored copies are gone, nothing is counted twice', () => {
  const { a, b, data } = world(true)
  expect(linkedEntries(data, a).map(l => l.entry.id)).toEqual([b.id])
  expect([...staleCopies(data, a)]).toEqual([b.id])
  expect(ownParts(data, a).map(p => p.attrs.target)).toEqual(['skill:athletics', undefined]) // (the copy is out; the entry's own and the link stay)
  const str = effectBonuses(data, a).filter(x => x.target === 'str')
  expect(str).toEqual([{ target: 'str', value: 3 }]) // (the correction's value, once)
})

test('the export gives the corrected entry’s live effects as copies from it, keeps the link copied, and drops the stale ones', () => {
  for (const edited of [false, true]) {
    const { c, a, data } = world(edited)
    const file = exportSr6Books(c, data, [a.source], OPTS)
    const got = file.books![0].entries.find(e => e.id === a.id)!
    const strs = got.effects!.filter(f => f.target === 'attr:str')
    expect(strs).toEqual([{ target: 'attr:str', op: 'add', value: edited ? '3' : '1', from: 'crb.stoneskin' }])
    expect(got.effects!.some(f => f.target === 'skill:athletics')).toBe(true)
    expect(got.links![0]).toMatchObject({ rel: 'as', copied: true })
  }
})

// ---- the review's follow-ups (2026-10-17): own effects win live too, levelless grants at level 1, a granted level of a family,
// an edited entry holding copies, a link naming another kind. Invented values.
const strs = (data: ReturnType<typeof sr6Data>, e: Parameters<typeof effectBonuses>[1]) => effectBonuses(data, e).filter(b => b.target === 'str')

test('a copied link followed live gives less the effects the entry holds of its own for the same target (the book’s word for the entry wins)', () => {
  const { a, b, data } = world(true)
  a.parts = [fx('attr:str', '1'), link({ rel: 'as', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' })]
  b.parts = [fx('attr:str', '3'), fx('attr:agi', '2')]
  expect(strs(data, a)).toEqual([{ target: 'str', value: 1 }]) // (its own, not 1 + 3)
  expect(effectBonuses(data, a)).toHaveLength(2) // (and the link’s other effect is followed)
})

test('a levelless grant is read at level 1 live, as the importer stores it; a named level at that level', () => {
  const { a, b, data } = world(true)
  b.parts = [fx('attr:str', 'R')]
  a.parts = [link({ rel: 'grants', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' })]
  expect(strs(data, a).map(x => x.value)).toEqual([1])
  a.parts = [link({ rel: 'grants', name: b.name, kind: 'qualities', ref: b.id, level: '3', copied: 'yes' })]
  expect(strs(data, a).map(x => x.value)).toEqual([3])
  a.parts = [link({ rel: 'as', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' })]
  expect(strs(data, a).map(x => x.value)).toEqual([1]) // (an `as` link keeps the linked entry’s own rating handling)
})

function levelled(editLevel?: number) {
  const c = fixtureCatalog((f, x) =>
    f.endsWith('crb/qualities.xml')
      ? x.replace('<name>Lucky Streak</name><text/>', '<name>Lucky Streak</name><effect target="attr:str" op="add" value="R"/><text/>')
      : x,
  )
  const lvl = (n: number) => c.entries.qualities.get(`crb.lucky-streak.${n}`)!
  if (editLevel) {
    lvl(editLevel).edited = true
    lvl(editLevel).parts = [fx('attr:str', '7')]
  }
  const a = c.entries.qualities.get('crb.knack')!
  // (the importer’s copy is `from` the id it resolved the link to: the family’s)
  a.parts = [
    fx('attr:str', '2', { from: 'crb.lucky-streak' }),
    link({ rel: 'grants', name: 'Lucky Streak', kind: 'qualities', ref: 'crb.lucky-streak', level: '2', copied: 'yes' }),
  ]
  return { a, data: sr6Data(c) }
}

test('a granted level of a family: untouched it stays the stored copy; the level the user corrected replaces it, once', () => {
  const plain = levelled()
  expect(strs(plain.data, plain.a).map(x => x.value)).toEqual([2])
  const fixed = levelled(2)
  expect(staleCopies(fixed.data, fixed.a).has('crb.lucky-streak')).toBe(true)
  expect(strs(fixed.data, fixed.a).map(x => x.value)).toEqual([7])
  const other = levelled(3) // (a level this grant does not use: nothing changes)
  expect(strs(other.data, other.a).map(x => x.value)).toEqual([2])
})

test('an entry the user corrected that holds copies: they are not counted again beside the live link', () => {
  const { a, b, data } = world(false)
  a.edited = true
  expect(strs(data, a)).toEqual([{ target: 'str', value: 1 }])
  expect(b.edited).toBeUndefined()
})

test('a link naming no kind finds the entry of its own kind first, else any kind', () => {
  const c = fixtureCatalog()
  const a = c.entries.qualities.get('crb.knack')!,
    q = c.entries.qualities.get('crb.stoneskin')!,
    p = [...c.entries.adeptpowers.values()][0]
  q.name = 'Zap Twin'
  c.entries.adeptpowers.set(p.id, { ...p, name: 'Zap Twin' })
  const data = sr6Data(c)
  a.parts = [link({ rel: 'as', name: 'Zap Twin' })]
  expect(linkedEntries(data, a).map(l => l.entry.kind)).toEqual(['qualities'])
  a.parts = [link({ rel: 'as', name: 'Zap Twin' })]
  c.entries.qualities.set(q.id, { ...q, name: 'Other' })
  expect(linkedEntries(sr6Data(c), a).map(l => l.entry.kind)).toEqual(['adeptpowers'])
})

test('an attribute maximum: the stale copy of a corrected entry’s is dropped and the correction followed, counted once', () => {
  const { a, b, data } = world(true)
  b.parts = [fx('attr-max:str', '2')]
  a.parts = [fx('attr-max:str', '1', { from: b.id }), link({ rel: 'as', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' })]
  expect(liveMaxEffects(data, a).str).toEqual({ add: 2 })
})

// ---- review 3 (2026-10-17): two links to one effect, a correction two levels down, the export reading as the app does.
const COND = { when: 'in a crowd', switch: 'conditional' }

/** `a` (edited) holds one copy of an effect two copied links both give; `b` and `c` are the linked entries. */
function twoLinks() {
  const c = fixtureCatalog()
  const a = c.entries.qualities.get('crb.knack')!,
    b = c.entries.qualities.get('crb.stoneskin')!,
    d = c.entries.qualities.get('crb.butterfingers')!
  b.parts = [fx('attr:str', '1', COND)]
  d.parts = [fx('attr:str', '1', COND)]
  a.edited = true
  a.parts = [
    fx('attr:str', '1', { ...COND, from: b.id }),
    link({ rel: 'as', name: b.name, kind: 'qualities', ref: b.id, copied: 'yes' }),
    link({ rel: 'as', name: d.name, kind: 'qualities', ref: d.id, copied: 'yes' }),
  ]
  return { c, a, data: sr6Data(c) }
}

test('an edited entry following two copied links that give one effect counts it once, in the app and in the export', () => {
  const { c, a, data } = twoLinks()
  expect(effectBonuses(data, a).filter(x => x.target === 'str')).toHaveLength(1)
  const got = exportSr6Books(c, data, [a.source], OPTS).books![0].entries.find(e => e.id === a.id)!
  expect(got.effects!.filter(f => f.target === 'attr:str')).toHaveLength(1)
})

/** top -> mid -> bottom, all copied; only `bottom` corrected. */
function chain() {
  const c = fixtureCatalog()
  const top = c.entries.qualities.get('crb.knack')!,
    mid = c.entries.qualities.get('crb.stoneskin')!,
    bottom = c.entries.qualities.get('crb.butterfingers')!
  bottom.parts = [fx('attr:str', '4')]
  bottom.edited = true
  mid.parts = [fx('attr:str', '1', { from: bottom.id }), link({ rel: 'as', name: bottom.name, kind: 'qualities', ref: bottom.id, copied: 'yes' })]
  top.parts = [fx('attr:str', '1', { from: mid.id }), link({ rel: 'as', name: mid.name, kind: 'qualities', ref: mid.id, copied: 'yes' })]
  return { c, top, data: sr6Data(c) }
}

test('a correction two links down reaches the top entry (the importer copies two levels deep, each copy from the first level)', () => {
  const { c, top, data } = chain()
  expect(effectBonuses(data, top).filter(x => x.target === 'str')).toEqual([{ target: 'str', value: 4 }])
  const got = exportSr6Books(c, data, [top.source], OPTS).books![0].entries.find(e => e.id === top.id)!
  expect(got.effects!.filter(f => f.target === 'attr:str')).toEqual([{ target: 'attr:str', op: 'add', value: '4', from: 'crb.stoneskin' }])
})

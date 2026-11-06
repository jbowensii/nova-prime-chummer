// The SR6 runner editor (src/sr6/shell/ui/EditorView.tsx) on the made-up fixture catalog, saved to a stand-in server store:
// the creation method's priorities, attributes and skills against the budgets panel, qualities, magic and gear from the
// pickers, contacts, Review's problems, GM approval and Finalize, then the career ledger. Made-up runner and data throughout.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type Sr6Character } from '../../../src/sr6/formats/domain/character'
import { Me, type User } from '../../../src/core/ui-kit/auth'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { fixtureCatalog, made } from '../catalog/fixture'
import { button, change, click, fakeStore, field, hasButton, mount, option, pageText, stubFetch } from '../../ui/dom'

const c = fixtureCatalog()
const { data, cr } = made()
const META = Object.keys(data.metatypes)[0]

function runner(fn: (ch: Sr6Character) => void = () => {}) {
  const ch = blankSr6('priority', 'made-up-1', '2026-10-01T00:00:00.000Z')
  ch.identity.streetName = 'Made-up Glint'
  fn(ch)
  return ch
}
/** A priority runner with its letters and metatype chosen. */
const built = (magic: Sr6Character['build']['magic'] = 'mundane') =>
  runner(ch => {
    Object.assign(ch.build.priorities, {
      metatype: 'D',
      attributes: 'A',
      magic: magic === 'mundane' ? 'E' : 'C',
      skills: 'B',
      resources: magic === 'mundane' ? 'C' : 'E',
    })
    ch.build.metatype = META
    ch.build.magic = magic
  })
async function open(ch: Sr6Character, tab: string) {
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  const view = (t: string) => createElement(Sr6EditorView, { c, data, cr, id: ch.id, tab: t })
  const m = await mount(view(tab))
  const saved = async () => {
    await click(button('Save'))
    const r = xmlToSr6(store.rows.get(ch.id)!.xml)
    if (!r.ok) throw new Error(r.reason)
    return r.character
  }
  return { ...m, store, saved, tab: (t: string) => m.rerender(view(t)) }
}
const dialog = () => document.querySelector('dialog[open]')!
const output = (label: string) => (document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null)?.value

test('a runner the server doesn’t have says so', async () => {
  stubFetch([fakeStore('sr6/characters').route])
  await mount(createElement(Sr6EditorView, { c, data, cr, id: 'nope', tab: 'concept' }))
  expect(pageText()).toMatch(/Runner not found/)
})

test('Creation method: the priorities, metatype and magic are saved', async () => {
  const e = await open(runner(), 'method')
  await change(field('Metatype priority'), 'D')
  await change(field('Attributes priority'), 'A')
  await change(field('Magic or Resonance priority'), 'E')
  await change(field('Skills priority'), 'B')
  await change(field('Resources priority'), 'C')
  await change(field('Metatype'), META)
  const got = await e.saved()
  expect(got.build.priorities).toMatchObject({ metatype: 'D', attributes: 'A', skills: 'B' })
  expect(got.build.metatype).toBe(META)
})

test('Concept: the street name heads the editor', async () => {
  const e = await open(runner(), 'concept')
  await change(field('Street name'), 'Made-up Flicker')
  expect(document.querySelector('.who .name')?.textContent).toBe('Made-up Flicker')
  expect((await e.saved()).identity.streetName).toBe('Made-up Flicker')
})

test('Attributes and skills spend their points; Undo gives one back', async () => {
  const e = await open(built(), 'attributes')
  await click(button('Raise Body points'))
  expect(output('Body points')).toBe('1')
  await click(button('Undo'))
  expect(output('Body points')).toBe('0')
  await click(button('Raise Body points'))
  await e.tab('skills')
  const raise = [...document.querySelectorAll('button')].find(
    b => / points$/.test(b.getAttribute('aria-label') ?? '') && /^Raise /.test(b.getAttribute('aria-label') ?? ''),
  )!
  const skill = raise
    .getAttribute('aria-label')!
    .replace(/^Raise /, '')
    .replace(/ points$/, '')
  await click(raise)
  await click(raise)
  expect(output(`${skill} points`)).toBe('2')
  await change(field('New knowledge skill or language'), 'Made-up street lore')
  await click(button('Add', document.querySelector('.stack') ?? document.body))
  const got = await e.saved()
  expect(got.build.attributes.bod.points).toBe(1)
  expect(got.build.skills.find(s => s.points === 2)).toBeTruthy()
})

test('Qualities and gear come from the pickers; contacts are added and removed', async () => {
  const e = await open(built(), 'qualities')
  await click(button('Add a positive quality…'))
  const q = dialog().querySelector<HTMLElement>('[role=option]:not([aria-disabled="true"])')!
  const qname = q.querySelector('b, strong, .name')?.textContent ?? q.textContent!
  await click(q)
  if (dialog()) await click(button('Add', dialog()))
  expect(pageText()).toContain(qname.split(' ')[0])

  await e.tab('gear')
  await click(button('Add a weapon…'))
  await click(option('Zap Gun'))
  if (dialog() && hasButton('Add', dialog())) await click(button('Add', dialog()))
  expect(pageText()).toMatch(/Zap Gun/)
  await click(button('Custom item…'))
  await change(field('Name', dialog()), 'Made-up gizmo')
  await click(button(/^Add/, dialog()))
  expect(pageText()).toMatch(/Made-up gizmo/)

  // a negative price is refused in the dialog (it stays open, saying why), not kept for Review to block later
  await click(button('Custom item…'))
  await change(field('Name', dialog()), 'Made-up debt')
  await change(field('Cost', dialog()), '-500')
  await click(button(/^Add/, dialog()))
  expect(dialog().querySelector('[role=alert]')?.textContent).toBe('Can’t go below zero.')
  await click(button('Cancel', dialog()))

  await e.tab('contacts')
  await click(button('Add a contact'))
  await click(button('Add a contact'))
  const removes = [...document.querySelectorAll('button')].filter(b => /^Remove /.test(b.getAttribute('aria-label') ?? '') && b.closest('table'))
  await click(removes[removes.length - 1])
  const got = await e.saved()
  expect(got.build.contacts).toHaveLength(1)
  expect(got.build.purchases.map(p => p.name ?? p.id)).toEqual(['Zap Gun', 'Made-up gizmo'])
  expect(got.build.qualities.length).toBeGreaterThan(0)
})

test('Magic: an awakened runner learns a spell from the picker', async () => {
  const e = await open(built('full'), 'magic')
  expect(document.querySelector('nav.tabs')?.textContent).toMatch(/Magic/)
  const add = [...document.querySelectorAll('button')].find(b => /^Add a spell/.test(b.textContent ?? ''))!
  await click(add)
  await click(option('Glow Ward'))
  if (dialog() && hasButton('Add', dialog())) await click(button('Add', dialog()))
  expect(pageText()).toMatch(/Glow Ward/)
  expect((await e.saved()).build.picks.map(p => p.kind)).toContain('spells')
})

test('Review: the GM approves every problem, Finalize opens the ledger; earnings and a note are recorded', async () => {
  const e = await open(built(), 'review')
  expect(pageText()).toMatch(/Problem/)
  expect(button('Finalize runner').disabled).toBe(true)
  for (let b; (b = [...document.querySelectorAll<HTMLInputElement>('.viol input[type=checkbox]')].find(x => !x.checked && !x.disabled));) {
    await change(field('GM note (optional)', b.closest('.viol')!), 'Made-up table ruling')
    await click(b)
  }
  expect(pageText()).toMatch(/GM: Made-up table ruling/)
  await click(button('Finalize runner'))
  await click(button('Finalize', dialog()))
  await e.tab('ledger')
  expect(pageText()).toMatch(/Record earnings/)
  await change(field('Karma'), '5')
  await change(field('Run'), 'Made-up milk run')
  await click(button('Record earnings'))
  expect(pageText()).toMatch(/Made-up milk run/)
  await change(field('Note'), 'Met a made-up fixer')
  await click(button('Add note'))
  expect(pageText()).toMatch(/Met a made-up fixer/)

  // a karma spend: priced first, confirmed, then voided as the newest spend
  await change(field('What'), 'attribute')
  await change(field('Attribute'), 'bod')
  expect(document.querySelector('[aria-label="Price"]')?.textContent).toMatch(/karma/i)
  await click(button('Record'))
  await click(button('Record it'))
  const spent = await e.saved()
  expect(spent.ledger.some(x => x.type === 'advance' && x.advance.op === 'attribute')).toBe(true)
  await click(button(/^Void BOD 1 → 2$/))
  await change(field('Why'), 'Made-up mistake')
  await click(button('Void', dialog()))
  expect(pageText()).toMatch(/Made-up mistake/)
  expect((await e.saved()).ledger.find(x => x.type === 'void')).toBeTruthy()

  const got = await e.saved()
  expect(got.finalizedAt).toBeTruthy()
  expect(got.ledger.length).toBeGreaterThanOrEqual(4)
})

test('the editor carries the Ask the rules bar, and it asks the SR6 AI', async () => {
  const ch = built()
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  const calls = stubFetch([[/\/api\/(sr6\/)?ask$/, () => ({ available: true, limit: 3, used: 1 })], store.route])
  const me = { id: 'u1', username: 'pia', role: 'player' } as User
  await mount(createElement(Me.Provider, { value: me }, createElement(Sr6EditorView, { c, data, cr, id: ch.id, tab: 'build' })))
  const asks = calls.map(x => x.url).filter(u => /\/ask$/.test(u))
  expect(asks.length).toBeGreaterThan(0)
  expect(asks.every(u => u.endsWith('api/sr6/ask'))).toBe(true)
  expect(document.querySelector('form[aria-label="Ask the rules"]')).not.toBeNull()
})

// A catalog entry's card on hover, focus or tap (src/ui/EntryHover.tsx, both games) and an SR6 entry's effects as the card
// shows them (src/sr6/ui/EntryRef.tsx effectsOf). Made-up entries.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { EntryHover } from '../../src/ui/EntryHover'
import type { BrowseRow } from '../../src/ui/CatalogBrowser'
import { effectsOf } from '../../src/sr6/ui/EntryRef'
import type { Sr6Entry } from '../../src/sr6/model/types'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = '' })

const ROW: BrowseRow = { key: 'zap-gloves', name: 'Zap Gloves', source: 'NB', page: 12, details: 'cost 300 · avail 4', text: 'Made-up gloves that zap.',
  effects: [{ text: '+1 Agility', state: 'applied' }, { text: 'wireless: +2 Zapping dice', state: 'conditional' }] }

function mount(props: Record<string, unknown> = {}) {
  const el = document.body.appendChild(document.createElement('div'))
  root = createRoot(el)
  act(() => root!.render(createElement(EntryHover, { row: ROW, kind: 'Gear', ...props }, createElement('b', null, 'Zap Gloves'))))
  return { el, ref: el.querySelector<HTMLElement>('.entry-ref')!, card: () => document.querySelector('[role="tooltip"]') }
}
const fire = (t: HTMLElement, type: string, more: Record<string, unknown> = {}) =>
  act(() => { const e = new Event(type, { bubbles: true, cancelable: true }); Object.assign(e, more); t.dispatchEvent(e) })
// React's mouseenter is synthesized from mouseover/mouseout pairs
const enter = (t: HTMLElement) => act(() => { t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })) })
const leave = (t: HTMLElement) => act(() => { t.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })) })

test('hover shows the card (values, effects with their state, source, description) and leaving hides it', () => {
  const { ref, card } = mount()
  expect(card()).toBeNull()
  enter(ref)
  const c = card()!
  expect(c.textContent).toContain('Zap Gloves')
  expect(c.textContent).toContain('NB p.12')
  expect(c.textContent).toContain('cost 300 · avail 4')
  expect(c.textContent).toContain('+1 Agility (applied)')
  expect(c.textContent).toContain('☐ wireless: +2 Zapping dice (switchable or conditional: in brackets, tick when it applies)')  // (a tick box: owner decision 17)
  expect(c.textContent).toContain('Made-up gloves that zap.')
  expect(ref.getAttribute('aria-describedby')).toBe(c.id)
  leave(ref)
  expect(card()).toBeNull()
})

test('a tab stop: focus shows it, Escape closes it', () => {
  const { ref, card } = mount()
  expect(ref.tabIndex).toBe(0)
  act(() => ref.focus())
  expect(card()).not.toBeNull()
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
  expect(card()).toBeNull()
})

test('a tap toggles it; a tap elsewhere closes it', () => {
  const { ref, card } = mount()
  fire(ref, 'pointerdown', { pointerType: 'touch' })
  fire(ref, 'click')
  expect(card()).not.toBeNull()
  fire(ref, 'pointerdown', { pointerType: 'touch' })
  fire(ref, 'click')
  expect(card()).toBeNull()
  fire(ref, 'pointerdown', { pointerType: 'touch' })
  fire(ref, 'click')
  fire(document.body, 'pointerdown', { pointerType: 'touch' })
  expect(card()).toBeNull()
})

test('forced open and not a tab stop (a picker item: its row has focus); no row: just the children', () => {
  const { ref, card } = mount({ open: true, tabbable: false })
  expect(ref.hasAttribute('tabindex')).toBe(false)
  expect(card()).not.toBeNull()
  act(() => root!.unmount()); root = null; document.body.innerHTML = ''
  const bare = mount({ row: undefined })
  expect(bare.ref).toBeNull()
  expect(bare.el.textContent).toBe('Zap Gloves')
})

test('an SR6 entry’s effects: applied, switchable (conditional), on the target, low confidence', () => {
  const e = { parts: [
    { tag: 'effect', attrs: { target: 'attr:agi', op: 'add', value: '1' }, text: '' },
    { tag: 'effect', attrs: { target: 'skill:close-combat', op: 'add', value: 'R', switch: 'wireless' }, text: '' },
    { tag: 'effect', attrs: { target: 'attr:rea', op: 'add', value: '1', switch: 'sustained', affects: 'target' }, text: '' },
    { tag: 'effect', attrs: { target: 'derived:defense', op: 'add', value: '2', confidence: 'low', switch: 'conditional' }, text: '' },
    { tag: 'effect', attrs: { target: 'skill:stealth', op: 'edge-cost', value: '-1' }, text: '' },
    { tag: 'spec', attrs: {}, text: 'Zapping' },
  ] } as unknown as Sr6Entry
  expect(effectsOf(e)).toEqual([
    { text: '+1 Agility', state: 'applied' },
    { text: 'wireless: +rating Close Combat dice', state: 'conditional' },
    { text: 'on the target: sustained: +1 Reaction', state: 'target' },
    { text: '+2 Defense Rating', state: 'low' },
    { text: 'Edge boosts and actions cost 1 less on Stealth tests', state: 'applied' },
  ])
})

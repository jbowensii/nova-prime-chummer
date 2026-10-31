// The shared picker: every typed word must match (any order, any case, mid-word, name or category/book text); results A-Z;
// a long list says it was cut instead of silently hiding the rest. (Before: one whole-string substring, so "plastic explosive"
// found nothing for "Explosive Package: Plastic Explosives"; and 300 entries were shown with no hint.)
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { Picker, type PickItem } from '../../../src/core/ui-kit/bits'
import { mount } from '../../ui/dom'

const it = (name: string, search = ''): PickItem => ({ id: name, name, search })
const names = (el: Element) => [...el.querySelectorAll('li b')].map(b => b.textContent)

test('multi-word, any order, any case, mid-word, A-Z', async () => {
  const items = [it('Conventional Explosives', 'Explosive Package'), it('Plastic Explosives', 'Explosive Package | CRB p.264'), it('Zap Gun', 'Firearm')]
  const { el } = await mount(createElement(Picker, { items, onPick: () => {} }))
  expect(names(el)).toEqual(['Conventional Explosives', 'Plastic Explosives', 'Zap Gun'])
  const box = el.querySelector('input')!
  const type = async (v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(box, v)
    box.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  }
  await type('PACKAGE plast')
  expect(names(el)).toEqual(['Plastic Explosives'])
  await type('losive')
  expect(names(el)).toEqual(['Conventional Explosives', 'Plastic Explosives'])
})

test('a word in the book name does not drown the items named for it', async () => {
  const items = [
    it('CCL-100', 'Shadowrun: Explosive Decompression'),
    it('Caltrops', 'Explosive and scatter weapon'),
    it('Plastic Explosives', 'Explosive Package'),
  ]
  const { el } = await mount(
    createElement(Picker, { items: items.map(i => ({ ...i, meta: i.name === 'Caltrops' ? 'Explosive and scatter weapon' : undefined })), onPick: () => {} }),
  )
  const box = el.querySelector('input')!
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(box, 'explosive')
  box.dispatchEvent(new Event('input', { bubbles: true }))
  await Promise.resolve()
  expect(names(el)).toEqual(['Caltrops', 'Plastic Explosives'])
})

test('a list over 300 says it was cut', async () => {
  const items = Array.from({ length: 305 }, (_, i) => it(`Item ${String(i).padStart(3, '0')}`))
  const { el } = await mount(createElement(Picker, { items, onPick: () => {} }))
  expect(names(el)).toHaveLength(300)
  expect(el.textContent).toContain('Showing the first 300 of 305')
})

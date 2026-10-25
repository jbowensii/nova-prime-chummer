// The shared Stepper (src/core/ui-kit/bits.tsx): the value is typed in, clamped to [min,max]; the arrows still work.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, test } from 'vitest'
import { Stepper } from '../../../src/core/ui-kit/bits'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function mount(value: number) {
  const seen: number[] = []
  const host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  act(() => root!.render(createElement(Stepper, { value, min: 1, max: 99, label: 'Ammo quantity', onChange: v => seen.push(v) })))
  return { seen, input: host.querySelector('input') as HTMLInputElement, host }
}
function type(input: HTMLInputElement, text: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    set.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('typed values call onChange, clamped to min and max', () => {
  const { seen, input } = mount(5)
  expect(input.getAttribute('aria-label')).toBe('Ammo quantity')
  type(input, '40')
  type(input, '500')
  type(input, '0')
  expect(seen).toEqual([40, 99, 1])
})

test('the arrows still step', () => {
  const { seen, host } = mount(5)
  act(() => (host.querySelector('[aria-label="Raise Ammo quantity"]') as HTMLButtonElement).click())
  expect(seen).toEqual([6])
})

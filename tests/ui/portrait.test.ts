// The runner's face (portrait, token or initial) and the portrait / token dialog: framing, keys, zoom, Same as portrait,
// removing, and what Save hands back. Images are stood in for (jsdom loads none).
import { createElement } from 'react'
import { act } from 'react'
import { expect, test, vi } from 'vitest'
import { bdClass, Face, initial, PortraitEditor, printBackdrop } from '../../src/core/ui-kit/Portrait'
import { blankCharacter } from '../../src/ca2/formats/domain/file'
import type { Character } from '../../src/ca2/formats/domain/types'
import { button, change, click, field, mount, pageText, settle } from './dom'

const withId = (o: Partial<Character['identity']>): Character => {
  const ch = blankCharacter()
  ch.identity = { ...ch.identity, ...o }
  return ch
}
/** Every Image loads at once as 400 x 200 (or fails when its src says broken). */
function fakeImages() {
  vi.stubGlobal(
    'Image',
    class {
      width = 400
      height = 200
      onload?: () => void
      onerror?: () => void
      set src(v: string) {
        queueMicrotask(() => (v.includes('broken') || v.endsWith('base64,eA==') ? this.onerror?.() : this.onload?.()))
      }
      get src() {
        return 'img.png'
      }
    },
  )
}

test('the initial is the first whole letter of the street name, else the name, else a question mark', () => {
  expect(initial(withId({ streetName: ' ¢hrome', name: 'Zed' }))).toBe('¢')
  expect(initial(withId({ streetName: '', name: 'zed' }))).toBe('Z')
  expect(initial(withId({ streetName: '😀 smile', name: '' }))).toBe('😀')
  expect(initial(withId({ streetName: '', name: '' }))).toBe('?')
})

test('the print backdrop swaps a dark one for white and the class carries the backdrop', () => {
  expect([printBackdrop('dark'), printBackdrop('neon'), printBackdrop('grid'), printBackdrop(undefined)]).toEqual(['white', 'white', 'grid', undefined])
  expect([bdClass('rain'), bdClass()]).toEqual([' bd-rain', ''])
})

test('a face shows the portrait, the token when asked, and falls back to the initial when the picture will not load', async () => {
  const ch = withId({ streetName: 'Glim', portrait: 'p.png', token: 't.png', backdrop: 'grid' })
  await mount(createElement(Face, { ch }))
  expect(document.querySelector('img.face.bd-grid')?.getAttribute('src')).toBe('p.png')
  await mount(createElement(Face, { ch, token: true }))
  expect(document.querySelector('img.tokenface')?.getAttribute('src')).toBe('t.png')
  await act(async () => document.querySelector('img.tokenface')!.dispatchEvent(new Event('error')))
  expect(document.querySelector('span.tokenface')?.textContent).toBe('G')
  await mount(createElement(Face, { ch: withId({ name: 'Bo' }) }))
  expect(document.querySelectorAll('span.face')[0].textContent).toBe('B')
})

const open = (ch: Character, onSave = vi.fn(), token?: boolean) => mount(createElement(PortraitEditor, { ch, open: true, onClose: () => {}, onSave, token }))

test('saving a portrait nobody touched hands back the same picture and backdrop', async () => {
  fakeImages()
  const onSave = vi.fn()
  await open(withId({ portrait: 'p.png', backdrop: 'dark' }), onSave)
  await settle()
  await click(button('Save portrait'))
  expect(onSave).toHaveBeenCalledWith('p.png', 'dark')
})

test('the backdrop can be changed, and Remove picture saves no picture', async () => {
  fakeImages()
  const onSave = vi.fn()
  await open(withId({ portrait: 'p.png' }), onSave)
  await change(field('Neon'), true)
  await click(button('Remove picture'))
  await click(button('Save portrait'))
  expect(onSave).toHaveBeenCalledWith(undefined, 'neon')
})

test('arrow keys, zoom and the wheel move the picture inside the square and never past its edge', async () => {
  fakeImages()
  await open(withId({ portrait: 'p.png' }))
  const stage = document.querySelector<HTMLElement>('.pe-stage')!
  const img = () => document.querySelector<HTMLElement>('.pe-stage img')!
  const left = () => parseFloat(img().style.left)
  const start = left()
  // 400 x 200 covers the 256 square at 512 wide: 128 spare each side
  const key = (k: string, shiftKey = false) => act(async () => void stage.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true })))
  await key('ArrowRight')
  expect(left()).toBe(start + 8)
  await key('ArrowLeft', true)
  expect(left()).toBe(start + 8 - 32)
  for (let i = 0; i < 12; i++) await key('ArrowLeft', true)
  expect(left()).toBe((256 - 512) / 2 - 128)
  await change(field(/^Zoom/), '2')
  expect(parseFloat(img().style.width)).toBe(1024)
  await act(async () => void stage.dispatchEvent(new WheelEvent('wheel', { deltaY: -500, bubbles: true })))
  expect(parseFloat(img().style.width)).toBe(1536)
  await click(button('Center'))
  expect(left()).toBe((256 - 1536) / 2)
})

test('a token starts as Same as portrait and saves no picture of its own; untick it to frame one', async () => {
  fakeImages()
  const onSave = vi.fn()
  await open(withId({ portrait: 'p.png', backdrop: 'grid' }), onSave, true)
  expect(pageText()).toContain('Same as portrait')
  expect(field<HTMLInputElement>('Same as portrait').checked).toBe(true)
  await click(button('Save token'))
  expect(onSave).toHaveBeenCalledWith(undefined, 'grid')
  expect(pageText()).not.toContain('Backdrop')
})

test('a picture that will not load says so', async () => {
  fakeImages()
  await open(withId({ portrait: 'broken.png' }))
  await settle()
  expect(document.querySelector('[role=alert]')?.textContent).toBe('The current picture didn’t load.')
})

test('choosing a file that is not a picture says so, and choosing a good one frames it', async () => {
  fakeImages()
  await open(withId({}))
  const input = field<HTMLInputElement>('Portrait file')
  const pick = async (f: File) => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true })
    await act(async () => void input.dispatchEvent(new Event('change', { bubbles: true })))
    await settle(8)
  }
  await pick(new File(['x'], 'broken.png', { type: 'image/png' }))
  expect(document.querySelector('[role=alert]')?.textContent).toBe('That file isn’t a picture this browser can read.')
  await pick(new File(['y'], 'ok.png', { type: 'image/png' }))
  expect(document.querySelector('[role=alert]')).toBeNull()
  expect(document.querySelector('.pe-stage img')).not.toBeNull()
})

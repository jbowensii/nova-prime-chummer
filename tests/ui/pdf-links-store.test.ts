// Linked rulebook handles kept in the browser's IndexedDB (a small in-memory stand-in here): remembered after the first pick,
// listed, unlinked, asked for read permission again, and never fetched from a server.
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { isLinked, linkedBooks, openPdfAtPage, setOffset, getOffset, unlink } from '../../src/core/ui-kit/pdfLinks'

/** Just enough IndexedDB: one store of key -> value, requests that answer on the next tick. */
function fakeIdb(fail = false) {
  const data = new Map<string, unknown>()
  const req = <T>(f: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {}
    setTimeout(() => {
      if (fail) return r.onerror?.()
      r.result = f()
      r.onsuccess?.()
    })
    return r
  }
  const store = {
    get: (k: string) => req(() => data.get(k)),
    put: (v: unknown, k: string) => req(() => void data.set(k, v)),
    delete: (k: string) => req(() => void data.delete(k)),
    openCursor: () => {
      const keys = [...data.keys()]
      let i = -1
      const r: { result?: unknown; onsuccess?: () => void } = {}
      const step = () => setTimeout(() => ((r.result = ++i < keys.length ? { key: keys[i], value: data.get(keys[i]), continue: step } : null), r.onsuccess?.()))
      step()
      return r
    },
  }
  vi.stubGlobal('indexedDB', {
    open: () => {
      const r: { result: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void; error?: unknown } = {
        result: { createObjectStore: () => {}, transaction: () => ({ objectStore: () => store }) },
      }
      setTimeout(() => (fail ? r.onerror?.() : (r.onupgradeneeded?.(), r.onsuccess?.())))
      return r
    },
  })
  return data
}
const handle = (name: string, permission?: PermissionState, granted: PermissionState = 'granted') => ({
  name,
  getFile: async () => new File(['%PDF'], name),
  ...(permission ? { queryPermission: async () => permission, requestPermission: async () => granted } : {}),
})
const win = window as unknown as Record<string, unknown>
const tab = () => {
  const t = { location: { href: '' }, close: vi.fn() }
  vi.spyOn(window, 'open').mockReturnValue(t as unknown as Window)
  return t
}

beforeEach(() => {
  localStorage.clear()
  URL.createObjectURL = vi.fn(() => 'blob:x')
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete win.showOpenFilePicker
})

test('the first open asks for the file, remembers it, and the next open reuses it', async () => {
  const data = fakeIdb()
  win.showOpenFilePicker = vi.fn(async () => [handle('sr6.pdf')])
  const t = tab()
  expect(await isLinked('SR6')).toBe(false)
  expect(await openPdfAtPage('SR6', 0)).toBe(true)
  expect(t.location.href).toBe('blob:x#page=1')
  expect(data.has('SR6')).toBe(true)
  expect(await isLinked('SR6')).toBe(true)
  expect(await linkedBooks()).toEqual([{ src: 'SR6', file: 'sr6.pdf' }])
  expect(await openPdfAtPage('SR6', 5)).toBe(true)
  expect(win.showOpenFilePicker).toHaveBeenCalledTimes(1)
})

test('a remembered file that needs permission asks again, and a refusal closes the tab', async () => {
  const data = fakeIdb()
  const t = tab()
  data.set('SR6', handle('sr6.pdf', 'prompt', 'granted'))
  expect(await openPdfAtPage('SR6', 3)).toBe(true)
  expect(t.location.href).toBe('blob:x#page=3')
  data.set('SR6', handle('sr6.pdf', 'prompt', 'denied'))
  expect(await openPdfAtPage('SR6', 3)).toBe(false)
  expect(t.close).toHaveBeenCalled()
})

test('with the pop-up blocked the page opens in a new window; a bad offset counts as none', async () => {
  const data = fakeIdb()
  data.set('SR6', handle('sr6.pdf'))
  const open = vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValue(null)
  setOffset('SR6', 2.9)
  expect(getOffset('SR6')).toBe(2)
  setOffset('SR6', Number.NaN)
  expect(getOffset('SR6')).toBe(0)
  expect(await openPdfAtPage('SR6', 7)).toBe(true)
  expect(open).toHaveBeenLastCalledWith('blob:x#page=7', '_blank')
  localStorage.setItem('nova.pdfOffsets.v1', '{broken')
  expect(getOffset('SR6')).toBe(0)
})

test('unlinking forgets the file; a browser without storage lists nothing and never throws', async () => {
  const data = fakeIdb()
  data.set('SR6', handle('sr6.pdf'))
  await unlink('SR6')
  expect(data.size).toBe(0)
  fakeIdb(true)
  expect(await linkedBooks()).toEqual([])
  expect(await isLinked('SR6')).toBe(false)
  await expect(unlink('SR6')).resolves.toBeUndefined()
})

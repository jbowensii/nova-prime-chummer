import { describe, it, expect, vi, beforeEach } from 'vitest'
import { openPdfAtPage, setOffset, getOffset, pdfLinksSupported } from '../src/core/ui-kit/pdfLinks'

describe('pdf links', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as unknown as Record<string, unknown>).showOpenFilePicker
  })
  it('is unsupported without showOpenFilePicker', () => expect(pdfLinksSupported()).toBe(false))
  it('picks, opens at page+offset, and makes no network call', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    ;(window as unknown as Record<string, unknown>).showOpenFilePicker = vi.fn(async () => [{ getFile: async () => new File(['%PDF'], 'b.pdf') }])
    URL.createObjectURL = vi.fn(() => 'blob:x')
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    setOffset('SR6', 4)
    expect(getOffset('SR6')).toBe(4)
    expect(await openPdfAtPage('SR6', 12)).toBe(true)
    expect(tab.location.href).toBe('blob:x#page=16')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('closes the tab when the picker is cancelled', async () => {
    ;(window as unknown as Record<string, unknown>).showOpenFilePicker = vi.fn(async () => {
      throw new DOMException('x', 'AbortError')
    })
    const tab = { location: { href: '' }, close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    expect(await openPdfAtPage('SR6', 1)).toBe(false)
    expect(tab.close).toHaveBeenCalled()
  })
})

// @vitest-environment jsdom
// The page art re-picks on every hashchange (no refetch); all useArtId instances agree.
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { useArtId } from '../../../src/features/appearance/Background'

const mock = (enabled: string[]) => {
  const f = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ enabled }) }))
  vi.stubGlobal('fetch', f)
  return f
}
afterEach(() => vi.unstubAllGlobals())

test('re-picks a different image on every hashchange, one fetch, instances agree', async () => {
  const f = mock(['a', 'b', 'c'])
  const one = renderHook(() => useArtId('ca2')),
    two = renderHook(() => useArtId('ca2'))
  await waitFor(() => expect(one.result.current).toBeTruthy())
  for (let i = 0; i < 20; i++) {
    const before = one.result.current
    act(() => void dispatchEvent(new Event('hashchange')))
    expect(one.result.current).not.toBe(before)
    expect(two.result.current).toBe(one.result.current)
  }
  expect(f).toHaveBeenCalledTimes(2) // one per hook instance's mount, none per hashchange
})

test('a single enabled image stays', async () => {
  mock(['a'])
  const { result } = renderHook(() => useArtId('sr6'))
  await waitFor(() => expect(result.current).toBe('a'))
  act(() => void dispatchEvent(new Event('hashchange')))
  expect(result.current).toBe('a')
})

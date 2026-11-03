// The browser's API client: JSON or text back, the server's own error message, and a file sent with upload progress.
import { afterEach, expect, test, vi } from 'vitest'
import { api, sendFile } from '../../src/core/ui-kit/api'

afterEach(() => vi.unstubAllGlobals())
const reply = (init: ResponseInit & { body?: string }, type = 'application/json') =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(init.body ?? null, { ...init, headers: { 'content-type': type } })),
  )

test('api returns parsed JSON, plain text, or null for no content', async () => {
  reply({ body: '{"a":1}' })
  expect(await api('x')).toEqual({ a: 1 })
  reply({ body: 'hello' }, 'text/plain')
  expect(await api('x')).toBe('hello')
  reply({ status: 204 })
  expect(await api('x')).toBeNull()
})

test('api reports the server’s message, a status fallback, or that the server is unreachable', async () => {
  reply({ status: 400, body: '{"error":"bad book"}' })
  await expect(api('x')).rejects.toThrow('bad book')
  reply({ status: 500, body: 'not json' })
  await expect(api('x')).rejects.toThrow('the server answered 500')
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
  await expect(api('x')).rejects.toThrow('the server can’t be reached')
})

class FakeXhr {
  static last: FakeXhr
  status = 200
  responseText = 'ok'
  upload: { onprogress?: (e: unknown) => void } = {}
  headers: Record<string, string> = {}
  onload?: () => void
  onerror?: () => void
  constructor() {
    FakeXhr.last = this
  }
  open() {}
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v
  }
  send() {}
}

test('sendFile reports progress and resolves with the response text', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  const pct: number[] = []
  const p = sendFile('books', new File(['x'], 'b.pdf'), { 'X-Name': 'b' }, n => pct.push(n))
  const x = FakeXhr.last
  x.upload.onprogress!({ lengthComputable: true, loaded: 1, total: 4 })
  x.upload.onprogress!({ lengthComputable: false, loaded: 1, total: 4 })
  x.onload!()
  expect(await p).toBe('ok')
  expect(pct).toEqual([25])
  expect(x.headers['X-Name']).toBe('b')
})

test('sendFile fails with the server’s message and status, and on a network error', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  const p = sendFile('books', new File(['x'], 'b.pdf'), {}, () => {})
  Object.assign(FakeXhr.last, { status: 413, responseText: '{"error":"too big"}' })
  FakeXhr.last.onload!()
  await expect(p).rejects.toMatchObject({ message: 'too big', status: 413 })
  const q = sendFile('books', new File(['x'], 'b.pdf'), {}, () => {})
  Object.assign(FakeXhr.last, { status: 502, responseText: '<html>' })
  FakeXhr.last.onload!()
  await expect(q).rejects.toThrow('the server answered 502')
  const r = sendFile('books', new File(['x'], 'b.pdf'), {}, () => {})
  FakeXhr.last.onerror!()
  await expect(r).rejects.toThrow('the server can’t be reached')
})

test('sendFile on a 401 says you were signed out', async () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  const p = sendFile('books', new File(['x'], 'b.pdf'), {}, () => {})
  FakeXhr.last.status = 401
  FakeXhr.last.onload!()
  await expect(p).rejects.toMatchObject({ status: 401 })
})

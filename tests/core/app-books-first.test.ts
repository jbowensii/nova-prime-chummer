import { afterEach, expect, test, vi } from 'vitest'
import { homeGame } from '../../src/core/app/booksFirst'
const fresh = async () => (vi.resetModules(), (await import('../../src/core/app/booksFirst')).checkBooksFirst) // the in-memory seen set starts empty

const answer = (body: unknown, ok = true) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } })),
  )
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

test('homeGame: bare homes only, never deep links', () => {
  expect([homeGame([]), homeGame(['sr6']), homeGame(['c', 'x']), homeGame(['sr6', 'c', 'x']), homeGame(['books'])]).toEqual(['ca2', 'sr6', null, null, null])
})

test('no books and no data: Books page, once', async () => {
  const checkBooksFirst = await fresh()
  answer([])
  expect(await checkBooksFirst('ca2', async () => false)).toBe('#/books')
  expect(await checkBooksFirst('ca2', async () => false)).toBeNull() // second visit stays home
  expect(localStorage.getItem('chummer.booksSeen.ca2')).toBe('1')
  expect(await checkBooksFirst('sr6', async () => false)).toBe('#/sr6/books')
})

test('a data pack or a book keeps the home', async () => {
  const checkBooksFirst = await fresh()
  answer([])
  expect(await checkBooksFirst('ca2', async () => true)).toBeNull()
  answer([{ id: 'b' }])
  expect(await checkBooksFirst('sr6', async () => false)).toBeNull()
})

test('a failed request is not empty: no redirect, no flag', async () => {
  const checkBooksFirst = await fresh()
  answer({ error: 'x' }, false)
  expect(await checkBooksFirst('ca2', async () => false)).toBeNull()
  expect(localStorage.getItem('chummer.booksSeen.ca2')).toBeNull()
})

import { describe, expect, test } from 'vitest'
import { canEdit, isAdmin, problem, sentence, type User } from '../../src/ui/auth'

const as = (role: User['role']) => ({ role }) as User

describe('accounts in the UI', () => {
  test('roles: no accounts (browser storage) hides nothing', () => {
    expect([isAdmin(null), isAdmin(as('admin')), isAdmin(as('editor')), isAdmin(as('player'))]).toEqual([true, true, false, false])
    expect([canEdit(null), canEdit(as('admin')), canEdit(as('editor')), canEdit(as('player'))]).toEqual([true, true, true, false])
  })

  test('server messages read as sentences', () => {
    expect(sentence('wrong username or password')).toBe('Wrong username or password.')
    expect(sentence('the server is busy: try again in a moment')).toBe('The server is busy: try again in a moment.')
    expect(sentence('done.')).toBe('Done.')
  })

  test('a refusal in plain words; a pause says how long from Retry-After', async () => {
    const r = (status: number, body: unknown, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
    expect(await problem(r(401, { error: 'wrong username or password' }))).toBe('Wrong username or password.')
    expect(await problem(r(429, { error: 'too many tries' }, { 'Retry-After': '900' }))).toBe('Too many tries, so this is paused. Try again in 15 minutes.')
    expect(await problem(r(429, { error: 'too many tries' }, { 'Retry-After': '42' }))).toBe('Too many tries, so this is paused. Try again in a minute.')
    expect(await problem(r(429, { error: 'the server is busy' }, { 'Retry-After': '1' }))).toBe('The server is busy. Try again in a moment.')
    expect(await problem(new Response('oops', { status: 500 }))).toBe('Something went wrong (the server answered 500). Try again.')
  })
})

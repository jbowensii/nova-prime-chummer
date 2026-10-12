import { describe, expect, test, vi } from 'vitest'
import { because, canEdit, isAdmin, problem, sentence, session, signOut, track, type User } from '../../src/ui/auth'

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

  test('a lead and a reason: one colon at most', () => {
    expect(because('Couldn’t load the data pack', 'the file is larger than 50 MB')).toBe('Couldn’t load the data pack: the file is larger than 50 MB.')
    expect(because('This file can’t be loaded', 'the pack has a file a data pack can’t hold: notes.xml (only datapack.xml)')).toBe(
      'This file can’t be loaded. The pack has a file a data pack can’t hold: notes.xml (only datapack.xml).',
    )
    expect(because('Couldn’t save', 'you were signed out: sign in again, then send it again.')).toBe(
      'Couldn’t save. You were signed out: sign in again, then send it again.',
    )
    expect(because('Couldn’t save', '')).toBe('Couldn’t save.')
  })

  test('sign-out waits for a save at most so long, then says so; nothing is ended meanwhile', async () => {
    const logout = vi.spyOn(window, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    let finish = () => {}
    void track(
      new Promise<void>(ok => {
        finish = ok
      }),
    ) // a save that hangs
    expect(await signOut(false, 50)).toBe(false)
    expect(session.held).toBe(false)
    expect(logout).not.toHaveBeenCalled()
    finish()
    logout.mockRestore()
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

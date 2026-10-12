// Signed-in test servers, for the server tests that aren't about accounts (auth.test.ts is): createServer seeds an admin
// into the Library's users.xml (unless there is one), and fetch to a local test server sends the Origin header and that
// server's session cookie, signing in as the admin on a 401 (e.g. after a restore ended every session).
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
// @ts-expect-error plain JS module
import { createServer as create } from '../../server/server.mjs'
// @ts-expect-error plain JS module
import { usersFile } from '../../server/auth.mjs'

export const ADMIN = { username: 'admin', password: 'test-admin-password' }
const USERS: string = await usersFile([ADMIN])
export const rawFetch = globalThis.fetch
const jar = new Map<string, string>() // origin -> "ca2_session=…"

/** The session cookie fetch sends to `origin` ("" before the first sign-in). */
export const cookieFor = (origin: string) => jar.get(origin) ?? ''

/** Sign `who` in at `origin`; the cookie, or null. */
export async function signIn(origin: string, who = ADMIN): Promise<string | null> {
  const r = await rawFetch(`${origin}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify(who),
    headers: { 'Content-Type': 'application/json', Origin: origin },
  })
  const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? null
  if (r.ok && cookie) jar.set(origin, cookie)
  return r.ok ? cookie : null
}

globalThis.fetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return rawFetch(input, init)
  const go = () => {
    const h = new Headers(init.headers)
    if (!h.has('Origin')) h.set('Origin', url.origin)
    const c = jar.get(url.origin)
    if (c && !h.has('Cookie')) h.set('Cookie', c)
    return rawFetch(input, { ...init, headers: h })
  }
  const r = await go()
  return r.status === 401 && !url.pathname.startsWith('/api/auth/') && (await signIn(url.origin)) ? go() : r
}) as typeof fetch

type Opts = { charDir: string; libraryDir?: string; [k: string]: unknown }
/** server.mjs's createServer, with the test admin in users.xml. */
export function createServer(opts: Opts) {
  const lib = resolve(opts.libraryDir ?? join(opts.charDir, '..', 'library'))
  if (!existsSync(join(lib, '.config', 'users.xml'))) {
    mkdirSync(join(lib, '.config'), { recursive: true })
    writeFileSync(join(lib, '.config', 'users.xml'), USERS)
  }
  return create(opts)
}

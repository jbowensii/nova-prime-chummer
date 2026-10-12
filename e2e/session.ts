// The e2e admin's session: e2e/serve.mjs seeds the account, signin.setup.ts signs in once and saves the cookie to
// STATE, which every test’s browser context starts with (playwright.config.ts); e2e/accounts.spec.ts drives the sign-in pages.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type APIRequestContext, type Page } from '@playwright/test'
import { GAME_KEY } from '../src/ui/game'
export { GAME_KEY }

export const STATE = join(process.env.CA2_E2E_DIR!, 'e2e-state.json')
const ORIGIN = 'http://localhost:4173'

/** Sign the admin in through the API; the context (a page's `page.request`, or the `request` fixture) keeps the cookie. */
export async function signIn(request: APIRequestContext) {
  const admin = JSON.parse(readFileSync(join(process.env.CA2_E2E_DIR!, 'e2e-admin.json'), 'utf8'))
  const r = await request.post(`${ORIGIN}/api/auth/login`, { data: admin, headers: { Origin: ORIGIN } })
  if (!r.ok()) throw new Error(`e2e sign-in failed: ${r.status()}`)
}

/** A browser that already picked Anarchy (no picker) and has no session: the specs that run their own server. Playwright
 *  also resolves this for the beforeAll hook that starts that server, while `base` is still '': no origin then. */
export const anarchyState = (base: string) => ({
  cookies: [],
  origins: base ? [{ origin: new URL(base).origin, localStorage: [{ name: GAME_KEY, value: 'ca2' }] }] : [],
})

/** Save the open editor now (its Save button) and wait until the server's copy of it matches `text`. The save bar says
 *  "All changes saved" before the first autosave too (a change waits 400 ms), so it proves nothing about the server. */
export async function savedOnServer(page: Page, text: string | RegExp) {
  const [, sr6 = '', kind, id] = page.url().match(/#\/(sr6\/)?(c|n)\/([^/]+)\//) ?? []
  if (!id) throw new Error(`savedOnServer: not in an editor (${page.url()})`)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect
    .poll(
      async () =>
        ((await (await page.request.get(`/api/${sr6}${kind === 'n' ? 'npcs' : 'characters'}`)).json()) as { xml: string }[]).find(r =>
          r.xml.includes(` id="${id}"`),
        )?.xml ?? '',
    )
    .toMatch(text)
}

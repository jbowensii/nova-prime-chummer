// The e2e admin's session: e2e/serve.mjs seeds the account, signin.setup.ts signs in once and saves the cookie to
// STATE, which every test’s browser context starts with (playwright.config.ts); e2e/accounts.spec.ts drives the sign-in pages.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { APIRequestContext } from '@playwright/test'

export const STATE = join(process.env.CA2_E2E_DIR!, 'e2e-state.json')
const ORIGIN = 'http://localhost:4173'

/** Sign the admin in through the API; the context (a page's `page.request`, or the `request` fixture) keeps the cookie. */
export async function signIn(request: APIRequestContext) {
  const admin = JSON.parse(readFileSync(join(process.env.CA2_E2E_DIR!, 'e2e-admin.json'), 'utf8'))
  const r = await request.post(`${ORIGIN}/api/auth/login`, { data: admin, headers: { Origin: ORIGIN } })
  if (!r.ok()) throw new Error(`e2e sign-in failed: ${r.status()}`)
}

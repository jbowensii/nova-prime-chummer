import { test, expect } from '@playwright/test'

// The server's Content-Security-Policy (server/server.mjs) against the built app: every screen loads with no violation.
test('the security headers are sent and the app runs under its CSP', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { violations: string[] }
    w.violations = []
    document.addEventListener('securitypolicyviolation', e => w.violations.push(`${e.violatedDirective} ${e.blockedURI}`))
  })
  const res = await page.goto('/')
  const h = res!.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect([h['x-content-type-options'], h['x-frame-options'], h['referrer-policy']]).toEqual(['nosniff', 'DENY', 'same-origin'])

  await page.getByRole('button', { name: 'New runner' }).click()
  await page.getByRole('button', { name: 'Create runner' }).click()
  await page.getByLabel('Street name').fill('Policy Check')
  await page.getByRole('link', { name: 'Print' }).click()
  await expect(page.getByRole('heading', { name: 'Skills', exact: true })).toBeVisible()
  for (const route of ['/#/books', '/#/rules', '/#/data', '/']) {
    await page.goto(route)
    await page.waitForLoadState('networkidle')
  }
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  expect(await page.evaluate(() => (window as unknown as { violations: string[] }).violations)).toEqual([])
})

// The Setup screen (admin only): saving settings, going back to a default, cloud backups, desktop updates and game systems.
// The server is a stub that answers /api/setup-config; the desktop updater bridge is a fake on window.
import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { SetupScreen } from '../../src/core/app/SetupScreen'
import type { Repo } from '../../src/core/ui-kit/repoContext'
import { button, change, click, field, hasButton, mount, pageText, settle, stubFetch } from './dom'

const server = { mode: 'server' } as Repo
const view = (over: object = {}) => ({
  file: '/data/Config/options.json',
  version: '1.2.3',
  desktop: false,
  settings: [
    { key: 'hostname', type: 'text', value: 'tower', source: 'file', later: false },
    { key: 'port', type: 'number', value: 80, source: 'default', later: false },
    { key: 'upnp', type: 'bool', value: false, source: 'env', later: true },
    { key: 'updateChannel', type: 'choice', options: ['stable', 'testing'], value: 'stable', source: 'default', later: false },
    { key: 'dataPath', type: 'text', value: '/data', source: 'flag', later: false, readonly: true },
    { key: 'sslCert', type: 'text', value: null, source: 'default', later: false },
  ],
  systems: [{ id: 'sr6', title: 'Shadowrun 6', game: 'sr6', version: '1.0.0', status: 'ready', enabled: true, coreImported: true, books: 2, catalog: 1 }],
  backups: [{ name: 'safety-1.zip', bytes: 5 * 1024 ** 2, created: '2026-01-01T00:00:00Z' }],
  cloud: { configured: true },
  ...over,
})
const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
const screen = (tab: string, admin = true, repo = server) => mount(createElement(SetupScreen, { tab, admin, repo }))
const puts = (calls: { url: string; init?: RequestInit }[]) => calls.filter(c => c.init?.method === 'PUT').map(c => JSON.parse(String(c.init!.body)))

test('only an admin on a server copy gets the Setup screen', async () => {
  stubFetch()
  await screen('configuration', false)
  expect(pageText()).toContain('Only an admin can open Setup')
  await screen('configuration', true, { mode: 'browser' } as Repo)
  expect(pageText()).toContain('Setup needs the server')
})

test('a server that will not give the settings shows why', async () => {
  stubFetch([[/setup-config$/, () => json({ error: 'no admin' }, 403)]])
  await screen('configuration')
  expect(pageText()).toContain('no admin')
})

test('saving sends only what changed; an unchanged form says so; Off writes null; Use default resets one setting', async () => {
  const calls = stubFetch([[/setup-config$/, () => view()]])
  await screen('configuration')
  expect(pageText()).toContain('Now: tower (from options.json)')
  expect(pageText()).toContain('set by the installer')
  await click(button('Save settings'))
  expect(pageText()).toContain('Nothing changed.')
  await change(field('hostname off'), true)
  await change(field('port'), '8080')
  await change(field('upnp'), true)
  await change(field('updateChannel'), 'testing')
  await change(field('sslCert'), 'a.pem')
  await click(button('Save settings'))
  expect(puts(calls).at(-1)).toEqual({ set: { hostname: null, port: 8080, upnp: true, updateChannel: 'testing', sslCert: 'a.pem' } })
  expect(pageText()).toContain('Saved to Config/options.json')
  await click(button('Use default'))
  expect(puts(calls).at(-1)).toEqual({ reset: ['hostname'] })
  expect(pageText()).toContain('hostname is back to its default.')
})

test('a refused save shows the server’s reason', async () => {
  stubFetch([[/setup-config$/, (_u, init) => (init?.method === 'PUT' ? json({ error: 'port must be a number' }, 400) : view())]])
  await screen('configuration')
  await change(field('port'), '9')
  await click(button('Save settings'))
  expect(document.querySelector('[role=alert]')?.textContent).toBe('port must be a number')
})

test('the Backups tab lists safety backups and says when the cloud is not configured', async () => {
  stubFetch([[/setup-config$/, () => view({ cloud: { configured: false, error: 'no file' } })]])
  await screen('backups')
  expect(pageText()).toContain('safety-1.zip')
  expect(pageText()).toContain('5 MB')
  expect(pageText()).toContain('Not configured: no file.')
})

test('cloud backups: refresh, back up, and restore only when confirmed', async () => {
  let list = [{ key: 'backups/a.zip', bytes: 3 * 1024 ** 2, lastModified: '2026-02-02T00:00:00Z' }]
  const calls = stubFetch([
    [/setup-config$/, () => view()],
    [/cloud-backup\/restore$/, () => ({ ok: true })],
    [/cloud-backup$/, (_u, init) => (init?.method === 'POST' ? { key: 'backups/b.zip' } : { backups: list })],
  ])
  await screen('backups')
  await click(button('Refresh list'))
  expect(pageText()).toContain('backups/a.zip')
  expect(pageText()).toContain('3 MB')
  list = [...list, { key: 'backups/b.zip', bytes: 1, lastModified: '2026-03-03T00:00:00Z' }]
  await click(button('Back up to cloud'))
  expect(pageText()).toContain('Backed up to backups/b.zip.')
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  const restore = () => document.querySelectorAll<HTMLButtonElement>('li button')[0]
  await click(restore())
  expect(calls.some(c => /cloud-backup\/restore/.test(c.url))).toBe(false)
  await click(restore())
  expect(JSON.parse(String(calls.at(-1)!.init!.body))).toEqual({ key: 'backups/a.zip' })
  expect(pageText()).toContain('Restored backups/a.zip. Reload the page.')
  expect(confirm).toHaveBeenCalledTimes(2)
})

test('an empty cloud list and a failing cloud say so', async () => {
  let fail = false
  stubFetch([
    [/setup-config$/, () => view({ backups: [] })],
    [/cloud-backup$/, () => (fail ? json({ error: 'bucket gone' }, 502) : { backups: [] })],
  ])
  await screen('backups')
  expect(pageText()).toContain('No safety backups yet.')
  await click(button('Refresh list'))
  expect(pageText()).toContain('No cloud backups yet.')
  fail = true
  await click(button('Refresh list'))
  expect(pageText()).toContain('bucket gone')
})

test('a plain browser can’t update from Setup', async () => {
  stubFetch([[/setup-config$/, () => view()]])
  await screen('updates')
  expect(pageText()).toContain('Version 1.2.3, update channel stable')
  expect(pageText()).toContain('Updates are in the desktop app')
  expect(button('Check for updates').disabled).toBe(true)
})

const bridge = (up: unknown) => ((window as unknown as { updater: unknown }).updater = up)
const noBridge = () => delete (window as unknown as { updater?: unknown }).updater

test('the desktop app checks, downloads, then backs up and installs when confirmed', async () => {
  const handlers: { state?: (s: { state: string; message?: string }) => void } = {}
  const up = {
    check: vi.fn(async () => ({ state: 'available', version: '2.0.0' })),
    download: vi.fn(async () => undefined),
    install: vi.fn(async () => undefined),
    onProgress: () => () => {},
    onState: (cb: (s: { state: string; message?: string }) => void) => ((handlers.state = cb), () => {}),
  }
  bridge(up)
  stubFetch([
    [/setup-config$/, () => view({ settings: view().settings.map(s => (s.key === 'updateChannel' ? { ...s, value: 'testing' } : s)) })],
    [/api\/backup$/, () => ({ token: 't0k' })],
  ])
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    await screen('updates')
    await click(button('Check for updates'))
    expect(up.check).toHaveBeenCalledWith('beta')
    expect(pageText()).toContain('Version 2.0.0 is available.')
    await click(button('Download'))
    expect(pageText()).toContain('Downloaded.')
    await click(button('Back up & install'))
    expect(up.install).toHaveBeenCalled()
    handlers.state!({ state: 'error', message: 'disk full' })
    await settle()
    expect(document.querySelector('[role=alert]')?.textContent).toBe('disk full')
  } finally {
    noBridge()
  }
})

test('the desktop app says it is current, and a failed download goes back to Download', async () => {
  bridge({
    check: vi.fn().mockResolvedValueOnce({ state: 'current', version: '1.2.3' }).mockResolvedValue({ state: 'available', version: '9' }),
    download: vi.fn().mockRejectedValue(new Error('offline')),
    install: vi.fn(),
    onProgress: () => () => {},
    onState: () => () => {},
  })
  stubFetch([[/setup-config$/, () => view()]])
  try {
    await screen('updates')
    await click(button('Check for updates'))
    expect(pageText()).toContain('You have the latest version.')
    expect(hasButton('Download')).toBe(false)
    await click(button('Check for updates'))
    await click(button('Download'))
    expect(pageText()).toContain('offline')
    expect(hasButton('Download')).toBe(true)
  } finally {
    noBridge()
  }
})

test('game systems: switch one off, install from a web address, and see a refusal', async () => {
  const calls = stubFetch([
    [/setup-config$/, () => view()],
    [/systems\/sr6\/enabled$/, () => [{ ...view().systems[0], enabled: false }]],
    [/systems\/sr6\/install$/, (_u, init) => (String(init?.body).includes('bad') ? json({ error: 'only http(s) addresses work' }, 400) : view().systems)],
  ])
  await screen('systems')
  expect(pageText()).toContain('Shadowrun 6')
  expect(pageText()).toContain('2 books; catalog: 1 file.')
  await change(field('On'), false)
  expect(puts(calls).at(-1)).toEqual({ enabled: false })
  expect(pageText()).toContain('Shadowrun 6 is off.')
  expect(button('Install').disabled).toBe(true)
  await change(field('Install or update from a web address'), 'bad://x')
  await click(button('Install'))
  expect(pageText()).toContain('only http(s) addresses work')
  await change(field('Install or update from a web address'), 'https://example.com/p.zip')
  await click(button('Install'))
  expect(pageText()).toContain('Shadowrun 6 package installed.')
})

test('game systems: installing from a file posts the zip', async () => {
  const calls = stubFetch([
    [/setup-config$/, () => view()],
    [/systems\/sr6\/install$/, () => view().systems],
  ])
  await screen('systems')
  const input = field('Install or update from a file')
  Object.defineProperty(input, 'files', { value: [new File(['PK'], 'p.zip')], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await settle()
  expect(calls.at(-1)!.init!.headers).toEqual({ 'Content-Type': 'application/zip' })
  expect(pageText()).toContain('Shadowrun 6 package installed.')
})

test('with no systems on the old folder layout the tab explains', async () => {
  stubFetch([[/setup-config$/, () => view({ systems: [] })]])
  await screen('systems')
  expect(pageText()).toContain('once the server runs on the Data folder layout')
})

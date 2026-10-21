// Campaigns (src/ui/Campaigns.tsx) over a stand-in campaigns API: the list (archived ones on request), a new campaign,
// and one campaign's page as its GM and as the admin: add and remove a player (asked first), a co-GM, remove a runner,
// archive, edit and delete. Made-up campaigns and accounts.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import type { Campaign } from '../../src/ui/campaignsStore'
import { CampaignScreen, CampaignsScreen } from '../../src/ui/Campaigns'
import { Me, type User } from '../../src/core/ui-kit/auth'
import { button, change, click, field, mount, pageText, stubFetch } from './dom'

const person = (username: string, name: string) => ({ username, name })
const base = (): Campaign => ({
  id: 'k1',
  name: 'Made-up Run',
  note: 'Bring snacks',
  archived: false,
  created: '2026-01-01',
  you: 'gm',
  gms: [person('gm', 'Made-up GM')],
  members: [person('pat', 'Made-up Pat')],
  runners: [{ key: 'r', mine: false, ownerName: 'Made-up Pat', owner: 'pat', streetName: 'Made-up Spur', level: 'runner', package: 'free', id: 'r1' }],
})
const admin: User = {
  id: 'a',
  username: 'admin',
  name: 'Made-up Admin',
  email: null,
  role: 'admin',
  method: 'password',
  enabled: true,
  created: '',
  lastLogin: null,
}

/** A campaign API that applies each change to its one campaign and answers with it (DELETE of the campaign: 204). */
function server(start = base()) {
  let camp = start
  const sent: string[] = []
  stubFetch([
    [/\/api\/users$/, () => [admin, { ...admin, id: 'e', username: 'ed', name: 'Made-up Ed', role: 'editor' }]],
    [
      /\/api\/campaigns\/k1(\/.*)?$/,
      (url, init) => {
        const m = init?.method ?? 'GET',
          path = url.replace(/.*\/api\/campaigns\/k1/, ''),
          body = init?.body ? JSON.parse(String(init.body)) : {}
        sent.push(`${m} ${path}`)
        if (m === 'DELETE' && !path) return new Response(null, { status: 204 })
        if (m === 'POST' && path === '/members') {
          if (body.user === 'nobody') return new Response('{"error":"no account called nobody"}', { status: 404 })
          camp = { ...camp, members: [...camp.members, person(body.user, `Made-up ${body.user}`)] }
        }
        if (m === 'POST' && path === '/gms') camp = { ...camp, gms: [...camp.gms, person(body.user, 'Made-up Ed')] }
        if (m === 'DELETE' && path.startsWith('/members/')) camp = { ...camp, members: camp.members.filter(p => !path.endsWith(p.username)) }
        if (m === 'DELETE' && path.startsWith('/runners/')) camp = { ...camp, runners: [] }
        if (m === 'PUT') camp = { ...camp, ...body }
        return camp
      },
    ],
    [
      /\/api\/campaigns$/,
      (_, init) => (init?.method === 'POST' ? { ...base(), id: 'k2' } : [base(), { ...base(), id: 'k0', name: 'Made-up Old', archived: true }]),
    ],
  ])
  return sent
}

test('the list hides archived campaigns until asked; New campaign opens the new one', async () => {
  server()
  await mount(createElement(CampaignsScreen))
  const rows = () => [...document.querySelectorAll('table.campaigns tbody tr')].map(r => r.querySelector('b')?.textContent)
  expect(rows()).toEqual(['Made-up Run'])
  await change(field('Show archived campaigns'), true)
  expect(rows()).toEqual(['Made-up Run', 'Made-up Old'])
  await click(button('New campaign'))
  await change(field('Name'), 'Made-up Fresh')
  await click(button(/^Create/, document.querySelector('dialog[open]')!))
  expect(location.hash).toBe('#/campaigns/k2')
})

test('a GM adds a player (a refusal shown), removes one after asking, removes a runner, archives, edits and deletes', async () => {
  const sent = server()
  await mount(createElement(CampaignScreen, { id: 'k1', label: r => `${r.level}, ${r.package}` }))
  expect(pageText()).toMatch(/Made-up Spur/)
  await change(field('Add a player by username'), 'nobody')
  await click(button('Add player'))
  expect(pageText()).toMatch(/No account called nobody\./)
  await change(field('Add a player by username'), 'lee')
  await click(button('Add player'))
  expect(pageText()).toMatch(/Added lee\./)

  await click(button('Remove Made-up Pat'))
  await click(button('Remove player'))
  expect(pageText()).toMatch(/Made-up Pat left the campaign\./)

  await click(button('Remove Made-up Spur from the campaign'))
  expect(pageText()).toMatch(/Made-up Spur left the campaign\./)

  await click(button('Archive'))
  expect(pageText()).toMatch(/The campaign is archived/)
  await click(button('Rename or edit the note'))
  await change(field('Name', document.querySelector('dialog[open]')!), 'Made-up Renamed')
  await click(button(/^Save/, document.querySelector('dialog[open]')!))
  expect(pageText()).toMatch(/Made-up Renamed/)

  await click(button('Delete campaign'))
  await click(button('Delete campaign', document.querySelector('dialog[open]')!))
  expect(location.hash).toBe('#/campaigns')
  expect(sent).toContain('DELETE ')
})

test('the admin adds a co-GM from the staff accounts', async () => {
  const sent = server()
  await mount(createElement(Me.Provider, { value: admin }, createElement(CampaignScreen, { id: 'k1', label: () => '' })))
  await change(field('Add a co-GM'), 'ed')
  await click(button('Add co-GM'))
  expect(sent).toContain('POST /gms')
  expect(pageText()).toMatch(/Added a co-GM\./)
})

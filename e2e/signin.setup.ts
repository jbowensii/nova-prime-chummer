import { writeFileSync } from 'node:fs'
import { test as setup } from '@playwright/test'
import { anarchyState, signIn, STATE } from './session'

// every app test starts signed in, on Anarchy (no game picker)
setup('sign in as the e2e admin', async ({ request }) => {
  await signIn(request)
  const state = await request.storageState()
  writeFileSync(STATE, JSON.stringify({ ...state, origins: anarchyState('http://localhost:4173').origins }))
})

import { test as setup } from '@playwright/test'
import { signIn, STATE } from './session'

setup('sign in as the e2e admin', async ({ request }) => {
  await signIn(request)
  await request.storageState({ path: STATE })
})

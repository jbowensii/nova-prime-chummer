// Account recovery from the server's shell:
//   docker exec chummer-anarchy2 node server/users.mjs reset <username>
// prints a one-time code (15 minutes) that the setup page's "reset" form (/api/setup/reset) takes with a new password.
// Only the code's hash is written (library/.config/reset.xml, which the running server reads); a new code replaces the
// old. LIBRARY_DIR: the Library folder (the image sets /data/library).
import { issueReset } from './auth.mjs'

const [cmd, username, ...rest] = process.argv.slice(2)
if (cmd !== 'reset' || !username || rest.length) {
  console.error('usage: node server/users.mjs reset <username>')
  process.exit(2)
}
try {
  const code = await issueReset(process.env.LIBRARY_DIR ?? '/data/library', username)
  console.log(`Recovery code for ${username.toLowerCase()}: ${code}\nEnter it with a new password on the app's reset page (<app address>/#/setup/reset) within 15 minutes. It works once.`)
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

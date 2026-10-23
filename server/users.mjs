// Account recovery from the server's shell:
//   docker exec nova-prime-chummer node server/users.mjs reset <username>
// prints a one-time code (15 minutes) that the setup page's "reset" form (/api/setup/reset) takes with a new password.
// Only the code's hash is written (Config/reset.xml, which the running server reads); a new code replaces the old.
// Config/ is under DATA_PATH (default /data); CONFIG_DIR names it directly. The account registry is one set of files
// there, never per game (server/layout.mjs).
import { issueReset } from './auth.mjs'
import { resolveConfig } from './config.mjs'
import { dataLayout } from './layout.mjs'

const [cmd, username, ...rest] = process.argv.slice(2)
if (cmd !== 'reset' || !username || rest.length) {
  console.error('usage: node server/users.mjs reset <username>')
  process.exit(2)
}
try {
  const code = await issueReset(null, username, process.env.CONFIG_DIR ?? dataLayout(resolveConfig([], process.env).dataPath).config)
  console.log(
    `Recovery code for ${username.toLowerCase()}: ${code}\nEnter it with a new password on the app's reset page (<app address>/#/setup/reset) within 15 minutes. It works once.`,
  )
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

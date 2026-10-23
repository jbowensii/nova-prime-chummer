// utilityProcess entry: runs the shared server factory (the CLI bootstrap in server.mjs doesn't fire under fork).
// electron/main.mjs sends {type:'start', opts} once (the secret travels by message, never argv/env, so the importer's
// child processes don't inherit it) and {type:'shutdown'} on quit.
import { createServer } from '../server/server.mjs'

process.parentPort.once('message', ({ data }) => {
  if (data?.type !== 'start') return
  const { port, ...opts } = data.opts
  const server = createServer(opts)
  server.on('error', e => process.parentPort.postMessage({ type: 'error', message: e.message }))
  server.listen(port, () => process.parentPort.postMessage({ type: 'ready' }))
  process.parentPort.on('message', ({ data: m }) => {
    if (m?.type !== 'shutdown') return
    server.stopJobs() // ends the importer job (kills its child); the next start resumes it (jobs.json)
    server.close(() => process.exit(0)) // exit once connections drain, no arbitrary timer; main.mjs's before-quit force-quits after 5s if this hangs
  })
})

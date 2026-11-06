// Electron main: starts the shared server in a utility process, bound to 127.0.0.1, and shows it in a locked-down window.
import { app, BrowserWindow, dialog, session, shell, utilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { createWriteStream, mkdirSync } from 'node:fs'
import { createServer as netServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withPortRetry } from './port-retry.mjs'
import { initUpdater } from './updater.mjs'

const DEFAULT_PORT = 47480 // ponytail: fixed preferred port (an OS-chosen one if taken); add a setting if users need a fixed port
const here = dirname(fileURLToPath(import.meta.url))

const packaged = app.isPackaged
// Python can't read app.asar: importer/, server/defaults, VERSION and dist/data are asarUnpack'd beside it
const importerRoot = packaged ? join(process.resourcesPath, 'app.asar.unpacked') : join(here, '..')
const python = packaged ? join(process.resourcesPath, 'python', 'python.exe') : 'python'
let win = null
let child = null
let quitting = false

/** The preferred port if free on 127.0.0.1, else an OS-chosen one. */
const freePort = pref =>
  new Promise((done, fail) => {
    const probe = port =>
      new Promise(res => {
        const s = netServer()
        s.once('error', () => res(0))
        s.listen(port, '127.0.0.1', () => {
          const p = s.address().port
          s.close(() => res(p))
        })
      })
    // prefer DEFAULT_PORT, else an OS-chosen one; if even that fails, surface it rather than passing 0 down (which would bind a port the window never navigates to)
    probe(pref).then(p => (p ? done(p) : probe(0).then(p2 => (p2 ? done(p2) : fail(new Error('no free port on 127.0.0.1'))))))
  })

async function start() {
  const secret = randomUUID()
  const root = app.getPath('userData')
  const dirs = Object.fromEntries(['Config', 'Data', 'Library', 'Logs'].map(d => [d, join(root, d)]))
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true })

  const log = createWriteStream(join(dirs.Logs, 'server.log'), { flags: 'a' })
  const launch = async port => {
    const c = (child = utilityProcess.fork(join(here, 'server-entry.mjs'), [], {
      stdio: 'pipe',
      serviceName: 'nova-prime-chummer-server',
      env: { ...process.env, CA2_DATA_DIR: join(importerRoot, 'dist', 'data'), PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1' },
    }))
    c.stdout.pipe(log, { end: false })
    c.stderr.pipe(log, { end: false })
    c.on('exit', () => {
      if (child !== c) return // a copy dropped below for a port that was taken
      child = null
      if (!quitting) app.quit()
    })
    const ready = new Promise((ok, fail) => {
      c.on('message', m => (m?.type === 'ready' ? ok() : m?.type === 'error' && fail(new Error(m.message))))
      c.once('exit', code => fail(new Error(`server exited (${code})`)))
    })
    c.postMessage({
      type: 'start',
      opts: {
        port,
        host: '127.0.0.1',
        allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
        localSecret: secret,
        openSetup: true, // the first admin is made on screen, not with a code from a log
        importerRoot,
        python,
        staticDir: join(importerRoot, 'dist'), // served from the unpacked copy (importerRoot = app.asar.unpacked when packaged), never from inside app.asar
        dataPath: root, // Config, Data, Library, Logs, Backups under it (server/layout.mjs)
      },
    })
    try {
      await ready
    } catch (e) {
      child = null
      c.kill()
      throw e
    }
  }
  const port = await withPortRetry(() => freePort(DEFAULT_PORT), launch)

  // The window's own requests carry the secret; it is added below the page, so page script never sees it.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`http://127.0.0.1:${port}/*`, `http://localhost:${port}/*`] }, (d, cb) =>
    cb({ requestHeaders: { ...d.requestHeaders, 'X-Local-Secret': secret } }),
  )

  win = new BrowserWindow({
    show: false,
    autoHideMenuBar: true,
    webPreferences: { preload: join(here, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  win.setMenu(null)
  win.maximize()
  win.show()
  const origin = `http://127.0.0.1:${port}`
  // anything that isn't this app opens in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === origin // exact origin, not a string prefix (a credentialed URL like http://host@evil/ must not pass)
    } catch {
      /* unparseable target: treat as external */
    }
    if (!sameOrigin) {
      e.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })
  win.webContents.on('before-input-event', (e, i) => {
    if (i.type !== 'keyDown') return
    if (i.key !== 'F5' && i.key !== 'F12') return
    e.preventDefault()
    if (i.key === 'F5') win.webContents.reload()
    else win.webContents.toggleDevTools()
  })
  initUpdater(() => win, origin)
  await win.loadURL(origin)
}

const BROWSE = '--browse-user-data'
/** The taskbar right-click menu's "Browse User Data": opens the data folder (dataPath is the userData root, as Foundry's Data folder). */
const browseUserData = () => void shell.openPath(app.getPath('userData'))

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', (_e, argv) => {
    if (argv.includes(BROWSE)) return browseUserData() // the jump-list task launched a second copy; it just asks this one
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(() => {
    if (process.platform === 'win32' && packaged)
      // (unpackaged, execPath is electron.exe itself)
      app.setUserTasks([
        {
          program: process.execPath,
          arguments: BROWSE,
          iconPath: process.execPath,
          iconIndex: 0,
          title: 'Browse User Data',
          description: 'Open the folder holding your data',
        },
      ])
    if (process.argv.includes(BROWSE)) browseUserData()
    return start().catch(e => {
      console.error(e)
      dialog.showErrorBox(
        'Nova Prime Chummer could not start',
        `${e.message}

Details: ${join(app.getPath('userData'), 'Logs', 'server.log')}`,
      )
      app.quit()
    })
  })
  app.on('window-all-closed', () => app.quit())
  // stop the importer job and the server first (the next launch resumes the job), then exit
  app.on('before-quit', e => {
    if (quitting || !child) return
    e.preventDefault()
    quitting = true
    const done = () => app.exit(0)
    child.once('exit', done)
    child.postMessage({ type: 'shutdown' })
    setTimeout(done, 5000)
  })
}

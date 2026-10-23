// Desktop auto-update (electron-updater, GitHub Releases; the feed is only electron-builder.yml's `publish`).
// NEVER FORCED: nothing downloads or installs unless the window asks for it; main only checks, downloads, installs.
// The backup before install is made by the window through the server's existing /api/backup (Updates tab), not here.
import { app, ipcMain } from 'electron'
import electronUpdater from 'electron-updater'
import { channelOf } from './update-channel.mjs'

const { autoUpdater } = electronUpdater

/** Wires the three IPC calls. `origin` is the app's own page; calls from any other frame are refused. */
export function initUpdater(getWin, origin) {
  if (!app.isPackaged) return // dev: no feed, nothing to update
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowDowngrade = false
  let found = false,
    downloaded = false
  const push = (ch, v) => getWin()?.webContents.send(ch, v)
  autoUpdater.on('download-progress', p => push('updater:progress', Math.round(p.percent)))
  autoUpdater.on('error', e => push('updater:state', { state: 'error', message: String(e?.message ?? e) }))

  const own = e => {
    try {
      return new URL(e.senderFrame?.url ?? '').origin === origin
    } catch {
      return false
    }
  }
  const guarded =
    fn =>
    async (e, ...a) => {
      if (!own(e)) throw new Error('refused')
      return fn(...a)
    }
  ipcMain.handle(
    'updater:check',
    guarded(async channel => {
      const c = channelOf(channel) // throws on anything but 'latest' | 'beta'
      autoUpdater.channel = c
      autoUpdater.allowPrerelease = c === 'beta' // Testing = GitHub prereleases
      const r = await autoUpdater.checkForUpdates()
      found = !!r?.isUpdateAvailable
      downloaded = false
      return { state: found ? 'available' : 'current', version: found ? r.updateInfo.version : app.getVersion() }
    }),
  )
  ipcMain.handle(
    'updater:download',
    guarded(async () => {
      if (!found) throw new Error('check for updates first')
      await autoUpdater.downloadUpdate()
      downloaded = true
      return { state: 'downloaded' }
    }),
  )
  ipcMain.handle(
    'updater:install',
    guarded(async () => {
      if (!downloaded) throw new Error('nothing downloaded')
      autoUpdater.quitAndInstall(false, true)
    }),
  )
}

// CommonJS: a sandboxed preload can't be ESM. The per-launch secret is added to the window's requests by the main process
// (webRequest.onBeforeSendHeaders), so nothing here or in the page can read it. The only thing exposed is the updater below:
// fixed channels, no generic ipcRenderer, no URL or path from the page.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- a sandboxed preload is CommonJS
const { contextBridge, ipcRenderer } = require('electron')

const listen = ch => cb => {
  const f = (_e, v) => cb(v)
  ipcRenderer.on(ch, f)
  return () => ipcRenderer.removeListener(ch, f)
}
contextBridge.exposeInMainWorld('updater', {
  check: channel => ipcRenderer.invoke('updater:check', channel),
  download: () => ipcRenderer.invoke('updater:download'),
  install: () => ipcRenderer.invoke('updater:install'),
  onState: listen('updater:state'),
  onProgress: listen('updater:progress'),
})

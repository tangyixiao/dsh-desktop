import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { startDshServer, type DshServer } from './runtime.js'

let server: DshServer | undefined

async function createWindow(): Promise<void> {
  server = await startDshServer({
    profile: 'web', preferredPort: 3080, host: '0.0.0.0',
    dshHome: join(app.getPath('userData'), 'dsh-home'),
  })
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
    },
  })
  await window.loadURL(server.localUrl)
  window.on('closed', () => { void server?.stop(); server = undefined })
}

ipcMain.handle('dsh:server-info', () => server ? {
  port: server.port, localUrl: server.localUrl, lanUrls: server.lanUrls,
} : undefined)
ipcMain.handle('dsh:open-external', (_event, url: unknown) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('only http(s) URLs may be opened')
  return shell.openExternal(url)
})

app.whenReady().then(createWindow).catch((error) => {
  console.error(error)
  app.quit()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { void server?.stop() })

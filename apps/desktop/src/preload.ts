import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  getServerInfo: () => ipcRenderer.invoke('dsh:server-info'),
  openExternal: (url: string) => ipcRenderer.invoke('dsh:open-external', url),
})

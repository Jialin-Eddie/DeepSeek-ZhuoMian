import { contextBridge, ipcRenderer } from 'electron'

const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
  },
  getBackendPort: (): Promise<number> => ipcRenderer.invoke('backend:port'),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  /** 便签浮层删除一条（页面 world 调用） */
  stashDelete: (id: string): Promise<boolean> => ipcRenderer.invoke('stash:delete', id),
  /** 便签浮层关闭时通知主进程复位状态 */
  stashClosed: (): Promise<boolean> => ipcRenderer.invoke('stash:closed'),
  /** /btw 旁注：保存到本机，不发给模型 */
  btwNote: (note: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('btw:note', note),
}

contextBridge.exposeInMainWorld('dshDesktop', api)

export type DshDesktopApi = typeof api

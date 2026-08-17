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
  /** 页面侧诊断日志（写入 ~/.dsh/stash/diag.log，失败不影响功能） */
  diagLog: (msg: string): Promise<boolean> => ipcRenderer.invoke('diag:log', msg),
  /** /checkpoint 保存检查点（本机书签：会话 + seq + 名字） */
  checkpointSave: (input: { name: string }): Promise<{ ok: boolean }> => ipcRenderer.invoke('checkpoint:save', input),
  /** 列出当前工作区的检查点 */
  checkpointList: (): Promise<{ items: Array<{ id: string; name: string; sessionId: string; atSeq: number; preview: string; createdAt: number }> }> =>
    ipcRenderer.invoke('checkpoint:list'),
  /** 删除一个检查点 */
  checkpointDelete: (id: string): Promise<boolean> => ipcRenderer.invoke('checkpoint:delete', id),
}

contextBridge.exposeInMainWorld('dshDesktop', api)

export type DshDesktopApi = typeof api

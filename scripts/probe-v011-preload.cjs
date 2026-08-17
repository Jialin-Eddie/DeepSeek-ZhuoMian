// 探针专用桩 preload：模拟 window.dshDesktop，把调用记录发回探针主进程
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  versions: { electron: process.versions.electron, node: process.versions.node },
  getBackendPort: () => ipcRenderer.invoke('probe:record', { kind: 'getBackendPort' }),
  pickFolder: () => ipcRenderer.invoke('probe:record', { kind: 'pickFolder' }),
  stashDelete: (id) => ipcRenderer.invoke('probe:record', { kind: 'stashDelete', id }),
  stashClosed: () => ipcRenderer.invoke('probe:record', { kind: 'stashClosed' }),
  btwNote: (note) => ipcRenderer.invoke('probe:record', { kind: 'btwNote', note }),
  diagLog: (msg) => ipcRenderer.invoke('probe:record', { kind: 'diagLog', msg }),
  checkpointSave: (input) => ipcRenderer.invoke('probe:record', { kind: 'checkpointSave', input }),
  checkpointList: () => ipcRenderer.invoke('probe:record', { kind: 'checkpointList' }),
  checkpointDelete: (id) => ipcRenderer.invoke('probe:record', { kind: 'checkpointDelete', id }),
})

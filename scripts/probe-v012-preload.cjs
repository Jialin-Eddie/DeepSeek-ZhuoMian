// 探针 preload 桩：模拟 dshDesktop.reference* 等桥接，供 REFERENCE_SCRIPT 探针测试
// referenceList 维护内存列表（add 后能查到），复制按钮才有内容可复制
const { contextBridge, ipcRenderer } = require('electron')

const refs = []
let seq = 0

contextBridge.exposeInMainWorld('dshDesktop', {
  referenceAdd: (input) => {
    seq++
    const item = { id: 'probe-ref-' + seq, createdAt: Date.now(), ...input }
    refs.unshift(item)
    ipcRenderer.invoke('probe:record', { kind: 'referenceAdd', input })
    return Promise.resolve({ ok: true, item })
  },
  referenceList: () => Promise.resolve({ items: refs.slice() }),
  referenceDelete: (id) => {
    const i = refs.findIndex((r) => r.id === id)
    if (i >= 0) refs.splice(i, 1)
    return Promise.resolve(i >= 0)
  },
  checkpointList: () => Promise.resolve({ items: [] }),
  checkpointSave: (input) => ipcRenderer.invoke('probe:record', { kind: 'checkpointSave', input }),
  checkpointDelete: () => Promise.resolve(true),
  btwNote: (note) => ipcRenderer.invoke('probe:record', { kind: 'btwNote', note }),
  diagLog: (msg) => ipcRenderer.invoke('probe:record', { kind: 'diagLog', msg }),
  stashDelete: () => Promise.resolve(true),
  stashClosed: () => Promise.resolve(true),
})

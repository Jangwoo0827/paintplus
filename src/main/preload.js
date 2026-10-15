'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ready: () => ipcRenderer.invoke('app:ready'),
  setTitle: (t) => ipcRenderer.send('app:set-title', t),
  closeNow: () => ipcRenderer.send('app:close-now'),
  fullscreen: (on) => ipcRenderer.send('app:fullscreen', on),
  openDialog: (o) => ipcRenderer.invoke('dialog:open', o),
  saveDialog: (o) => ipcRenderer.invoke('dialog:save', o),
  writeFile: (p, data) => ipcRenderer.invoke('file:write', p, data),
  readFile: (p) => ipcRenderer.invoke('file:read', p),
  readClipboardImage: () => ipcRenderer.invoke('clipboard:readImage'),
  writeClipboardImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  writeRecovery: (data) => ipcRenderer.invoke('recovery:write', data),
  readRecovery: () => ipcRenderer.invoke('recovery:read'),
  clearRecovery: () => ipcRenderer.invoke('recovery:clear'),
  message: (o) => ipcRenderer.invoke('app:message', o),
  pathForFile: (f) => {
    try { return webUtils.getPathForFile(f); } catch (_) { return ''; }
  },
  onCloseRequest: (cb) => ipcRenderer.on('app:close-request', () => cb()),
  onOpenFile: (cb) => ipcRenderer.on('app:open-file', (_e, p) => cb(p)),
});

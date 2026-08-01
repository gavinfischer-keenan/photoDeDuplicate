'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure IPC bridge — exposes only typed methods to the renderer process.
 * No raw access to ipcRenderer, Node.js APIs, or the filesystem.
 */
contextBridge.exposeInMainWorld('api', {
  /** Opens a native folder picker and returns { folderPath, hasSubfolders }. */
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

  /** Starts a duplicate scan with the given options. Results arrive via onComplete/onError. */
  startScan: (options) => ipcRenderer.invoke('scan:start', options),

  /** Opens a folder in the system file explorer. */
  openFolder: (folderPath) => ipcRenderer.invoke('shell:open-folder', folderPath),

  /** Registers a callback for scan progress updates. */
  onProgress: (callback) => {
    ipcRenderer.on('scan:progress', (_event, data) => callback(data));
  },

  /** Registers a callback for scan completion. */
  onComplete: (callback) => {
    ipcRenderer.on('scan:complete', (_event, data) => callback(data));
  },

  /** Registers a callback for scan errors. */
  onError: (callback) => {
    ipcRenderer.on('scan:error', (_event, data) => callback(data));
  },

  /** Removes all scan-related event listeners (call before re-scanning). */
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('scan:progress');
    ipcRenderer.removeAllListeners('scan:complete');
    ipcRenderer.removeAllListeners('scan:error');
  },
});

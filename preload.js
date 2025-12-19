const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  runScript: (s) => ipcRenderer.invoke('run-script', s),
  stopScript: (id) => ipcRenderer.invoke('stop-script', id),
  hashcatShow: (mode) => ipcRenderer.invoke('hashcat-show', mode),
  pickAndExtract: () => ipcRenderer.invoke('pick-and-extract'),
  johnCrack: (hash, mode, wordlist) => ipcRenderer.invoke('john-crack', hash, mode, wordlist),
  onOutput: (cb) => ipcRenderer.on('run-output', (_, data) => cb(data))
});
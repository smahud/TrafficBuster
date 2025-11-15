/*
  preload.js
  Jembatan aman antara UI dan Main Process.
  
  PERUBAHAN (Tugas 37):
  - Mengubah 'sendStartSignal' menjadi 'invoke' dan menerima 'token'.
  - Mengubah 'sendStopSignal' menjadi 'invoke' dan menerima 'token'.
*/
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Membuka dialog file
  openFile: (filters) => ipcRenderer.invoke('dialog:openFile', filters),
  
  // Membaca file
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),

  // Tes proxy
  testProxy: (proxyConfig, timeout) => ipcRenderer.invoke('proxy:test', proxyConfig, timeout),

  // Menyimpan file
  saveFile: (fileContent, filters) => ipcRenderer.invoke('dialog:saveFile', fileContent, filters),

  // Cek status job
  getJobStatus: () => ipcRenderer.invoke('get-job-status'),
  
  // Mengirim mode (Dev/Prod) ke main.js
  setRunMode: (isDev) => ipcRenderer.send('set-run-mode', isDev),

  // ** PERUBAHAN (Tugas 37): Mengirim sinyal "Start" (Async) **
  sendStartSignal: (configJson, token) => ipcRenderer.invoke('start-traffic', configJson, token),
  
  // ** PERUBAHAN (Tugas 37): Mengirim sinyal "Stop" (Async) **
  sendStopSignal: (token) => ipcRenderer.invoke('stop-traffic', token),
  
  // Menerima log (Teks)
  onUpdateLog: (callback) => ipcRenderer.on('update-log', (event, value) => callback(value)),
  
  // Menerima data (JSON)
  onDataUpdate: (callback) => ipcRenderer.on('data-update', (event, data) => callback(data))
});
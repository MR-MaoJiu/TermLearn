import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { callAi, listModels, streamAi } from './ai';
import { clearApiKey, getKeyStatus, readAppData, saveApiKey, writeAppData } from './store';
import type { AiProvider, AiRequest, AppData } from './types';

const isDev = !app.isPackaged;

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#050807',
    title: 'TermLearn',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    window.loadURL('http://127.0.0.1:5173');
  } else {
    window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('data:get', () => readAppData());
  ipcMain.handle('data:save', (_event, data: AppData) => writeAppData(data));
  ipcMain.handle('key:status', (_event, provider: AiProvider) => getKeyStatus(provider));
  ipcMain.handle('key:save', (_event, provider: AiProvider, key: string) => saveApiKey(provider, key));
  ipcMain.handle('key:clear', (_event, provider: AiProvider) => clearApiKey(provider));
  ipcMain.handle('models:list', (_event, provider: AiProvider) => listModels(provider));
  ipcMain.handle('ai:request', (_event, request: AiRequest) => callAi(request));
  ipcMain.handle('ai:stream', (event, streamId: string, request: AiRequest) =>
    streamAi(request, (chunk) => {
      event.sender.send(`ai:stream:chunk:${streamId}`, chunk);
    })
  );

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

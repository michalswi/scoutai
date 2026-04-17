import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as remote from '@electron/remote/main';
import { startApiServer } from './api-server';

// Initialize remote module
remote.initialize();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: 'OSM Search & Shell Executor'
  });

  // Enable remote module for this window
  remote.enable(mainWindow.webContents);

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // # DevTools
  // Open DevTools in development (optional)
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  app.userAgentFallback = 'scoutai/1.1.0 (https://github.com/michalswi/scoutai)';
  createWindow();

  // Start owrap API server
  const appPath = app.isPackaged ? path.dirname(app.getAppPath()) : process.cwd();
  startApiServer(() => mainWindow, appPath);

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


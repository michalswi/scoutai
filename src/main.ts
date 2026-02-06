import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as remote from '@electron/remote/main';

// Initialize remote module
remote.initialize();

function createWindow() {
  const mainWindow = new BrowserWindow({
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

  // # DevTools
  // Open DevTools in development (optional)
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
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

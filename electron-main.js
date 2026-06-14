import { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut, Menu, MenuItem } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Fix userData path so IndexedDB has a stable, writable location ────────────
// This prevents the "Could not open quota database" crash on first launch.
let userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Forge');
if (process.env.NODE_ENV === 'development') {
  userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Forge_dev');
}
app.setPath('userData', userDataPath);

let mainWindow = null;

// Helper for safe documents path fallback (e.g. if OneDrive redirection is broken)
function getSafeDocumentsPath() {
  try {
    return app.getPath('documents');
  } catch (err) {
    console.warn('Failed to get documents path, trying home directory...', err);
    try {
      return app.getPath('home');
    } catch (err2) {
      console.warn('Failed to get home path, trying temp directory...', err2);
      return app.getPath('temp');
    }
  }
}

// Register IPC handlers for file system access
ipcMain.handle('get-documents-path', () => {
  try {
    return getSafeDocumentsPath();
  } catch (err) {
    console.error('Error in get-documents-path handler:', err);
    throw err;
  }
});

ipcMain.handle('select-file', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog({
      title: options?.title || 'Open Forge Project',
      defaultPath: getSafeDocumentsPath(),
      filters: [
        { name: 'Forge Project Files', extensions: ['forge'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath, 'utf-8');
    return { filePath, data };
  } catch (err) {
    console.error('Error in select-file handler:', err);
    throw new Error('Failed to read file: ' + err.message);
  }
});

ipcMain.handle('save-new-file', async (event, options) => {
  try {
    const defaultPath = path.join(getSafeDocumentsPath(), options?.defaultName || 'project.forge');
    const result = await dialog.showSaveDialog({
      title: options?.title || 'Create Forge Project',
      defaultPath: defaultPath,
      filters: [
        { name: 'Forge Project Files', extensions: ['forge'] }
      ]
    });
    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  } catch (err) {
    console.error('Error in save-new-file handler:', err);
    throw new Error('Failed to create project file: ' + err.message);
  }
});

ipcMain.handle('write-file', async (event, { filePath, data }) => {
  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error in write-file handler:', err);
    throw new Error('Failed to write file: ' + err.message);
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('Error in read-file handler:', err);
    throw new Error('Failed to read file: ' + err.message);
  }
});

ipcMain.handle('read-local-updates', async () => {
  const prodPath = path.join(__dirname, 'dist/updates.json');
  const devPath = path.join(__dirname, 'public/updates.json');
  let targetPath = prodPath;
  if (!fs.existsSync(prodPath)) {
    targetPath = devPath;
  }
  try {
    const content = fs.readFileSync(targetPath, 'utf-8');
    return JSON.parse(content);
  } catch (err) {
    throw new Error('Failed to read local updates: ' + err.message);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Helper to download a file, automatically following HTTP redirects
function downloadFile(url, fileStream, onProgress, onComplete, onError, redirectCount = 0) {
  if (redirectCount > 5) {
    onError(new Error('Too many redirects.'));
    return;
  }

  const client = url.startsWith('https://') ? https : http;

  client.get(url, (response) => {
    // Handle HTTP Redirects
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      downloadFile(response.headers.location, fileStream, onProgress, onComplete, onError, redirectCount + 1);
      return;
    }

    if (response.statusCode !== 200) {
      onError(new Error(`Failed to download: HTTP ${response.statusCode}`));
      return;
    }

    const totalSize = parseInt(response.headers['content-length'], 10) || 0;
    let downloaded = 0;

    response.on('data', (chunk) => {
      downloaded += chunk.length;
      const progress = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
      onProgress(progress);
    });

    response.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close(() => {
        onComplete();
      });
    });
  }).on('error', (err) => {
    onError(err);
  });
}

// IPC handler to download an update file and automatically launch it
ipcMain.handle('download-and-update', async (event, { url, version }) => {
  const tempDir = app.getPath('temp');
  const fileName = `Forge-Setup-${version}.exe`;
  const filePath = path.join(tempDir, fileName);

  return new Promise((resolve, reject) => {
    // Fallback: If we have a local built installer, copy it to mock the download!
    const localDir = path.join(__dirname, 'dist-electron');
    const possibleNames = [
      `Forge Setup ${version}.exe`,
      `Forge-Setup-${version}.exe`,
      `Forge Setup 0.1.6-alpha.exe`,
      `Forge-Setup-0.1.4-alpha.exe`
    ];
    let localPath = null;
    for (const name of possibleNames) {
      const p = path.join(localDir, name);
      if (fs.existsSync(p)) {
        localPath = p;
        break;
      }
    }

    if (localPath) {
      console.log(`Mocking update download using local file: ${localPath}`);
      const stat = fs.statSync(localPath);
      const totalSize = stat.size;
      let downloaded = 0;

      const readStream = fs.createReadStream(localPath);
      const fileStream = fs.createWriteStream(filePath);

      readStream.on('data', (chunk) => {
        downloaded += chunk.length;
        const progress = totalSize ? Math.round((downloaded / totalSize) * 100) : 0;
        event.sender.send('update-progress', progress);
      });

      readStream.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(async () => {
          try {
            await shell.openPath(filePath);
            setTimeout(() => {
              app.quit();
            }, 1000);
            resolve({ success: true, path: filePath });
          } catch (err) {
            reject(new Error(`Failed to open installer: ${err.message}`));
          }
        });
      });

      readStream.on('error', (err) => {
        fileStream.destroy();
        fs.unlink(filePath, () => {});
        reject(err);
      });
      return;
    }

    // Check if the URL is valid
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      reject(new Error('Invalid update download URL. Must use HTTP or HTTPS.'));
      return;
    }

    const fileStream = fs.createWriteStream(filePath);

    downloadFile(
      url,
      fileStream,
      (progress) => {
        event.sender.send('update-progress', progress);
      },
      async () => {
        try {
          await shell.openPath(filePath);
          // Wait 1 second and exit the app so the installer can overwrite the files without lock issues
          setTimeout(() => {
            app.quit();
          }, 1000);
          resolve({ success: true, path: filePath });
        } catch (err) {
          reject(new Error(`Failed to open installer: ${err.message}`));
        }
      },
      (err) => {
        fileStream.destroy();
        fs.unlink(filePath, () => {});
        reject(err);
      }
    );
  });
});

let quickCaptureWindow = null;

function createQuickCaptureWindow() {
  if (quickCaptureWindow) {
    quickCaptureWindow.focus();
    return;
  }

  quickCaptureWindow = new BrowserWindow({
    width: 500,
    height: 380,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#0a0812',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    }
  });

  registerContextMenu(quickCaptureWindow);

  if (process.env.NODE_ENV === 'development') {
    quickCaptureWindow.loadURL('http://localhost:5173/#/quick-capture');
  } else {
    quickCaptureWindow.loadFile(path.join(__dirname, 'dist/index.html'), { hash: '/quick-capture' });
  }

  quickCaptureWindow.once('ready-to-show', () => {
    quickCaptureWindow.show();
  });

  quickCaptureWindow.on('blur', () => {
    quickCaptureWindow.close();
  });

  quickCaptureWindow.on('closed', () => {
    quickCaptureWindow = null;
  });
}

// IPC handler to close quick capture window
ipcMain.on('close-quick-capture', () => {
  if (quickCaptureWindow) {
    quickCaptureWindow.close();
  }
});

// Helper to register context menu with spelling suggestions & standard edit actions
function registerContextMenu(win) {
  if (!win) return;
  win.webContents.on('context-menu', (event, params) => {
    const menu = new Menu();

    // Spellcheck suggestions
    if (params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.append(new MenuItem({
          label: suggestion,
          click: () => win.webContents.replaceMisspelling(suggestion)
        }));
      }
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Add to dictionary
    if (params.misspelledWord) {
      menu.append(new MenuItem({
        label: `Add "${params.misspelledWord}" to Dictionary`,
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Standard edit actions
    if (params.editFlags.canCut) {
      menu.append(new MenuItem({ label: 'Cut', role: 'cut' }));
    }
    if (params.editFlags.canCopy) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }));
    }
    if (params.editFlags.canPaste) {
      menu.append(new MenuItem({ label: 'Paste', role: 'paste' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window: win });
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Forge — Creative Universe Builder',
    icon: path.join(__dirname, 'build/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0812',
      symbolColor: '#e5a93b',
      height: 32
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      // Disable sandbox so IndexedDB works reliably with local files
      sandbox: false,
      webSecurity: true,
    },
    backgroundColor: '#0a0812',
    show: false, // Don't show until ready-to-show to avoid flash
  });

  registerContextMenu(mainWindow);

  // Show window gracefully once content is loaded
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Pipe renderer console messages to Node terminal in dev mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      console.log(`[Renderer Console] (Level ${level}) ${message} at ${path.basename(sourceId)}:${line}`);
    });
  }

  // Check running environment
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in dev mode for debugging
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  // Register Quick Capture global hotkey
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    createQuickCaptureWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

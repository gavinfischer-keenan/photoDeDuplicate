'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { scanFolder, checkForSubfolders } = require('./scanner');
const { createOutputFolder, moveDuplicates } = require('./fileManager');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 720,
    minWidth: 700,
    minHeight: 520,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    title: 'PhotoDeDuplicate',
    backgroundColor: '#0f0f1a',
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── IPC Handlers ─────────────────────────────────────────────────────────

/**
 * Opens a native folder-picker dialog and checks for subfolders.
 */
ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Folder to Scan for Duplicates',
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { folderPath: null, hasSubfolders: false };
  }

  const folderPath = result.filePaths[0];
  const hasSubfolders = checkForSubfolders(folderPath);

  return { folderPath, hasSubfolders };
});

/**
 * Runs the duplicate scan and moves detected duplicates.
 */
ipcMain.handle('scan:start', async (event, options) => {
  const { folderPath, mode, threshold } = options;

  try {
    // 1. Scan for duplicates (sends progress events to renderer)
    const results = await scanFolder(
      folderPath,
      { mode, threshold },
      (progress) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('scan:progress', progress);
        }
      }
    );

    // 2. Collect all duplicates for moving
    const allDuplicates = [
      ...results.exactDuplicates.map((d) => ({ filePath: d.filePath, reason: 'exact' })),
      ...results.perceptualDuplicates.map((d) => ({ filePath: d.filePath, reason: 'perceptual' })),
    ];

    // 3. If no duplicates found, report and return
    if (allDuplicates.length === 0) {
      mainWindow.webContents.send('scan:complete', {
        exactCount: 0,
        perceptualCount: 0,
        outputFolder: null,
        movedFiles: [],
        errors: [],
      });
      return;
    }

    // 4. Create timestamped output folder and move duplicates
    const outputFolder = await createOutputFolder(folderPath);
    const moveResults = await moveDuplicates(allDuplicates, outputFolder);

    mainWindow.webContents.send('scan:complete', {
      exactCount: results.exactDuplicates.length,
      perceptualCount: results.perceptualDuplicates.length,
      outputFolder,
      movedFiles: moveResults.movedFiles,
      errors: moveResults.errors,
    });
  } catch (err) {
    mainWindow.webContents.send('scan:error', { message: err.message });
  }
});

/**
 * Opens a folder in the native file explorer.
 */
ipcMain.handle('shell:open-folder', async (event, folderPath) => {
  await shell.openPath(folderPath);
});

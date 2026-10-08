const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const APP_STATE_FILE = path.join(app.getPath('userData'), 'student-ai-state.json');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 980,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0f172a',
    title: 'Student AI Desk',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function ensureStateFile() {
  if (!fs.existsSync(APP_STATE_FILE)) {
    const defaultState = {
      profile: {
        name: 'Student',
        major: 'Computer Science',
        year: 'Year 3',
      },
      currentSessionId: 'default-session',
      sessions: [
        {
          id: 'default-session',
          title: 'Welcome',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: 'welcome-msg',
              role: 'assistant',
              content: 'Welcome to Student AI Desk. Ask me to explain a concept, solve a math problem, or help with your study plan.',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      notes: [],
      tasks: [],
      settings: {
        provider: 'local',
        privacyMode: 'strict',
        enableWebSearch: true,
        enableCloudSync: false,
        allowExternalTools: true,
      },
    };
    fs.writeFileSync(APP_STATE_FILE, JSON.stringify(defaultState, null, 2), 'utf8');
  }
}

ipcMain.handle('load-app-state', async () => {
  ensureStateFile();
  try {
    const raw = fs.readFileSync(APP_STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return {
      profile: { name: 'Student', major: 'Computer Science', year: 'Year 3' },
      currentSessionId: 'default-session',
      sessions: [],
      notes: [],
      tasks: [],
      settings: {
        provider: 'local',
        privacyMode: 'strict',
        enableWebSearch: true,
        enableCloudSync: false,
        allowExternalTools: true,
      },
    };
  }
});

ipcMain.handle('save-app-state', async (_, state) => {
  fs.writeFileSync(APP_STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  return true;
});

ipcMain.handle('select-vault-path', async (event, kind) => {
  if (!['file', 'folder'].includes(kind)) return null;
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    properties: kind === 'folder' ? ['openDirectory'] : ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selectedPath = result.filePaths[0];
  return { path: selectedPath, name: path.basename(selectedPath) };
});

ipcMain.handle('open-vault-path', async (_, itemPath) => {
  if (typeof itemPath !== 'string' || !path.isAbsolute(itemPath)) return false;
  try {
    await fs.promises.access(itemPath, fs.constants.R_OK);
    const error = await shell.openPath(itemPath);
    return error.length === 0;
  } catch {
    return false;
  }
});

app.whenReady().then(() => {
  const start = async () => {
    if (app.isPackaged) {
      process.env.STUDENT_AI_DB_PATH = path.join(app.getPath('userData'), 'student-ai.db');
      const { startServer } = require('../server');
      await startServer({ port: 3001, host: '127.0.0.1' });
    }

    createWindow();
  };

  start().catch((error) => {
    const logPath = path.join(app.getPath('userData'), 'startup-errors.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${error.stack || error.message}\n`);
    console.error('Could not start Student AI Desk:', error);
    app.quit();
  });

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

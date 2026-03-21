import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { startSidecar, stopSidecar, SidecarInfo } from './sidecar'

let mainWindow: BrowserWindow | null = null
let sidecar: SidecarInfo | null = null

async function pickDataDir(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Ferrite — Select Data Folder',
    message: 'Choose a folder to store your connections, query history, and saved queries.',
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: app.getPath('documents')
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

async function createWindow(): Promise<void> {
  // Ask user to pick a data folder on every launch
  const dataDir = process.env['FERRITE_DATA_DIR'] || (await pickDataDir())
  if (!dataDir) {
    app.quit()
    return
  }

  console.log(`Data dir: ${dataDir}`)

  // Start the Rust sidecar with the chosen data dir
  try {
    sidecar = await startSidecar(dataDir)
    console.log(`Sidecar running on port ${sidecar.port}`)
  } catch (err) {
    console.error('Failed to start sidecar:', err)
    app.quit()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--ferrite-port=${sidecar.port}`,
        `--ferrite-token=${sidecar.token}`
      ]
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

app.on('will-quit', () => {
  if (sidecar) {
    stopSidecar(sidecar)
  }
})

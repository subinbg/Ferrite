import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { DEFAULT_MCP_PORT, startSidecar, stopSidecar, SidecarInfo } from './sidecar'
import { DesktopSettings, loadSettings, saveSettings } from './settings'

let mainWindow: BrowserWindow | null = null
let sidecar: SidecarInfo | null = null
let settings: DesktopSettings = { mcpEnabled: false }
let activeDataDir = ''
let isQuitting = false

interface SidecarRequest {
  path: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

interface ExportRequestBody {
  connection_id: string
  sql: string
  format: string
  options?: Record<string, unknown>
}

function getDesktopState() {
  return {
    dataDir: activeDataDir,
    mcpEnabled: settings.mcpEnabled,
    mcpUrl: settings.mcpEnabled ? `http://127.0.0.1:${DEFAULT_MCP_PORT}/mcp` : null
  }
}

async function pickDataDir(defaultPath?: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: 'Ferrite - Select Data Folder',
    message: 'Choose a folder to store your connections, query history, and saved queries.',
    buttonLabel: 'Open',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: defaultPath || app.getPath('documents')
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

async function pickSqliteFile(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Ferrite - Select SQLite Database',
    buttonLabel: 'Open',
    properties: ['openFile'],
    filters: [
      { name: 'SQLite databases', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: 'All files', extensions: ['*'] }
    ]
  }

  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

async function resolveInitialDataDir(): Promise<string | null> {
  if (process.env['FERRITE_DATA_DIR']) {
    return process.env['FERRITE_DATA_DIR']
  }
  if (settings.dataDir) {
    return settings.dataDir
  }
  const picked = await pickDataDir()
  if (picked) {
    settings = { ...settings, dataDir: picked }
    await saveSettings(settings)
  }
  return picked
}

async function startCurrentSidecar(): Promise<void> {
  console.log(`Data dir: ${activeDataDir}`)
  sidecar = await startSidecar({
    dataDir: activeDataDir,
    dev: is.dev,
    mcpEnabled: settings.mcpEnabled,
    mcpPort: DEFAULT_MCP_PORT
  })
  console.log(`Sidecar running on port ${sidecar.port}`)
}

async function restartSidecar(): Promise<void> {
  const previous = sidecar
  sidecar = null
  if (previous) {
    await stopSidecar(previous)
  }
  await startCurrentSidecar()
  mainWindow?.webContents.reload()
}

async function switchDataDir(): Promise<ReturnType<typeof getDesktopState>> {
  const picked = await pickDataDir(activeDataDir)
  if (!picked) {
    return getDesktopState()
  }

  activeDataDir = picked
  settings = { ...settings, dataDir: picked }
  await saveSettings(settings)
  await restartSidecar()
  return getDesktopState()
}

async function setMcpEnabled(enabled: boolean): Promise<ReturnType<typeof getDesktopState>> {
  if (settings.mcpEnabled === enabled) {
    return getDesktopState()
  }

  settings = { ...settings, mcpEnabled: enabled }
  await saveSettings(settings)
  await restartSidecar()
  installMenu()
  return getDesktopState()
}

function safeSidecarUrl(path: string): string {
  if (!sidecar) {
    throw new Error('Ferrite sidecar is not running')
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Invalid Ferrite API path')
  }
  return `http://127.0.0.1:${sidecar.port}${path}`
}

async function fetchSidecar({ path, method, body, headers }: SidecarRequest): Promise<Response> {
  if (!sidecar) {
    throw new Error('Ferrite sidecar is not running')
  }

  return fetch(safeSidecarUrl(path), {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sidecar.token}`,
      ...(headers || {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match?.[1] || fallback
}

function installIpcHandlers(): void {
  ipcMain.handle('ferrite:desktop-state', () => getDesktopState())

  ipcMain.handle('ferrite:switch-data-dir', async () => switchDataDir())

  ipcMain.handle('ferrite:set-mcp-enabled', async (_event, enabled: boolean) => {
    return setMcpEnabled(enabled)
  })

  ipcMain.handle('ferrite:pick-sqlite-file', async () => pickSqliteFile())

  ipcMain.handle('ferrite:request-json', async (_event, request: SidecarRequest) => {
    const response = await fetchSidecar(request)
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `HTTP ${response.status}`)
    }
    if (response.status === 204) {
      return undefined
    }
    return response.json()
  })

  ipcMain.handle('ferrite:download-export', async (_event, body: ExportRequestBody) => {
    const response = await fetchSidecar({
      path: '/api/export',
      method: 'POST',
      body
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(text || `Export failed: HTTP ${response.status}`)
    }

    const bytes = Buffer.from(await response.arrayBuffer())
    return {
      bytes,
      contentType: response.headers.get('content-type') || 'application/octet-stream',
      filename: filenameFromDisposition(response.headers.get('content-disposition'), 'export')
    }
  })
}

function openExternalSafely(url: string): void {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      shell.openExternal(url)
    }
  } catch {
    // Ignore malformed external URLs.
  }
}

function installMenu(): void {
  const appMenu: MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{
        label: app.name,
        submenu: [{ role: 'quit' as const }]
      }]
    : []

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...appMenu,
    {
      label: 'File',
      submenu: [
        {
          label: 'Switch Data Folder...',
          click: async () => {
            try {
              await switchDataDir()
            } catch (err) {
              dialog.showErrorBox('Ferrite', String(err))
            }
          }
        },
        {
          label: settings.mcpEnabled ? 'Disable MCP Server' : 'Enable MCP Server',
          click: async () => {
            try {
              await setMcpEnabled(!settings.mcpEnabled)
            } catch (err) {
              dialog.showErrorBox('Ferrite', String(err))
            }
          }
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]))
}

function installEditableContextMenu(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) {
      return
    }

    Menu.buildFromTemplate([
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { role: 'selectAll' }
    ]).popup({ window })
  })
}

async function createWindow(): Promise<void> {
  settings = await loadSettings()
  const dataDir = await resolveInitialDataDir()
  if (!dataDir) {
    app.quit()
    return
  }
  activeDataDir = dataDir

  try {
    await startCurrentSidecar()
  } catch (err) {
    console.error('Failed to start sidecar:', err)
    dialog.showErrorBox('Ferrite', `Failed to start the Ferrite sidecar:\n${String(err)}`)
    app.quit()
    return
  }

  installIpcHandlers()
  installMenu()

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
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Confirmation dialog on window close
  mainWindow.on('close', (e) => {
    if (isQuitting) {
      return
    }
    const result = dialog.showMessageBoxSync(mainWindow!, {
      type: 'question',
      buttons: ['Cancel', 'Close'],
      defaultId: 1,
      cancelId: 0,
      title: 'Close Ferrite',
      message: 'Closing Ferrite will terminate your session and disconnect all active databases.',
      detail: 'Any unsaved changes will be lost.'
    })
    if (result === 0) {
      e.preventDefault()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalSafely(details.url)
    return { action: 'deny' }
  })

  installEditableContextMenu(mainWindow)

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

app.on('before-quit', (event) => {
  if (!sidecar || isQuitting) {
    return
  }

  event.preventDefault()
  isQuitting = true
  const current = sidecar
  sidecar = null
  stopSidecar(current).finally(() => app.quit())
})

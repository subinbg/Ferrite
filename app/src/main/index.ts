import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { startSidecar, stopSidecar, SidecarInfo, mcpPort } from './sidecar'

let mainWindow: BrowserWindow | null = null
let sidecar: SidecarInfo | null = null
let settings = { mcpEnabled: true }
let activeDbPath = ''
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
}

function getDesktopState() {
  return {
    dbPath: activeDbPath,
    mcpEnabled: settings.mcpEnabled,
    mcpUrl: settings.mcpEnabled ? `http://127.0.0.1:${mcpPort()}/mcp` : null
  }
}

function cacheDirFor(dbPath: string): string {
  return join(dirname(dbPath), '.ferrite-cache')
}

// Point Chromium's session/disk cache at a Ferrite-owned directory. This MUST run before
// `app.whenReady()` — switching `sessionData` after the app is ready corrupts the on-disk
// cache structure (the "wrong file structure on disk" / "Unable to create cache" errors).
function configureSessionCache(): void {
  const dbFile = process.env['FERRITE_DB_FILE']
  if (!dbFile) {
    // First-run flow resolves the DB via a dialog after ready; keep Electron's default path.
    return
  }
  const cacheDir = cacheDirFor(dbFile)
  mkdirSync(cacheDir, { recursive: true })
  app.setPath('sessionData', cacheDir)
}

const DB_FILTERS = [
  { name: 'Ferrite database', extensions: ['db', 'sqlite', 'sqlite3'] },
  { name: 'All files', extensions: ['*'] }
]

async function pickExistingDb(defaultPath?: string): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Ferrite - Open Database',
    message: 'Select a Ferrite database file to open.',
    buttonLabel: 'Open',
    defaultPath: defaultPath || app.getPath('documents'),
    properties: ['openFile', 'createDirectory'],
    filters: DB_FILTERS
  }
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
}

async function createNewDb(defaultPath?: string): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: 'Ferrite - New Database',
    message: 'Choose where to create a new Ferrite database.',
    buttonLabel: 'Create',
    nameFieldLabel: 'Database',
    defaultPath: defaultPath || join(app.getPath('documents'), 'ferrite.db'),
    properties: ['createDirectory', 'showHiddenFiles'],
    filters: DB_FILTERS
  })

  if (result.canceled || !result.filePath) {
    return null
  }
  return result.filePath
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

async function resolveInitialDbPath(): Promise<string | null> {
  if (process.env['FERRITE_DB_FILE']) {
    return process.env['FERRITE_DB_FILE']
  }
  return (await pickExistingDb()) ?? (await createNewDb())
}

async function startCurrentSidecar(): Promise<void> {
  console.log(`Database file: ${activeDbPath}`)
  sidecar = await startSidecar({
    dbPath: activeDbPath,
    dev: is.dev,
    mcpEnabled: settings.mcpEnabled
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

async function switchDatabase(mode: 'open' | 'new' = 'open'): Promise<void> {
  const picked = mode === 'new'
    ? await createNewDb(activeDbPath)
    : await pickExistingDb(activeDbPath)
  if (!picked || picked === activeDbPath) {
    return
  }

  process.env['FERRITE_DB_FILE'] = picked
  app.relaunch()

  isQuitting = true
  const current = sidecar
  sidecar = null
  if (current) {
    await stopSidecar(current)
  }
  app.exit(0)
}

async function setMcpEnabled(enabled: boolean): Promise<ReturnType<typeof getDesktopState>> {
  if (settings.mcpEnabled === enabled) {
    return getDesktopState()
  }

  settings = { ...settings, mcpEnabled: enabled }
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

  ipcMain.handle('ferrite:switch-database', async () => switchDatabase())

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
          label: 'Open Database...',
          click: async () => {
            try {
              await switchDatabase('open')
            } catch (err) {
              dialog.showErrorBox('Ferrite', String(err))
            }
          }
        },
        {
          label: 'New Database...',
          click: async () => {
            try {
              await switchDatabase('new')
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
  const dbPath = await resolveInitialDbPath()
  if (!dbPath) {
    app.quit()
    return
  }
  activeDbPath = dbPath

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

configureSessionCache()
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

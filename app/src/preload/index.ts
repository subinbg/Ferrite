import { contextBridge, ipcRenderer } from 'electron'

interface SidecarRequest {
  path: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

const ferriteApi = {
  requestJson: <T>(request: SidecarRequest): Promise<T> =>
    ipcRenderer.invoke('ferrite:request-json', request),
  downloadExport: (body: {
    connection_id: string
    sql: string
    format: string
    options?: Record<string, unknown>
  }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> =>
    ipcRenderer.invoke('ferrite:download-export', body),
  getDesktopState: (): Promise<{
    dataDir: string
    mcpEnabled: boolean
    mcpUrl: string | null
  }> => ipcRenderer.invoke('ferrite:desktop-state'),
  switchDataDir: (): Promise<{
    dataDir: string
    mcpEnabled: boolean
    mcpUrl: string | null
  }> => ipcRenderer.invoke('ferrite:switch-data-dir'),
  setMcpEnabled: (enabled: boolean): Promise<{
    dataDir: string
    mcpEnabled: boolean
    mcpUrl: string | null
  }> => ipcRenderer.invoke('ferrite:set-mcp-enabled', enabled),
  pickSqliteFile: (): Promise<string | null> => ipcRenderer.invoke('ferrite:pick-sqlite-file')
}

contextBridge.exposeInMainWorld('ferrite', ferriteApi)

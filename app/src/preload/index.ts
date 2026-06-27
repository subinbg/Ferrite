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
  }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> =>
    ipcRenderer.invoke('ferrite:download-export', body),
  getDesktopState: (): Promise<{
    dbPath: string
    mcpEnabled: boolean
    mcpUrl: string | null
  }> => ipcRenderer.invoke('ferrite:desktop-state'),
  switchDatabase: (): Promise<void> => ipcRenderer.invoke('ferrite:switch-database'),
  setMcpEnabled: (enabled: boolean): Promise<{
    dbPath: string
    mcpEnabled: boolean
    mcpUrl: string | null
  }> => ipcRenderer.invoke('ferrite:set-mcp-enabled', enabled),
  pickSqliteFile: (): Promise<string | null> => ipcRenderer.invoke('ferrite:pick-sqlite-file')
}

contextBridge.exposeInMainWorld('ferrite', ferriteApi)

export interface FerriteApi {
  requestJson: <T>(request: {
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) => Promise<T>
  downloadExport: (body: {
    connection_id: string
    sql: string
  }) => Promise<{ bytes: Uint8Array; contentType: string; filename: string }>
  getDesktopState: () => Promise<DesktopState>
  switchDatabase: () => Promise<void>
  setMcpEnabled: (enabled: boolean) => Promise<DesktopState>
  pickSqliteFile: () => Promise<string | null>
}

export interface DesktopState {
  dbPath: string
  mcpEnabled: boolean
  mcpUrl: string | null
}

declare global {
  interface Window {
    ferrite: FerriteApi
  }
}

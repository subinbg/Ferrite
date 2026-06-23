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
    format: string
    options?: Record<string, unknown>
  }) => Promise<{ bytes: Uint8Array; contentType: string; filename: string }>
  getDesktopState: () => Promise<DesktopState>
  switchDataDir: () => Promise<DesktopState>
  setMcpEnabled: (enabled: boolean) => Promise<DesktopState>
  pickSqliteFile: () => Promise<string | null>
}

export interface DesktopState {
  dataDir: string
  mcpEnabled: boolean
  mcpUrl: string | null
}

declare global {
  interface Window {
    ferrite: FerriteApi
  }
}

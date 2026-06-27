export type DatabaseDialect = 'postgresql' | 'mysql' | 'sqlite'

export interface Connection {
  id: string
  name: string
  dialect: string
  host: string | null
  port: number | null
  database_name: string | null
  username: string | null
  ssl_mode: string
  color: string | null
  sort_order: number
  created_at: string
  updated_at: string
  connected: boolean
}

export interface ConnectionCreate {
  name: string
  dialect: DatabaseDialect
  host?: string
  port?: number
  database_name?: string
  username?: string
  password?: string
  ssl_mode?: string
  color?: string
}

export interface ConnectionUpdate {
  name?: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  password?: string
  ssl_mode?: string
  color?: string
  sort_order?: number
}

export interface ConnectionTestResult {
  ok: boolean
  message: string
  latency_ms: number
}

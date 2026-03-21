export interface QueryRequest {
  connection_id: string
  sql: string
  bind_variables?: Record<string, unknown>
  limit?: number
  offset?: number
  timeout_seconds?: number
}

export interface ColumnMeta {
  name: string
  type: string
  nullable: boolean
}

export interface QueryResult {
  execution_id: string
  columns: ColumnMeta[]
  rows: unknown[][]
  row_count: number
  total_count: number | null
  duration_ms: number
  truncated: boolean
}

export interface ExplainResult {
  raw_plan: unknown
  summary: {
    total_cost: number | null
    execution_time_ms: number | null
    nodes: unknown[]
  }
}

export interface HistoryEntry {
  id: string
  connection_id: string
  sql_text: string
  dialect: string
  status: string
  error_message: string | null
  row_count: number | null
  duration_ms: number | null
  executed_at: string
}

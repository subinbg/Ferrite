export interface Activity {
  id: string
  activity_type: 'query' | 'mcp_tool'
  source: 'ui' | 'mcp'
  connection_id: string | null
  tool_name: string | null
  request_text: string
  request_params: string | null
  status: 'success' | 'error'
  error_message: string | null
  result_summary: string | null
  row_count: number | null
  duration_ms: number | null
  executed_at: string
}

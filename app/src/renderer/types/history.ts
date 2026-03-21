export interface QueryVersion {
  id: string
  connection_id: string | null
  title: string
  sql_text: string
  version: number
  parent_id: string | null
  label: string | null
  notes: string | null
  created_at: string
}

export interface VersionDiff {
  left: { id: string; title: string; version: number; sql: string; created_at: string }
  right: { id: string; title: string; version: number; sql: string; created_at: string }
}

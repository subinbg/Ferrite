export interface TableInfo {
  schema: string
  name: string
  table_type: string
  estimated_row_count: number | null
}

export interface ColumnInfo {
  name: string
  data_type: string
  is_nullable: boolean
  column_default: string | null
  ordinal_position: number
  is_primary_key: boolean
}

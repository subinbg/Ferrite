import { useQuery } from '@tanstack/react-query'
import { api } from './client'
import type { TableInfo, ColumnInfo } from '../types/schema'

export function useSchemas(connectionId: string | null) {
  return useQuery({
    queryKey: ['schemas', connectionId],
    queryFn: () => api.get<string[]>(`/api/connections/${connectionId}/schemas`),
    enabled: !!connectionId
  })
}

export function useTables(connectionId: string | null, schema: string) {
  return useQuery({
    queryKey: ['tables', connectionId, schema],
    queryFn: () =>
      api.get<TableInfo[]>(`/api/connections/${connectionId}/tables?schema=${schema}`),
    enabled: !!connectionId
  })
}

export function useColumns(connectionId: string | null, schema: string, table: string) {
  return useQuery({
    queryKey: ['columns', connectionId, schema, table],
    queryFn: () =>
      api.get<ColumnInfo[]>(
        `/api/connections/${connectionId}/tables/${table}/columns?schema=${schema}`
      ),
    enabled: !!connectionId && !!table
  })
}

export interface FullSchema {
  tables: TableInfo[]
  columns_by_table: Record<string, ColumnInfo[]>
}

export function useFullSchema(connectionId: string | null, schema: string = 'public') {
  return useQuery({
    queryKey: ['full-schema', connectionId, schema],
    queryFn: () =>
      api.get<FullSchema>(
        `/api/connections/${connectionId}/full-schema?schema=${schema}`
      ),
    enabled: !!connectionId,
    staleTime: 30_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * attempt, 5000),
  })
}

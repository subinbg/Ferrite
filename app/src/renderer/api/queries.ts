import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { QueryRequest, QueryResult, ExplainResult, HistoryEntry } from '../types/query'

export function useExecuteQuery() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (req: QueryRequest) => api.post<QueryResult>('/api/query/execute', req),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] })
  })
}

export function useExplainQuery() {
  return useMutation({
    mutationFn: (req: QueryRequest) => api.post<ExplainResult>('/api/query/explain', req)
  })
}

export function useHistory(connectionId?: string, search?: string) {
  return useQuery({
    queryKey: ['history', connectionId, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (connectionId) params.set('connection_id', connectionId)
      if (search) params.set('search', search)
      params.set('limit', '100')
      return api.get<HistoryEntry[]>(`/api/history?${params}`)
    }
  })
}

export function useDeleteHistory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/history/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['history'] })
  })
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { QueryVersion } from '../types/history'

export function useVersions(search?: string) {
  return useQuery({
    queryKey: ['versions', search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      return api.get<QueryVersion[]>(`/api/versions?${params}`)
    }
  })
}

export function useCreateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { connection_id?: string; title: string; sql_text: string; parent_id?: string; label?: string; notes?: string }) =>
      api.post<QueryVersion>('/api/versions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions'] })
  })
}

export function useUpdateVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; label?: string; notes?: string }) =>
      api.put<QueryVersion>(`/api/versions/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions'] })
  })
}

export function useDeleteVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/versions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions'] })
  })
}

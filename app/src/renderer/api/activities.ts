import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Activity } from '../types/activity'

export function useActivities(typeFilter?: string, sourceFilter?: string, search?: string) {
  return useQuery({
    queryKey: ['activities', typeFilter, sourceFilter, search],
    queryFn: () => {
      const params = new URLSearchParams()
      if (typeFilter) params.set('type', typeFilter)
      if (sourceFilter) params.set('source', sourceFilter)
      if (search) params.set('search', search)
      params.set('limit', '200')
      return api.get<Activity[]>(`/api/activities?${params}`)
    },
    refetchInterval: 5000, // Poll every 5s for MCP activity
  })
}

export function useDeleteActivity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/activities/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activities'] })
  })
}

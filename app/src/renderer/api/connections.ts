import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'
import type { Connection, ConnectionCreate, ConnectionTestResult, ConnectionUpdate } from '../types/connection'

export function useConnections() {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get<Connection[]>('/api/connections')
  })
}

export function useCreateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: ConnectionCreate) => api.post<Connection>('/api/connections', data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useUpdateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ConnectionUpdate }) =>
      api.put<Connection>(`/api/connections/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/connections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (id: string) => api.post<ConnectionTestResult>(`/api/connections/${id}/test`)
  })
}

export function useConnectConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/connections/${id}/connect`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })
}

export function useDisconnectConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post(`/api/connections/${id}/disconnect`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['connections'] })
  })
}

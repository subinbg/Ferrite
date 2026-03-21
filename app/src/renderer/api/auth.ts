import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './client'

export interface VaultStatus {
  initialized: boolean
  unlocked: boolean
}

export function useVaultStatus() {
  return useQuery({
    queryKey: ['vault-status'],
    queryFn: () => api.get<VaultStatus>('/api/auth/status')
  })
}

export function useSetupVault() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (masterPassword: string) =>
      api.post('/api/auth/setup', { master_password: masterPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vault-status'] })
  })
}

export function useUnlockVault() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (masterPassword: string) =>
      api.post('/api/auth/unlock', { master_password: masterPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vault-status'] })
  })
}

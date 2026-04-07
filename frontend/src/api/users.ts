import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN' | 'SCORE_KEEPER'

export interface AppUser {
  id: string
  email: string
  role: UserRole
  organization_id: string | null
  is_active: boolean
  security_questions_configured: boolean
  assigned_tournament_ids: string[]
}

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN:        'Super Admin',
  ORG_ADMIN:          'Creatore',
  SCORE_KEEPER:       'Segnapunti',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  SUPER_ADMIN:        'Accesso completo a tutto il sistema',
  ORG_ADMIN:          'Può creare società e tornei',
  SCORE_KEEPER:       'Vede solo i tornei assegnati e inserisce risultati e ritardi',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  SUPER_ADMIN:        'bg-purple-100 text-purple-700',
  ORG_ADMIN:          'bg-blue-100 text-blue-700',
  SCORE_KEEPER:       'bg-green-100 text-green-700',
}

// Ruoli selezionabili nella UI (Super Admin e Segnapunti esclusi)
export const SELECTABLE_ROLES: UserRole[] = ['ORG_ADMIN', 'SCORE_KEEPER']

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await apiClient.get<AppUser[]>('/api/v1/admin/users')
      return res.data
    },
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { email: string; password: string; role: UserRole; organization_id?: string; assigned_tournament_ids?: string[] }) => {
      const res = await apiClient.post<AppUser>('/api/v1/admin/users', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{ role: UserRole; organization_id: string | null; is_active: boolean; assigned_tournament_ids: string[] }> }) => {
      const res = await apiClient.put<AppUser>(`/api/v1/admin/users/${id}`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      await apiClient.post(`/api/v1/admin/users/${id}/reset-password`, { password })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/admin/users/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

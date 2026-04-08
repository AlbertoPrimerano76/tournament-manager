import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface Field {
  id: string
  organization_id: string | null
  tournament_id: string | null
  name: string
  age_group: string | null
  address: string | null
  maps_url: string | null
  photo_url: string | null
  notes: string | null
}

export function useTournamentFields(tournamentId: string) {
  return useQuery({
    queryKey: ['fields', tournamentId],
    queryFn: async () => {
      const res = await apiClient.get<Field[]>(`/api/v1/admin/tournaments/${tournamentId}/fields`)
      return res.data
    },
    enabled: !!tournamentId,
  })
}

export function usePublicTournamentFields(slug: string) {
  return useQuery({
    queryKey: ['public-fields', slug],
    queryFn: async () => {
      const res = await apiClient.get<Field[]>(`/api/v1/tournaments/${slug}/fields`)
      return res.data
    },
    enabled: !!slug,
  })
}

export function useOrganizationFields(organizationId: string) {
  return useQuery({
    queryKey: ['organization-fields', organizationId],
    queryFn: async () => {
      const res = await apiClient.get<Field[]>(`/api/v1/admin/organizations/${organizationId}/fields`)
      return res.data
    },
    enabled: !!organizationId,
  })
}

export function useCreateField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: Omit<Field, 'id'>) => {
      const res = await apiClient.post<Field>('/api/v1/admin/fields', data)
      return res.data
    },
    onSuccess: (_, v) => {
      if (v.tournament_id) qc.invalidateQueries({ queryKey: ['fields', v.tournament_id] })
      if (v.organization_id) qc.invalidateQueries({ queryKey: ['organization-fields', v.organization_id] })
    },
  })
}

export function useUpdateField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tournamentId: _tId, data }: { id: string; organizationId?: string; tournamentId?: string; data: Partial<Omit<Field, 'id' | 'tournament_id' | 'organization_id'>> }) => {
      const res = await apiClient.put<Field>(`/api/v1/admin/fields/${id}`, data)
      return res.data
    },
    onSuccess: (_, v) => {
      if (v.tournamentId) qc.invalidateQueries({ queryKey: ['fields', v.tournamentId] })
      if (v.organizationId) qc.invalidateQueries({ queryKey: ['organization-fields', v.organizationId] })
    },
  })
}

export function useDeleteField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tournamentId: _tId }: { id: string; organizationId?: string; tournamentId?: string }) => {
      await apiClient.delete(`/api/v1/admin/fields/${id}`)
    },
    onSuccess: (_, v) => {
      if (v.tournamentId) qc.invalidateQueries({ queryKey: ['fields', v.tournamentId] })
      if (v.organizationId) qc.invalidateQueries({ queryKey: ['organization-fields', v.organizationId] })
    },
  })
}

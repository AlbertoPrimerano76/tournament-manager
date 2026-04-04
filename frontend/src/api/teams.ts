import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface Team {
  id: string
  organization_id: string
  name: string
  short_name: string | null
  logo_url: string | null
  city: string | null
  colors: { primary?: string; secondary?: string } | null
}

export interface TeamCreate {
  organization_id: string
  name: string
  short_name?: string
  logo_url?: string
  city?: string
}

export interface TeamUpdate {
  name?: string
  short_name?: string
  logo_url?: string
  city?: string
}

export interface TournamentTeamCreate {
  tournament_age_group_id: string
  team_id: string
  contact_name?: string
  contact_email?: string
  notes?: string
}

export function useAdminTeams(organizationId?: string) {
  return useQuery({
    queryKey: ['teams', organizationId ?? 'all'],
    queryFn: async () => {
      const params = organizationId ? { organization_id: organizationId } : {}
      const res = await apiClient.get<Team[]>('/api/v1/admin/teams', { params })
      return res.data
    },
  })
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: TeamCreate) => {
      const res = await apiClient.post<Team>('/api/v1/admin/teams', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  })
}

export function useUpdateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TeamUpdate }) => {
      const res = await apiClient.put<Team>(`/api/v1/admin/teams/${id}`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  })
}

export function useEnrollTournamentTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: TournamentTeamCreate) => {
      const res = await apiClient.post('/api/v1/admin/tournament-teams', data)
      return { data: res.data, ageGroupId: data.tournament_age_group_id }
    },
    onSuccess: ({ ageGroupId }) => {
      qc.invalidateQueries({ queryKey: ['age-group-participants', ageGroupId] })
    },
  })
}

export function useUnenrollTournamentTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ageGroupId }: { id: string; ageGroupId: string }) => {
      await apiClient.delete(`/api/v1/admin/tournament-teams/${id}`)
      return ageGroupId
    },
    onSuccess: (ageGroupId) => {
      qc.invalidateQueries({ queryKey: ['age-group-participants', ageGroupId] })
    },
  })
}

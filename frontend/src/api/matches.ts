import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import type { Match } from './tournaments'

export interface TodayMatchItem {
  id: string
  tournament_id: string
  tournament_name: string
  age_group_id: string
  age_group_name: string
  scheduled_at: string | null
  field_name: string | null
  field_number: number | null
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'BYE'
  home_label: string | null
  away_label: string | null
  home_score: number | null
  away_score: number | null
  home_tries: number | null
  away_tries: number | null
}

export function useTodayMatches() {
  return useQuery({
    queryKey: ['today-matches'],
    queryFn: async () => {
      const res = await apiClient.get<TodayMatchItem[]>('/api/v1/admin/matches/today')
      return res.data
    },
    refetchInterval: 30_000,
  })
}

export interface ScoreEntry {
  home_score?: number | null
  away_score?: number | null
  home_tries?: number
  away_tries?: number
  status?: string | null
  clear_result?: boolean
}

export interface MatchScheduleUpdate {
  scheduled_at?: string | null
  actual_end_at?: string | null
  delay_minutes?: number | null
  field_name?: string | null
  field_number?: number | null
  referee?: string | null
  notes?: string | null
  propagate_delay?: boolean
}

export interface BulkGroupScheduleUpdate {
  start_at?: string | null
  step_minutes?: number | null
  field_name?: string | null
  field_number?: number | null
  referee?: string | null
}

export function useEnterMatchScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, data }: { matchId: string; data: ScoreEntry }) => {
      const res = await apiClient.post<Match>(`/api/v1/admin/matches/${matchId}/score`, data)
      return res.data
    },
    onSuccess: (match) => {
      qc.invalidateQueries({ queryKey: ['age-group-matches'] })
      qc.invalidateQueries({ queryKey: ['age-group-standings'] })
      qc.invalidateQueries({ queryKey: ['age-group-program'] })
      qc.invalidateQueries({ queryKey: ['admin-age-group-program'] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
      qc.invalidateQueries({ queryKey: ['match', match.id] })
    },
  })
}

export function useUpdateMatchSchedule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, data }: { matchId: string; data: MatchScheduleUpdate }) => {
      const res = await apiClient.post<Match>(`/api/v1/admin/matches/${matchId}/schedule`, data)
      return res.data
    },
    onSuccess: (match) => {
      qc.invalidateQueries({ queryKey: ['age-group-matches'] })
      qc.invalidateQueries({ queryKey: ['age-group-program'] })
      qc.invalidateQueries({ queryKey: ['admin-age-group-program'] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
      qc.invalidateQueries({ queryKey: ['match', match.id] })
    },
  })
}

export function useBulkScheduleGroupMatches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, ageGroupId, data }: { groupId: string; ageGroupId: string; data: BulkGroupScheduleUpdate }) => {
      const res = await apiClient.post<{ updated: number }>(`/api/v1/admin/groups/${groupId}/bulk-schedule`, data)
      return { ...res.data, ageGroupId }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
    },
  })
}

export function useBulkSchedulePhaseMatches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ phaseId, ageGroupId, data }: { phaseId: string; ageGroupId: string; data: BulkGroupScheduleUpdate }) => {
      const res = await apiClient.post<{ updated: number }>(`/api/v1/admin/phases/${phaseId}/bulk-schedule`, data)
      return { ...res.data, ageGroupId }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
    },
  })
}

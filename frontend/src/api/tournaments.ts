import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

export interface Tournament {
  id: string
  organization_id: string
  organization_name: string | null
  organization_slug: string | null
  organization_logo_url: string | null
  name: string
  event_type: 'TOURNAMENT' | 'GATHERING'
  year: number
  slug: string
  edition: string | null
  start_date: string | null
  end_date: string | null
  location: string | null
  venue_map_url: string | null
  logo_url: string | null
  theme_primary_color: string | null
  theme_accent_color: string | null
  is_published: boolean
  sponsor_images: string[]
  description: string | null
}

export interface AgeGroup {
  id: string
  tournament_id: string
  age_group: string
  display_name: string | null
  structure_template_name: string | null
  structure_config: Record<string, unknown> | null
  scoring_rules: AgeGroupScoringRules
}

export interface AgeGroupScoringRules {
  win_points: number
  draw_points: number
  loss_points: number
  try_bonus?: boolean
  bonus_threshold?: number
  ranking_criteria: string[]
}

export interface AgeGroupCreate {
  tournament_id: string
  age_group: 'U6' | 'U8' | 'U10' | 'U12'
  display_name?: string
  scoring_rules?: AgeGroupScoringRules
}

export interface TournamentParticipant {
  id: string
  tournament_age_group_id: string
  team_id: string
  team_name: string
  team_short_name: string | null
  organization_id: string
  organization_name: string | null
  tournament_id: string | null
  is_tournament_team: boolean
  team_logo_url: string | null
  city: string | null
  contact_name: string | null
  contact_email: string | null
  notes: string | null
}

export interface GroupTeamMoveRequest {
  target_group_id: string
}

export interface MatchParticipantsUpdate {
  home_team_id?: string | null
  away_team_id?: string | null
}

export interface StructureTemplate {
  id: string
  name: string
  description: string | null
  organization_id: string | null
  age_group: string | null
  config: Record<string, unknown>
  is_system: boolean
}

export interface TournamentTemplate {
  id: string
  name: string
  description: string | null
  organization_id: string | null
  config: Record<string, unknown>
  is_system: boolean
}

export interface Match {
  id: string
  phase_id: string
  group_id: string | null
  bracket_round: string | null
  bracket_position: number | null
  home_team_id: string | null
  away_team_id: string | null
  scheduled_at: string | null
  actual_end_at: string | null
  field_name: string | null
  field_number: number | null
  status: string
  home_score: number | null
  away_score: number | null
  home_tries: number | null
  away_tries: number | null
  referee: string | null
  notes: string | null
}

export interface ProgramTeamSlot {
  team_id: string | null
  tournament_team_id: string | null
  label: string
  team_logo_url: string | null
  is_placeholder: boolean
}

export interface ProgramMatch {
  id: string
  phase_id: string
  phase_name: string
  phase_type: string
  group_id: string | null
  group_name: string | null
  bracket_round: string | null
  bracket_position: number | null
  scheduled_at: string | null
  actual_end_at: string | null
  status: string
  field_name: string | null
  field_number: number | null
  home_team_id: string | null
  away_team_id: string | null
  home_label: string
  away_label: string
  home_logo_url: string | null
  away_logo_url: string | null
  home_score: number | null
  away_score: number | null
  home_tries: number | null
  away_tries: number | null
  referee: string | null
  notes: string | null
}

export interface ProgramGroup {
  id: string
  name: string
  order: number
  teams: ProgramTeamSlot[]
  matches: ProgramMatch[]
}

export interface ProgramPhase {
  id: string
  name: string
  phase_type: string
  phase_order: number
  is_final_phase: boolean
  scheduled_date: string | null
  groups: ProgramGroup[]
  knockout_matches: ProgramMatch[]
}

export interface ProgramDay {
  date: string | null
  label: string
  phases: ProgramPhase[]
}

export interface AgeGroupProgram {
  age_group_id: string
  age_group: string
  display_name: string | null
  participant_count: number
  expected_teams: number | null
  hide_future_phases_until_complete: boolean
  generated: boolean
  days: ProgramDay[]
}

export interface TournamentProgram {
  tournament_id: string
  tournament_name: string
  age_groups: AgeGroupProgram[]
}

export interface StandingRow {
  team_id: string
  team_name?: string | null
  points: number
  played: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  goal_diff: number
  tries_for: number
  tries_against: number
  try_diff: number
  distance_km?: number | null
}

export interface AgeGroupStandingsPhase {
  phase_name: string
  phase_type: string
  is_final_phase?: boolean
  groups: Record<string, StandingRow[]>
  final_ranking?: Array<{
    position: number
    team_id: string | null
    team_name?: string | null
    bucket?: string | null
  }>
}

export type AgeGroupStandings = Record<string, AgeGroupStandingsPhase>

export function useTournaments(year?: number) {
  return useQuery({
    queryKey: ['tournaments', year],
    queryFn: async () => {
      const params = year ? { year } : {}
      const res = await apiClient.get<Tournament[]>('/api/v1/tournaments', { params })
      return res.data
    },
  })
}

/** Fetches active tournament: by slug if configured, otherwise first published one */
export function useActiveTournament(slug: string | null) {
  const bySlug = useQuery({
    queryKey: ['tournament', slug],
    queryFn: async () => {
      const res = await apiClient.get<Tournament>(`/api/v1/tournaments/${slug}`)
      return res.data
    },
    enabled: !!slug,
  })

  const firstPublished = useQuery({
    queryKey: ['tournaments-first'],
    queryFn: async () => {
      const res = await apiClient.get<Tournament[]>('/api/v1/tournaments')
      return res.data[0] ?? null
    },
    enabled: !slug,
  })

  return slug ? bySlug : { ...firstPublished, data: firstPublished.data ?? null }
}

export function useTournament(slug: string) {
  return useQuery({
    queryKey: ['tournament', slug],
    queryFn: async () => {
      const res = await apiClient.get<Tournament>(`/api/v1/tournaments/${slug}`)
      return res.data
    },
    enabled: !!slug,
  })
}

export function useTournamentAgeGroups(slug: string) {
  return useQuery({
    queryKey: ['tournament-age-groups', slug],
    queryFn: async () => {
      const res = await apiClient.get<AgeGroup[]>(`/api/v1/tournaments/${slug}/age-groups`)
      return res.data
    },
    enabled: !!slug,
  })
}

export function useTournamentProgram(slug: string) {
  return useQuery({
    queryKey: ['tournament-program', slug],
    queryFn: async () => {
      const res = await apiClient.get<TournamentProgram>(`/api/v1/tournaments/${slug}/program`)
      return res.data
    },
    enabled: !!slug,
  })
}

export function useAdminTournamentAgeGroups(tournamentId: string) {
  return useQuery({
    queryKey: ['admin-tournament-age-groups', tournamentId],
    queryFn: async () => {
      const res = await apiClient.get<AgeGroup[]>(`/api/v1/admin/tournaments/${tournamentId}/age-groups`)
      return res.data
    },
    enabled: !!tournamentId,
  })
}

export function useAgeGroupParticipants(ageGroupId: string) {
  return useQuery({
    queryKey: ['age-group-participants', ageGroupId],
    queryFn: async () => {
      const res = await apiClient.get<TournamentParticipant[]>(`/api/v1/admin/age-groups/${ageGroupId}/teams`)
      return res.data
    },
    enabled: !!ageGroupId,
  })
}

export function useAgeGroupProgram(ageGroupId: string) {
  return useQuery({
    queryKey: ['age-group-program', ageGroupId],
    queryFn: async () => {
      const res = await apiClient.get<AgeGroupProgram>(`/api/v1/age-groups/${ageGroupId}/program`)
      return res.data
    },
    enabled: !!ageGroupId,
  })
}

export function useAgeGroupStandings(ageGroupId: string) {
  return useQuery({
    queryKey: ['age-group-standings', ageGroupId],
    queryFn: async () => {
      const res = await apiClient.get<AgeGroupStandings>(`/api/v1/age-groups/${ageGroupId}/standings`)
      return res.data
    },
    enabled: !!ageGroupId,
  })
}

export function useAdminAgeGroupProgram(ageGroupId: string) {
  return useQuery({
    queryKey: ['admin-age-group-program', ageGroupId],
    queryFn: async () => {
      const res = await apiClient.get<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroupId}/program`)
      return res.data
    },
    enabled: !!ageGroupId,
  })
}

export function useStructureTemplates(ageGroup?: string, organizationId?: string) {
  return useQuery({
    queryKey: ['structure-templates', ageGroup ?? 'all', organizationId ?? 'all'],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (ageGroup) params.age_group = ageGroup
      if (organizationId) params.organization_id = organizationId
      const res = await apiClient.get<StructureTemplate[]>('/api/v1/admin/structure-templates', { params })
      return res.data
    },
  })
}

export function useTournamentTemplates(organizationId?: string) {
  return useQuery({
    queryKey: ['tournament-templates', organizationId ?? 'all'],
    queryFn: async () => {
      const params: Record<string, string> = {}
      if (organizationId) params.organization_id = organizationId
      const res = await apiClient.get<TournamentTemplate[]>('/api/v1/admin/tournament-templates', { params })
      return res.data
    },
  })
}

export function useAgeGroupMatches(ageGroupId: string) {
  return useQuery({
    queryKey: ['age-group-matches', ageGroupId],
    queryFn: async () => {
      const res = await apiClient.get<Match[]>(`/api/v1/age-groups/${ageGroupId}/matches`)
      return res.data
    },
    enabled: !!ageGroupId,
    refetchInterval: 30_000,
  })
}

export function useMatch(matchId: string) {
  return useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await apiClient.get<Match>(`/api/v1/matches/${matchId}`)
      return res.data
    },
    enabled: !!matchId,
  })
}

// ── Admin mutations ──────────────────────────────────────────────────────────

export interface TournamentCreate {
  organization_id: string
  name: string
  event_type: 'TOURNAMENT' | 'GATHERING'
  year: number
  slug: string
  edition?: string
  start_date?: string
  end_date?: string
  location?: string
  venue_map_url?: string
  logo_url?: string
  theme_primary_color?: string
  theme_accent_color?: string
  description?: string
  is_published: boolean
}

export interface TournamentUpdate extends Partial<TournamentCreate> {
  sponsor_images?: string[]
}

export const EVENT_TYPE_LABELS: Record<Tournament['event_type'], string> = {
  TOURNAMENT: 'Torneo',
  GATHERING: 'Raggruppamento',
}

export function useAdminTournaments() {
  return useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const res = await apiClient.get<Tournament[]>('/api/v1/admin/tournaments')
      return res.data
    },
  })
}

export function useCreateTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: TournamentCreate) => {
      const res = await apiClient.post<Tournament>('/api/v1/admin/tournaments', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] })
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      qc.invalidateQueries({ queryKey: ['tournaments-first'] })
    },
  })
}

export function useUpdateTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TournamentUpdate }) => {
      const res = await apiClient.put<Tournament>(`/api/v1/admin/tournaments/${id}`, data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] })
      qc.invalidateQueries({ queryKey: ['tournaments'] })
      qc.invalidateQueries({ queryKey: ['tournaments-first'] })
    },
  })
}

export function useDeleteTournament() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/admin/tournaments/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] })
    },
  })
}

export function useCreateAgeGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: AgeGroupCreate) => {
      const res = await apiClient.post<AgeGroup>('/api/v1/admin/age-groups', data)
      return res.data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-tournament-age-groups', vars.tournament_id] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
    },
  })
}

export function useDeleteAgeGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tournamentId }: { id: string; tournamentId: string }) => {
      await apiClient.delete(`/api/v1/admin/age-groups/${id}`)
      return tournamentId
    },
    onSuccess: (tournamentId) => {
      qc.invalidateQueries({ queryKey: ['admin-tournament-age-groups', tournamentId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
    },
  })
}

export function useUpdateAgeGroupStructure() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      structure_template_name,
      structure_config,
      tournamentId,
    }: {
      id: string
      structure_template_name?: string | null
      structure_config: Record<string, unknown>
      tournamentId: string
    }) => {
      const res = await apiClient.put<AgeGroup>(`/api/v1/admin/age-groups/${id}/structure`, {
        structure_template_name,
        structure_config,
      })
      return { data: res.data, tournamentId }
    },
    onSuccess: ({ data, tournamentId }) => {
      qc.invalidateQueries({ queryKey: ['admin-tournament-age-groups', tournamentId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
      qc.invalidateQueries({ queryKey: ['age-group-participants', data.id] })
    },
  })
}

export function useUpdateAgeGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      tournamentId,
      display_name,
      scoring_rules,
    }: {
      id: string
      tournamentId: string
      display_name?: string | null
      scoring_rules?: AgeGroupScoringRules
    }) => {
      const res = await apiClient.put<AgeGroup>(`/api/v1/admin/age-groups/${id}`, {
        display_name,
        scoring_rules,
      })
      return { data: res.data, tournamentId }
    },
    onSuccess: ({ data, tournamentId }) => {
      qc.invalidateQueries({ queryKey: ['admin-tournament-age-groups', tournamentId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
      qc.invalidateQueries({ queryKey: ['age-group-standings', data.id] })
    },
  })
}

export function useCreateStructureTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      description?: string
      organization_id?: string | null
      age_group?: string | null
      config: Record<string, unknown>
      is_system?: boolean
    }) => {
      const res = await apiClient.post<StructureTemplate>('/api/v1/admin/structure-templates', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['structure-templates'] })
    },
  })
}

export function useCreateTournamentTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      name: string
      description?: string
      organization_id?: string | null
      config: Record<string, unknown>
      is_system?: boolean
    }) => {
      const res = await apiClient.post<TournamentTemplate>('/api/v1/admin/tournament-templates', data)
      return res.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tournament-templates'] })
    },
  })
}

export function useGenerateAgeGroupProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ageGroupId: string) => {
      const res = await apiClient.post<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroupId}/generate-program`)
      return res.data
    },
    onSuccess: (_, ageGroupId) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
      qc.invalidateQueries({ queryKey: ['age-group-matches', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
    },
  })
}

export function useResetAndGenerateAgeGroupProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ageGroupId: string) => {
      const res = await apiClient.post<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroupId}/reset-and-generate-program`)
      return res.data
    },
    onSuccess: (_, ageGroupId) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
      qc.invalidateQueries({ queryKey: ['age-group-matches', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
    },
  })
}

export function useDeleteAgeGroupProgram() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ageGroupId: string) => {
      await apiClient.delete(`/api/v1/admin/age-groups/${ageGroupId}/program`)
      return ageGroupId
    },
    onSuccess: (_, ageGroupId) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
      qc.invalidateQueries({ queryKey: ['age-group-matches', ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-age-groups'] })
    },
  })
}

export function useRegenerateAgeGroupPhase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ageGroupId, phaseOrder }: { ageGroupId: string; phaseOrder: number }) => {
      const res = await apiClient.post<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroupId}/phases/${phaseOrder}/regenerate`)
      return res.data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-standings', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
    },
  })
}

export function useMoveAgeGroupTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ageGroupId, groupId, tournamentTeamId, data }: {
      ageGroupId: string
      groupId: string
      tournamentTeamId: string
      data: GroupTeamMoveRequest
    }) => {
      const res = await apiClient.post<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroupId}/groups/${groupId}/teams/${tournamentTeamId}/move`, data)
      return res.data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-standings', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
    },
  })
}

export function useUpdateMatchParticipants() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ matchId, data }: {
      matchId: string
      ageGroupId: string
      data: MatchParticipantsUpdate
    }) => {
      const res = await apiClient.put<AgeGroupProgram>(`/api/v1/admin/matches/${matchId}/participants`, data)
      return res.data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-program', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['age-group-standings', vars.ageGroupId] })
      qc.invalidateQueries({ queryKey: ['tournament-program'] })
    },
  })
}

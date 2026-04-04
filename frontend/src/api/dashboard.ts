import { useQuery } from '@tanstack/react-query'
import { apiClient } from './client'

export interface DashboardTournamentItem {
  id: string
  name: string
  slug: string
  organization_name: string | null
  start_date: string | null
  end_date: string | null
  is_published: boolean
  total_matches: number
  completed_matches: number
  today_matches: number
}

export interface DashboardSummary {
  role: string
  published_tournaments: number
  organizations_count: number
  matches_today: number
  total_matches: number
  completed_matches: number
  scheduled_matches: number
  in_progress_matches: number
  tournaments: DashboardTournamentItem[]
  quick_access_tournament_id: string | null
  quick_access_tournament_slug: string | null
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      const res = await apiClient.get<DashboardSummary>('/api/v1/admin/dashboard/summary')
      return res.data
    },
  })
}

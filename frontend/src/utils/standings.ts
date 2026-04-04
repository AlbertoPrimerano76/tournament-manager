export interface TeamStatsDisplay {
  team_id: string
  teamName?: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_diff: number
  points: number
}

export function formatGoalDiff(diff: number): string {
  if (diff > 0) return `+${diff}`
  return String(diff)
}

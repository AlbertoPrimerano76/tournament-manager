/**
 * Shared presentational components and pure helpers for AgeGroupPage.
 * Extracted to keep AgeGroupPage focused on data/state coordination.
 */
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { type ProgramMatch, type ProgramPhase, type StandingRow } from '@/api/tournaments'

// ---------------------------------------------------------------------------
// Small UI atoms
// ---------------------------------------------------------------------------

export function TeamLogo({ src, alt }: { src?: string | null; alt: string }) {
  if (!src) {
    return <span className="block h-7 w-7 shrink-0 rounded-full bg-slate-100" aria-hidden="true" />
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-7 w-7 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5"
    />
  )
}

// ---------------------------------------------------------------------------
// PublicMatchRow
// ---------------------------------------------------------------------------

export function PublicMatchRow({
  match,
  teamLogoMap,
  highlightedTeamId,
  backTo,
  backLabel,
}: {
  match: ProgramMatch
  teamLogoMap: Map<string, string>
  highlightedTeamId?: string
  backTo?: string
  backLabel?: string
}) {
  const homeLogo = match.home_logo_url || teamLogoMap.get(match.home_team_id ?? '') || null
  const awayLogo = match.away_logo_url || teamLogoMap.get(match.away_team_id ?? '') || null
  const highlightsHome = !!highlightedTeamId && match.home_team_id === highlightedTeamId
  const highlightsAway = !!highlightedTeamId && match.away_team_id === highlightedTeamId
  return (
    <Link
      to={`/partite/${match.id}`}
      state={{ backTo: backTo ?? '..', backLabel: backLabel ?? 'Categoria' }}
      className={`block rounded-2xl border p-3 transition-colors hover:border-slate-300 hover:bg-slate-100/70 ${
        highlightsHome || highlightsAway ? 'border-amber-200 bg-amber-50/70' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="mb-2 flex items-center justify-end gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-widest2 ${
          match.status === 'COMPLETED'
            ? 'bg-emerald-100 text-emerald-700'
            : match.status === 'IN_PROGRESS'
              ? 'bg-amber-100 text-amber-700'
              : match.status === 'CANCELLED' || match.status === 'POSTPONED'
                ? 'bg-red-100 text-red-600'
                : 'bg-slate-200 text-slate-600'
        }`}>
          {match.status === 'IN_PROGRESS' && (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" aria-hidden="true" />
          )}
          {match.status === 'COMPLETED'
            ? 'Finale'
            : match.status === 'IN_PROGRESS'
              ? 'In corso'
              : match.status === 'CANCELLED'
                ? 'Annullata'
                : match.status === 'POSTPONED'
                  ? 'Rinviata'
                  : 'Da giocare'}
          <span className="sr-only">{match.status === 'COMPLETED' ? 'Partita conclusa' : match.status === 'IN_PROGRESS' ? 'Partita in corso' : 'Partita da giocare'}</span>
        </span>
      </div>

      <div className="space-y-2">
        <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${highlightsHome ? 'bg-amber-100/80 ring-1 ring-amber-200' : 'bg-white'}`}>
          <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
            <TeamLogo src={homeLogo} alt={match.home_label} />
            <span className="truncate">{match.home_label}</span>
            {highlightsHome ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest2 text-amber-900">La tua</span> : null}
          </span>
          <span className="text-lg font-black text-slate-950">{match.home_score ?? '-'}</span>
        </div>
        <div className={`flex items-center justify-between gap-3 rounded-xl px-3 py-3 ${highlightsAway ? 'bg-amber-100/80 ring-1 ring-amber-200' : 'bg-white'}`}>
          <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
            <TeamLogo src={awayLogo} alt={match.away_label} />
            <span className="truncate">{match.away_label}</span>
            {highlightsAway ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest2 text-amber-900">La tua</span> : null}
          </span>
          <span className="text-lg font-black text-slate-950">{match.away_score ?? '-'}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-600 sm:grid-cols-3">
        <p><span className="font-semibold text-slate-900">Orario:</span> {match.scheduled_at ? format(new Date(match.scheduled_at), 'HH:mm', { locale: it }) : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Campo:</span> {match.field_name ? `${match.field_name}${match.field_number ? ` #${match.field_number}` : ''}` : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Arbitro:</span> {match.referee || 'Da definire'}</p>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// StandingsTable
// ---------------------------------------------------------------------------

export function StandingsTable({
  rows,
  teamNameMap,
  teamLogoMap,
  isFinalPhase = false,
  highlightedTeamId,
}: {
  rows: StandingRow[]
  teamNameMap: Map<string, string>
  teamLogoMap: Map<string, string>
  isFinalPhase?: boolean
  highlightedTeamId?: string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Classifica non ancora disponibile.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-widest2 text-slate-400">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Squadra</th>
            <th className="px-3 py-3" title="Punti">Pt</th>
            <th className="px-3 py-3 hidden sm:table-cell" title="Partite giocate">G</th>
            <th className="px-3 py-3" title="Vittorie">V</th>
            <th className="px-3 py-3 hidden sm:table-cell" title="Pareggi">N</th>
            <th className="px-3 py-3 hidden sm:table-cell" title="Sconfitte">P</th>
            <th className="px-3 py-3" title="Differenza punti">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.team_id} className={`border-b border-slate-100 last:border-b-0 ${row.team_id === highlightedTeamId ? 'bg-amber-50' : ''}`}>
              <td className="px-3 py-3 font-black text-slate-950">{index + 1}</td>
              <td className="px-3 py-3 font-semibold text-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo src={teamLogoMap.get(row.team_id)} alt={row.team_name ?? teamNameMap.get(row.team_id) ?? 'Squadra'} />
                    <span className="truncate">{row.team_name ?? teamNameMap.get(row.team_id) ?? row.team_id}</span>
                    {row.team_id === highlightedTeamId ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest2 text-amber-800">La tua</span> : null}
                  </div>
                  {isFinalPhase ? <span className="shrink-0 text-xs font-bold uppercase tracking-widest2 text-slate-400">{index + 1}°</span> : null}
                </div>
              </td>
              <td className="px-3 py-3 font-black text-slate-950">{row.points}</td>
              <td className="hidden px-3 py-3 text-slate-700 sm:table-cell">{row.played}</td>
              <td className="px-3 py-3 text-slate-700">{row.wins}</td>
              <td className="hidden px-3 py-3 text-slate-700 sm:table-cell">{row.draws}</td>
              <td className="hidden px-3 py-3 text-slate-700 sm:table-cell">{row.losses}</td>
              <td className="px-3 py-3 text-slate-700">{row.goal_diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PodiumGrid
// ---------------------------------------------------------------------------

export function PodiumGrid({
  rows,
  teamNameMap,
  teamLogoMap,
  highlightedTeamId,
}: {
  rows: Array<{ position?: number | null; team_id?: string | null; team_name?: string | null }>
  teamNameMap: Map<string, string>
  teamLogoMap: Map<string, string>
  highlightedTeamId?: string
}) {
  const topRows = rows.filter((row) => typeof row.position === 'number').slice(0, 3)
  if (topRows.length === 0) return null

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {topRows.map((row, index) => (
        <div
          key={`podium-${row.position ?? index}-${row.team_id ?? row.team_name ?? 'na'}`}
          className={`rounded-card border p-4 shadow-sm ${
            row.team_id && row.team_id === highlightedTeamId
              ? 'border-amber-300 bg-amber-100'
              : index === 0
                ? 'border-amber-200 bg-amber-50'
                : index === 1
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-orange-200 bg-orange-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black ${
              index === 0
                ? 'bg-amber-100 text-amber-700'
                : index === 1
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-orange-100 text-orange-700'
            }`}>
              {row.position ?? index + 1}°
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest2 text-slate-500">{row.position}° posto</p>
              <div className="mt-1 flex items-center gap-2">
                <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                <p className="truncate text-sm font-black text-slate-950">{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</p>
                {row.team_id && row.team_id === highlightedTeamId
                  ? <span className="rounded-full bg-amber-200 px-2 py-0.5 text-2xs font-bold uppercase tracking-widest2 text-amber-900">La tua</span>
                  : null}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pure phase helpers
// ---------------------------------------------------------------------------

export function flattenPhases(program?: { days: Array<{ phases: ProgramPhase[] }> }): ProgramPhase[] {
  if (!program) return []
  return [...program.days.flatMap((day) => day.phases)].sort(compareProgramPhases)
}

export function filterVisiblePhases(phases: ProgramPhase[], hideFuture: boolean): ProgramPhase[] {
  if (!hideFuture) return phases
  const visible: ProgramPhase[] = []
  for (const phase of phases) {
    if (visible.length === 0) {
      visible.push(phase)
      continue
    }
    if (!isPhaseComplete(visible[visible.length - 1])) break
    visible.push(phase)
  }
  return visible
}

export function isPhaseComplete(phase: ProgramPhase): boolean {
  const matches = [
    ...phase.groups.flatMap((group) => group.matches),
    ...phase.knockout_matches,
  ]
  return matches.length > 0 && matches.every((match) => match.status === 'COMPLETED')
}

export function compareProgramPhases(left: ProgramPhase, right: ProgramPhase): number {
  const leftTime = firstPhaseTimestamp(left)
  const rightTime = firstPhaseTimestamp(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.phase_order - right.phase_order
}

export function formatPhaseWindow(phase: ProgramPhase): string | null {
  if (!phase.phase_start_at && !phase.estimated_end_at) return null
  const startLabel = phase.phase_start_at
    ? format(new Date(phase.phase_start_at), 'HH:mm', { locale: it })
    : 'da definire'
  const endLabel = phase.estimated_end_at
    ? format(new Date(phase.estimated_end_at), 'HH:mm', { locale: it })
    : 'da definire'
  return `Inizio ${startLabel} · Fine stimata ${endLabel}`
}

function firstPhaseTimestamp(phase: ProgramPhase): number {
  const timestamps = [
    ...phase.groups.flatMap((group) =>
      group.matches.map((match) => match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER)
    ),
    ...phase.knockout_matches.map((match) =>
      match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
    ),
  ]
  return timestamps.length > 0 ? Math.min(...timestamps) : Number.MAX_SAFE_INTEGER
}

export function createTeamQueryValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

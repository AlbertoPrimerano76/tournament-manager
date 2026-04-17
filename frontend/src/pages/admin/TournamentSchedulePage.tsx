import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import { Clock, Timer, MapPin, ChevronDown, ChevronRight } from 'lucide-react'
import { useAdminTournaments } from '@/api/tournaments'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import type { TournamentProgram, ProgramMatch } from '@/api/tournaments'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  try { return format(parseISO(iso), 'HH:mm') } catch { return '–' }
}

function fieldLabel(m: ProgramMatch): string {
  if (!m.field_name) return ''
  const stripped = stripCategory(m.field_name)
  return m.field_number != null ? `${stripped} · C${m.field_number}` : stripped
}

function stripCategory(name: string): string {
  const parts = name.split(' · ')
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    if (last.length <= 5 && !/\s/.test(last)) return parts.slice(0, -1).join(' · ')
  }
  return name
}

function statusLabel(s: string) {
  if (s === 'COMPLETED') return 'Terminata'
  if (s === 'IN_PROGRESS') return 'In corso'
  if (s === 'CANCELLED') return 'Cancellata'
  if (s === 'POSTPONED') return 'Rinviata'
  return 'Programmata'
}

function statusStyle(s: string) {
  if (s === 'COMPLETED') return 'bg-emerald-100 text-emerald-700'
  if (s === 'IN_PROGRESS') return 'bg-amber-100 text-amber-700 animate-pulse'
  if (s === 'CANCELLED') return 'bg-red-100 text-red-600'
  return 'bg-slate-100 text-slate-500'
}

// ─── flat match list from program ─────────────────────────────────────────────

interface FlatMatch {
  match: ProgramMatch
  ageGroupLabel: string
  ageGroupId: string
  phaseName: string
  phaseType: string
  duration: number | null
}

function flattenProgram(program: TournamentProgram): FlatMatch[] {
  const out: FlatMatch[] = []
  for (const ag of program.age_groups) {
    if (!ag.generated) continue
    const label = ag.display_name || ag.age_group
    for (const day of ag.days) {
      for (const phase of day.phases) {
        const duration = phase.match_duration_minutes ?? null
        const allMatches: ProgramMatch[] = [
          ...phase.groups.flatMap((g) => g.matches),
          ...phase.knockout_matches,
        ]
        for (const m of allMatches) {
          out.push({
            match: m,
            ageGroupLabel: label,
            ageGroupId: ag.age_group_id,
            phaseName: phase.name,
            phaseType: phase.phase_type,
            duration,
          })
        }
      }
    }
  }
  return out.sort((a, b) => {
    const ta = a.match.scheduled_at ?? '9999'
    const tb = b.match.scheduled_at ?? '9999'
    if (ta !== tb) return ta.localeCompare(tb)
    return a.ageGroupLabel.localeCompare(b.ageGroupLabel)
  })
}

// ─── group by time slot (HH:mm) ───────────────────────────────────────────────

interface TimeSlot {
  time: string
  matches: FlatMatch[]
}

function groupByTime(flat: FlatMatch[]): TimeSlot[] {
  const map = new Map<string, FlatMatch[]>()
  for (const fm of flat) {
    const t = fmtTime(fm.match.scheduled_at)
    if (!map.has(t)) map.set(t, [])
    map.get(t)!.push(fm)
  }
  return Array.from(map.entries()).map(([time, matches]) => ({ time, matches }))
}

// ─── category summary ─────────────────────────────────────────────────────────

interface AgSummary {
  label: string
  ageGroupId: string
  totalMatches: number
  completedMatches: number
  phases: { name: string; type: string; duration: number | null; matchCount: number }[]
}

function buildAgSummaries(program: TournamentProgram): AgSummary[] {
  return program.age_groups
    .filter((ag) => ag.generated)
    .map((ag) => {
      const label = ag.display_name || ag.age_group
      const phases: AgSummary['phases'] = []
      let totalMatches = 0
      let completedMatches = 0
      for (const day of ag.days) {
        for (const phase of day.phases) {
          const allMatches = [
            ...phase.groups.flatMap((g) => g.matches),
            ...phase.knockout_matches,
          ]
          totalMatches += allMatches.length
          completedMatches += allMatches.filter((m) => m.status === 'COMPLETED').length
          if (allMatches.length > 0) {
            phases.push({
              name: phase.name,
              type: phase.phase_type,
              duration: phase.match_duration_minutes ?? null,
              matchCount: allMatches.length,
            })
          }
        }
      }
      return { label, ageGroupId: ag.age_group_id, totalMatches, completedMatches, phases }
    })
}

// ─── API hook ─────────────────────────────────────────────────────────────────

function useTournamentProgramBySlug(slug: string | undefined) {
  return useQuery({
    queryKey: ['tournament-full-program', slug],
    queryFn: async () => {
      const res = await apiClient.get<TournamentProgram>(
        `/api/v1/tournaments/${slug}/program`,
      )
      return res.data
    },
    enabled: !!slug,
  })
}

// ─── MatchRow ─────────────────────────────────────────────────────────────────

function MatchRow({ fm, showTime }: { fm: FlatMatch; showTime: boolean }) {
  const { match } = fm
  const hasResult = match.home_score != null && match.away_score != null
  const homeWins = hasResult && match.home_score! > match.away_score!
  const awayWins = hasResult && match.away_score! > match.home_score!
  const fl = fieldLabel(match)

  return (
    <div className="grid grid-cols-[56px_1fr] gap-0 border-b border-slate-100 last:border-0">
      {/* time */}
      <div className="flex items-center justify-center border-r border-slate-100 py-3">
        {showTime ? (
          <span className="text-[11px] font-bold tabular-nums text-slate-400">
            {fmtTime(match.scheduled_at)}
          </span>
        ) : null}
      </div>

      {/* content */}
      <div className="flex flex-col gap-1 px-3 py-2.5">
        {/* category + phase + field */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
            {fm.ageGroupLabel}
          </span>
          {fm.phaseType === 'KNOCKOUT' && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
              Finale
            </span>
          )}
          {match.bracket_round && fm.phaseType === 'KNOCKOUT' && (
            <span className="text-[10px] text-slate-400">{match.bracket_round}</span>
          )}
          {match.group_name && (
            <span className="text-[10px] text-slate-400">{match.group_name}</span>
          )}
          {fl && (
            <span className="ml-auto flex items-center gap-1 text-[10px] text-slate-400">
              <MapPin className="h-2.5 w-2.5" />
              {fl}
            </span>
          )}
        </div>

        {/* teams + score */}
        <div className="flex items-center gap-2">
          <span className={`min-w-0 flex-1 truncate text-sm font-semibold ${homeWins ? 'text-emerald-700' : 'text-slate-800'}`}>
            {match.home_label}
          </span>
          {hasResult ? (
            <span className="shrink-0 text-sm font-black tabular-nums text-slate-800">
              {match.home_score}–{match.away_score}
            </span>
          ) : (
            <span className="shrink-0 text-xs text-slate-300">vs</span>
          )}
          <span className={`min-w-0 flex-1 truncate text-right text-sm font-semibold ${awayWins ? 'text-emerald-700' : 'text-slate-800'}`}>
            {match.away_label}
          </span>
        </div>

        {/* duration + status */}
        <div className="flex items-center gap-2">
          {fm.duration && (
            <span className="flex items-center gap-1 text-[10px] text-slate-400">
              <Timer className="h-2.5 w-2.5" />
              {fm.duration} min
            </span>
          )}
          <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-bold ${statusStyle(match.status)}`}>
            {statusLabel(match.status)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── TimeSlotBlock ────────────────────────────────────────────────────────────

function TimeSlotBlock({ slot }: { slot: TimeSlot }) {
  const [open, setOpen] = useState(true)
  const completed = slot.matches.filter((fm) => fm.match.status === 'COMPLETED').length

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900">
          <Clock className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-base font-black tabular-nums text-slate-900">{slot.time}</p>
          <p className="text-xs text-slate-400">
            {slot.matches.length} {slot.matches.length === 1 ? 'partita' : 'partite'}
            {completed > 0 && ` · ${completed} terminate`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* mini progress bar */}
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${slot.matches.length > 0 ? (completed / slot.matches.length) * 100 : 0}%` }}
            />
          </div>
          {open
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />
          }
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {slot.matches.map((fm, i) => (
            <MatchRow key={fm.match.id} fm={fm} showTime={i === 0 || fm.match.scheduled_at !== slot.matches[i - 1]?.match.scheduled_at} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Category summary card ────────────────────────────────────────────────────

function AgCard({ ag, tournamentId }: { ag: AgSummary; tournamentId: string }) {
  const pct = ag.totalMatches > 0 ? Math.round((ag.completedMatches / ag.totalMatches) * 100) : 0
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-black text-slate-900">{ag.label}</p>
        <span className="shrink-0 text-xs font-bold text-slate-400">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-400">
        {ag.completedMatches}/{ag.totalMatches} partite
      </p>
      <div className="mt-3 space-y-1.5">
        {ag.phases.map((ph) => (
          <div key={ph.name} className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              {ph.type === 'KNOCKOUT' && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
              )}
              {ph.type === 'GROUP_STAGE' && (
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
              )}
              <span>{ph.name}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-400">
              <span>{ph.matchCount} partite</span>
              {ph.duration && (
                <span className="flex items-center gap-0.5">
                  <Timer className="h-2.5 w-2.5" />
                  {ph.duration}'
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      <Link
        to={`/admin/tornei/${tournamentId}/categorie/${ag.ageGroupId}/tabellone`}
        className="mt-3 block text-center text-[11px] font-bold uppercase tracking-[0.12em] text-blue-600 hover:text-blue-800"
      >
        Tabellone →
      </Link>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TournamentSchedulePage() {
  const { tournamentId } = useParams<{ tournamentId: string }>()
  const { data: tournaments } = useAdminTournaments()
  const tournament = tournaments?.find((t) => t.id === tournamentId) ?? null
  const { data: program, isLoading } = useTournamentProgramBySlug(tournament?.slug)

  const [view, setView] = useState<'timeline' | 'categorie'>('timeline')

  const flat = useMemo(() => (program ? flattenProgram(program) : []), [program])
  const slots = useMemo(() => groupByTime(flat), [flat])
  const agSummaries = useMemo(() => (program ? buildAgSummaries(program) : []), [program])

  const totalMatches = flat.length
  const completedMatches = flat.filter((fm) => fm.match.status === 'COMPLETED').length
  const liveMatches = flat.filter((fm) => fm.match.status === 'IN_PROGRESS').length

  const totalDurationMinutes = useMemo(() => {
    return flat.reduce((acc, fm) => acc + (fm.duration ?? 0), 0)
  }, [flat])

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-12">
      {/* header */}
      <div className="rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <Link
          to={`/admin/tornei/${tournamentId}/categorie`}
          className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600"
        >
          ← {tournament?.name ?? 'Torneo'}
        </Link>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Programma</h1>
        <p className="mt-1 text-sm text-slate-500">
          {tournament ? format(new Date(tournament.start_date ?? Date.now()), 'd MMMM yyyy', { locale: it }) : ''}
        </p>

        {/* stats bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatBox label="Partite totali" value={String(totalMatches)} />
          <StatBox label="Terminate" value={String(completedMatches)} accent="emerald" />
          {liveMatches > 0 && <StatBox label="In corso" value={String(liveMatches)} accent="amber" />}
          <StatBox
            label="Minuti di gioco"
            value={totalDurationMinutes > 0 ? `${totalDurationMinutes}'` : '–'}
          />
        </div>

        {/* overall progress */}
        {totalMatches > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>Avanzamento torneo</span>
              <span>{Math.round((completedMatches / totalMatches) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(completedMatches / totalMatches) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* view toggle */}
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {(['timeline', 'categorie'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-xl py-2 text-sm font-bold transition-all ${
              view === v
                ? 'bg-slate-900 text-white shadow'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {v === 'timeline' ? 'Timeline oraria' : 'Per categoria'}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="py-12 text-center text-sm text-slate-400">Caricamento programma…</div>
      )}

      {!isLoading && program && view === 'timeline' && (
        <div className="space-y-3">
          {slots.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              Nessun programma generato.
            </p>
          )}
          {slots.map((slot) => (
            <TimeSlotBlock key={slot.time} slot={slot} />
          ))}
        </div>
      )}

      {!isLoading && program && view === 'categorie' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {agSummaries.length === 0 && (
            <p className="col-span-2 py-8 text-center text-sm text-slate-400">
              Nessun programma generato.
            </p>
          )}
          {agSummaries.map((ag) => (
            <AgCard key={ag.ageGroupId} ag={ag} tournamentId={tournamentId ?? ''} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'emerald' | 'amber'
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p
        className={`mt-0.5 text-2xl font-black tabular-nums ${
          accent === 'emerald'
            ? 'text-emerald-600'
            : accent === 'amber'
              ? 'text-amber-600'
              : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

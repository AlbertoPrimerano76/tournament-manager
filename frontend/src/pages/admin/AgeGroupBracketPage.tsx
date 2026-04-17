import { Link, useParams } from 'react-router-dom'
import { useAdminTournaments, useAdminAgeGroupProgram, type ProgramMatch, type ProgramPhase, type AgeGroupProgram } from '@/api/tournaments'
import { format, parseISO } from 'date-fns'
import { Clock, MapPin, Timer } from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '–'
  try { return format(parseISO(iso), 'HH:mm') } catch { return '–' }
}

function fieldLabel(m: ProgramMatch): string {
  if (!m.field_name) return ''
  const name = stripCategory(m.field_name)
  return m.field_number != null ? `${name} · Campo ${m.field_number}` : name
}

function stripCategory(name: string): string {
  const parts = name.split(' · ')
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    if (last.length <= 5 && !/\s/.test(last)) return parts.slice(0, -1).join(' · ')
  }
  return name
}

function statusStyle(s: string): string {
  if (s === 'COMPLETED') return 'bg-emerald-50 border-emerald-200'
  if (s === 'IN_PROGRESS') return 'bg-amber-50 border-amber-200'
  return 'bg-white border-slate-200'
}

// ─── Build bracket rounds from knockout_matches ───────────────────────────────

interface BracketRound {
  name: string
  order: number
  matches: ProgramMatch[]
}

function buildBracketRounds(phase: ProgramPhase): BracketRound[] {
  const map = new Map<string, { minOrder: number; matches: ProgramMatch[] }>()
  for (const m of phase.knockout_matches) {
    const roundName = m.bracket_round ?? phase.name
    const order = m.bracket_round_order ?? 0
    if (!map.has(roundName)) {
      map.set(roundName, { minOrder: order, matches: [] })
    } else {
      const entry = map.get(roundName)!
      if (order < entry.minOrder) entry.minOrder = order
    }
    map.get(roundName)!.matches.push(m)
  }
  return Array.from(map.entries())
    .map(([name, { minOrder, matches }]) => ({
      order: minOrder,
      name,
      matches: [...matches].sort((a, b) => (a.bracket_position ?? 0) - (b.bracket_position ?? 0)),
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      if (b.matches.length !== a.matches.length) return b.matches.length - a.matches.length
      return a.name.localeCompare(b.name)
    })
}

// ─── Match card (group stage) ─────────────────────────────────────────────────

function GroupMatchCard({ match }: { match: ProgramMatch }) {
  const hasResult = match.home_score != null && match.away_score != null
  const homeWins = hasResult && match.home_score! > match.away_score!
  const awayWins = hasResult && match.away_score! > match.home_score!
  const fl = fieldLabel(match)

  return (
    <div className={`rounded-2xl border p-3 transition-colors ${statusStyle(match.status)}`}>
      {/* time + field */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1 text-xs font-bold text-slate-700">
          <Clock className="h-3 w-3 text-slate-400" />
          {fmtTime(match.scheduled_at)}
        </span>
        {fl && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <MapPin className="h-3 w-3" />
            {fl}
          </span>
        )}
        {match.match_duration_minutes && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Timer className="h-3 w-3" />
            {match.match_duration_minutes}'
          </span>
        )}
      </div>

      {/* home */}
      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${homeWins ? 'bg-emerald-100' : 'bg-slate-50'}`}>
        <span className={`text-sm font-bold leading-tight ${homeWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.home_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-lg font-black tabular-nums ${homeWins ? 'text-emerald-700' : 'text-slate-600'}`}>
            {match.home_score}
          </span>
        )}
      </div>

      {/* separator */}
      <div className="my-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-widest text-slate-300">
        {hasResult ? '–' : 'vs'}
      </div>

      {/* away */}
      <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${awayWins ? 'bg-emerald-100' : 'bg-slate-50'}`}>
        <span className={`text-sm font-bold leading-tight ${awayWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.away_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-lg font-black tabular-nums ${awayWins ? 'text-emerald-700' : 'text-slate-600'}`}>
            {match.away_score}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Group stage ──────────────────────────────────────────────────────────────

function GroupStageSchedule({ phase }: { phase: ProgramPhase }) {
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {phase.groups.map((group) => {
          const sorted = [...group.matches].sort((a, b) => {
            if (!a.scheduled_at && !b.scheduled_at) return 0
            if (!a.scheduled_at) return 1
            if (!b.scheduled_at) return -1
            return a.scheduled_at.localeCompare(b.scheduled_at)
          })
          return (
            <div key={group.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <p className="mb-3 text-sm font-black text-slate-800">{group.name}</p>
              <div className="flex flex-col gap-2">
                {sorted.map((m) => <GroupMatchCard key={m.id} match={m} />)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Knockout match card ──────────────────────────────────────────────────────

function KnockoutMatchCard({ match }: { match: ProgramMatch }) {
  const hasResult = match.home_score != null && match.away_score != null
  const homeWins = hasResult && match.home_score! > match.away_score!
  const awayWins = hasResult && match.away_score! > match.home_score!
  const fl = fieldLabel(match)

  return (
    <div className={`w-64 overflow-hidden rounded-2xl border shadow-sm ${statusStyle(match.status)}`}>
      {/* header */}
      <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3 w-3 shrink-0" />
          <span className="font-bold text-slate-700">{fmtTime(match.scheduled_at)}</span>
          {match.match_duration_minutes && (
            <>
              <span className="text-slate-300">·</span>
              <Timer className="h-3 w-3 shrink-0" />
              <span>{match.match_duration_minutes}'</span>
            </>
          )}
        </div>
        {fl && (
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="h-2.5 w-2.5 shrink-0" />
            <span className="leading-tight">{fl}</span>
          </div>
        )}
      </div>

      {/* home */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${homeWins ? 'bg-emerald-50' : ''}`}>
        <span className={`text-sm font-bold leading-snug ${homeWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.home_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-lg font-black ${homeWins ? 'text-emerald-700' : 'text-slate-500'}`}>
            {match.home_score}
          </span>
        )}
      </div>

      <div className="mx-3 border-t border-slate-100" />

      {/* away */}
      <div className={`flex items-center justify-between gap-2 px-3 py-2.5 ${awayWins ? 'bg-emerald-50' : ''}`}>
        <span className={`text-sm font-bold leading-snug ${awayWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.away_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-lg font-black ${awayWins ? 'text-emerald-700' : 'text-slate-500'}`}>
            {match.away_score}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Knockout bracket ─────────────────────────────────────────────────────────

function KnockoutBracket({ phase }: { phase: ProgramPhase }) {
  const rounds = buildBracketRounds(phase)
  if (rounds.length === 0) return null

  const isTreeBracket = rounds.every(
    (r, i) => i === 0 || r.matches.length === rounds[i - 1].matches.length / 2,
  )

  // ── Tree layout ────────────────────────────────────────────────────────────
  if (isTreeBracket) {
    const firstRoundCount = rounds[0]?.matches.length ?? 1
    const slotHeight = 136

    return (
      <div>
        <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex items-stretch gap-0" style={{ minWidth: `${rounds.length * 280}px` }}>
            {rounds.map((round, ri) => {
              const isLast = ri === rounds.length - 1
              const colSlots = firstRoundCount / Math.pow(2, ri)
              const colHeight = colSlots * slotHeight

              return (
                <div key={round.order} className="flex flex-col" style={{ width: 280 }}>
                  <div className="mb-3 px-4 text-center">
                    <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                      {round.name}
                    </span>
                  </div>

                  <div className="relative flex flex-col" style={{ height: colHeight }}>
                    {round.matches.map((match, mi) => {
                      const matchesInCol = round.matches.length
                      const slotSize = colHeight / matchesInCol
                      const top = mi * slotSize + (slotSize - 116) / 2

                      return (
                        <div
                          key={match.id}
                          className="absolute left-4"
                          style={{ top, right: isLast ? 16 : 0 }}
                        >
                          <KnockoutMatchCard match={match} />
                          {!isLast && (
                            <div
                              className="absolute right-0 top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                              style={{ width: 16 }}
                            />
                          )}
                        </div>
                      )
                    })}

                    {!isLast && round.matches.map((_, mi) => {
                      if (mi % 2 !== 0) return null
                      const matchesInCol = round.matches.length
                      const slotSize = colHeight / matchesInCol
                      const topA = mi * slotSize + slotSize / 2
                      const topB = (mi + 1) < matchesInCol
                        ? (mi + 1) * slotSize + slotSize / 2
                        : topA
                      const midY = (topA + topB) / 2

                      return (
                        <div key={`conn-${mi}`} className="pointer-events-none absolute right-0 top-0 w-4">
                          <div
                            className="absolute right-0 border-r-2 border-slate-300"
                            style={{ top: topA, height: topB - topA }}
                          />
                          <div
                            className="absolute right-0 border-t-2 border-slate-300"
                            style={{ top: midY, width: 16 }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── Flat layout (placement brackets) ──────────────────────────────────────
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex items-start gap-5">
          {rounds.map((round) => (
            <div key={round.order} className="flex flex-col gap-3" style={{ width: 272 }}>
              <div className="text-center">
                <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                  {round.name}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <KnockoutMatchCard key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Day section ──────────────────────────────────────────────────────────────

function DaySection({ program }: { program: AgeGroupProgram }) {
  const allPhases = program.days.flatMap((d) => d.phases)

  const groupPhases = allPhases.filter((p) => p.phase_type === 'GROUP_STAGE' && p.groups.length > 0)
  const knockoutPhases = allPhases.filter((p) => p.phase_type === 'KNOCKOUT' && p.knockout_matches.length > 0)

  return (
    <div className="space-y-8">
      {groupPhases.length > 0 && (
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Fasi a gironi</p>
          <div className="space-y-8">
            {groupPhases.map((p) => <GroupStageSchedule key={p.id} phase={p} />)}
          </div>
        </section>
      )}

      {knockoutPhases.length > 0 && (
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Fase ad eliminazione</p>
          <div className="space-y-10">
            {knockoutPhases.map((p) => <KnockoutBracket key={p.id} phase={p} />)}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgeGroupBracketPage() {
  const { tournamentId, ageGroupId } = useParams<{ tournamentId: string; ageGroupId: string }>()
  const { data: tournaments } = useAdminTournaments()
  const tournament = tournaments?.find((t) => t.id === tournamentId) ?? null
  const { data: program, isLoading } = useAdminAgeGroupProgram(ageGroupId ?? '')

  const agLabel = program?.display_name ?? program?.age_group ?? 'Categoria'

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento tabellone...</div>
  }

  if (!program?.generated) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center text-sm text-slate-500">
        Programma non ancora generato per questa categoria.
      </div>
    )
  }

  // stats
  const allMatches = program.days.flatMap((d) =>
    d.phases.flatMap((p) => [...p.groups.flatMap((g) => g.matches), ...p.knockout_matches]),
  )
  const completed = allMatches.filter((m) => m.status === 'COMPLETED').length
  const live = allMatches.filter((m) => m.status === 'IN_PROGRESS').length

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* header */}
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex-1">
            <Link
              to={`/admin/tornei/${tournamentId}/categorie/${ageGroupId}`}
              className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600"
            >
              ← Configurazione categoria
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Tabellone</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament?.name} · {agLabel}</p>
          </div>

          {/* stats */}
          <div className="flex shrink-0 gap-3">
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-center">
              <p className="text-[11px] text-slate-400">Partite</p>
              <p className="text-xl font-black text-slate-900">{allMatches.length}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-center">
              <p className="text-[11px] text-emerald-600">Terminate</p>
              <p className="text-xl font-black text-emerald-700">{completed}</p>
            </div>
            {live > 0 && (
              <div className="rounded-2xl bg-amber-50 px-4 py-3 text-center">
                <p className="text-[11px] text-amber-600">In corso</p>
                <p className="text-xl font-black text-amber-700">{live}</p>
              </div>
            )}
          </div>
        </div>

        {/* progress bar */}
        {allMatches.length > 0 && (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${(completed / allMatches.length) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <DaySection program={program} />
    </div>
  )
}

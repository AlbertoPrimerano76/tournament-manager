import { Link, useParams } from 'react-router-dom'
import { useAdminTournaments, useAdminAgeGroupProgram, type ProgramMatch, type ProgramPhase, type AgeGroupProgram } from '@/api/tournaments'
import { format, parseISO } from 'date-fns'
import { Clock, MapPin } from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '–'
  try { return format(parseISO(iso), 'HH:mm') } catch { return '–' }
}

function fieldLabel(m: ProgramMatch): string {
  if (!m.field_name) return ''
  return m.field_number != null ? `${m.field_name} ${m.field_number}` : m.field_name
}

// ─── Build bracket rounds from knockout_matches ───────────────────────────────

interface BracketRound {
  name: string
  order: number
  matches: ProgramMatch[]
}

function buildBracketRounds(phase: ProgramPhase): BracketRound[] {
  // Group by bracket_round name so each named round is its own column.
  // bracket_round_order is a scheduling artifact and can assign the same value
  // to conceptually different rounds (e.g. "Piazzamento 1-4 · Semifinali" and
  // "Piazzamento 5-8 · Semifinali" scheduled in the same slot).
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
      // Primary: scheduling order (earlier rounds first)
      if (a.order !== b.order) return a.order - b.order
      // Secondary: more matches = earlier column (semis before finals)
      if (b.matches.length !== a.matches.length) return b.matches.length - a.matches.length
      // Tertiary: sort by name alphabetically for stable output
      return a.name.localeCompare(b.name)
    })
}

// ─── Single match box ─────────────────────────────────────────────────────────

function MatchBox({ match, dim = false }: { match: ProgramMatch; dim?: boolean }) {
  const hasResult = match.home_score != null && match.away_score != null
  const homeWins = hasResult && match.home_score! > match.away_score!
  const awayWins = hasResult && match.away_score! > match.home_score!
  const fl = fieldLabel(match)

  return (
    <div
      className={`w-52 rounded-xl border shadow-sm overflow-hidden text-[12px] transition-opacity ${
        dim ? 'opacity-50' : 'opacity-100'
      } ${hasResult ? 'border-slate-300' : 'border-slate-200'} bg-white`}
    >
      {/* time + field header — two lines so the field name is always readable */}
      <div className="border-b border-slate-100 bg-slate-50 px-2.5 py-1">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="font-semibold text-slate-600">{fmtTime(match.scheduled_at)}</span>
        </div>
        {fl && (
          <div className="flex items-center gap-1 mt-0.5">
            <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="text-slate-500 text-[11px] leading-tight">{fl}</span>
          </div>
        )}
      </div>
      {/* home team */}
      <div
        className={`flex items-center justify-between gap-1 px-2.5 py-1.5 ${
          homeWins ? 'bg-emerald-50' : ''
        }`}
      >
        <span className={`truncate font-semibold ${homeWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.home_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-sm font-black ${homeWins ? 'text-emerald-700' : 'text-slate-500'}`}>
            {match.home_score}
          </span>
        )}
      </div>
      {/* divider */}
      <div className="mx-2.5 border-t border-slate-100" />
      {/* away team */}
      <div
        className={`flex items-center justify-between gap-1 px-2.5 py-1.5 ${
          awayWins ? 'bg-emerald-50' : ''
        }`}
      >
        <span className={`truncate font-semibold ${awayWins ? 'text-emerald-800' : 'text-slate-800'}`}>
          {match.away_label}
        </span>
        {hasResult && (
          <span className={`shrink-0 text-sm font-black ${awayWins ? 'text-emerald-700' : 'text-slate-500'}`}>
            {match.away_score}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Bracket for one knockout phase ──────────────────────────────────────────
// Two rendering modes:
//   1. Tree mode  — rounds strictly halve (4→2→1, 8→4→2→1). Shows connector lines.
//   2. Flat mode  — rounds don't strictly halve (placement brackets with consolation
//                   finals). Shows columns without connector lines.

function KnockoutBracket({ phase }: { phase: ProgramPhase }) {
  const rounds = buildBracketRounds(phase)
  if (rounds.length === 0) return null

  // True tree bracket: every successive round has EXACTLY half the matches
  // (no Math.ceil — odd numbers signal byes/placement, not pure elimination)
  const isTreeBracket = rounds.every(
    (r, i) => i === 0 || r.matches.length === rounds[i - 1].matches.length / 2,
  )

  // ── Tree layout ────────────────────────────────────────────────────────────
  if (isTreeBracket) {
    const firstRoundCount = rounds[0]?.matches.length ?? 1
    const slotHeight = 116 // px per match "slot"

    return (
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
        <div className="overflow-x-auto pb-4">
          <div className="inline-flex items-stretch gap-0" style={{ minWidth: `${rounds.length * 240}px` }}>
            {rounds.map((round, ri) => {
              const isLast = ri === rounds.length - 1
              const colSlots = firstRoundCount / Math.pow(2, ri)
              const colHeight = colSlots * slotHeight

              return (
                <div key={round.order} className="flex flex-col" style={{ width: 240 }}>
                  <div className="mb-2 px-4 text-center">
                    <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                      {round.name}
                    </span>
                  </div>

                  <div className="relative flex flex-col" style={{ height: colHeight }}>
                    {round.matches.map((match, mi) => {
                      const matchesInCol = round.matches.length
                      const slotSize = colHeight / matchesInCol
                      const top = mi * slotSize + (slotSize - 96) / 2

                      return (
                        <div
                          key={match.id}
                          className="absolute left-4"
                          style={{ top, right: isLast ? 16 : 0 }}
                        >
                          <MatchBox match={match} />
                          {!isLast && (
                            <div
                              className="absolute right-0 top-1/2 -translate-y-1/2 border-t-2 border-slate-300"
                              style={{ width: 16 }}
                            />
                          )}
                        </div>
                      )
                    })}

                    {/* Vertical connectors grouping pairs toward next round */}
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

  // ── Flat layout (placement / consolation brackets) ─────────────────────────
  // Rounds are shown as labeled columns. No connector lines — matches in
  // different columns are independent (e.g. 1-2 Finale and 3-4 Finale).
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex items-start gap-6">
          {rounds.map((round) => (
            <div key={round.order} className="flex flex-col gap-3" style={{ width: 224 }}>
              <div className="text-center">
                <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  {round.name}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {round.matches.map((match) => (
                  <MatchBox key={match.id} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Group stage schedule ─────────────────────────────────────────────────────

function GroupStageSchedule({ phase }: { phase: ProgramPhase }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.15em] text-slate-500">{phase.name}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {phase.groups.map((group) => {
          const sorted = [...group.matches].sort((a, b) => {
            if (!a.scheduled_at && !b.scheduled_at) return 0
            if (!a.scheduled_at) return 1
            if (!b.scheduled_at) return -1
            return a.scheduled_at.localeCompare(b.scheduled_at)
          })
          return (
            <div key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-black text-slate-800">{group.name}</p>
              <div className="space-y-2">
                {sorted.map((m) => {
                  const fl = fieldLabel(m)
                  const hasResult = m.home_score != null && m.away_score != null
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                    >
                      <span className="w-10 shrink-0 font-bold text-slate-500">{fmtTime(m.scheduled_at)}</span>
                      {fl && <span className="w-20 shrink-0 truncate text-slate-400">{fl}</span>}
                      <span className={`flex-1 truncate font-semibold ${hasResult && m.home_score! > m.away_score! ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {m.home_label}
                      </span>
                      {hasResult ? (
                        <span className="shrink-0 font-black text-slate-700">{m.home_score}–{m.away_score}</span>
                      ) : (
                        <span className="shrink-0 text-slate-400">vs</span>
                      )}
                      <span className={`flex-1 truncate text-right font-semibold ${hasResult && m.away_score! > m.home_score! ? 'text-emerald-700' : 'text-slate-800'}`}>
                        {m.away_label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
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
          <div className="space-y-6">
            {groupPhases.map((p) => <GroupStageSchedule key={p.id} phase={p} />)}
          </div>
        </section>
      )}

      {knockoutPhases.length > 0 && (
        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
          <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Tabellone eliminazione</p>
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

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* header */}
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              to={`/admin/tornei/${tournamentId}/categorie/${ageGroupId}`}
              className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600"
            >
              ← Configurazione categoria
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Tabellone</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament?.name} · {agLabel}</p>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Orari e campi dei gironi, tabellone ad eliminazione con i risultati aggiornati.
            </p>
          </div>
        </div>
      </div>

      <DaySection program={program} />
    </div>
  )
}

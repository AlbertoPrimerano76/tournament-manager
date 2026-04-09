import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { CheckCircle2, Clock, Play, RefreshCw } from 'lucide-react'
import { useTodayMatches, useEnterMatchScore, type TodayMatchItem } from '@/api/matches'
import { useQueryClient } from '@tanstack/react-query'

type StatusFilter = 'all' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'

export default function ScorerPage() {
  const { data: matches = [], isLoading, dataUpdatedAt, refetch } = useTodayMatches()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const filtered = matches.filter((m) => statusFilter === 'all' || m.status === statusFilter)

  const grouped = filtered.reduce<Record<string, TodayMatchItem[]>>((acc, m) => {
    const key = m.field_number != null ? `Campo ${m.field_number}` : (m.field_name ?? 'Senza campo')
    acc[key] = acc[key] ?? []
    acc[key].push(m)
    return acc
  }, {})

  const inProgressCount = matches.filter((m) => m.status === 'IN_PROGRESS').length
  const completedCount = matches.filter((m) => m.status === 'COMPLETED').length

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento partite...</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700/70">Segnapunti</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Partite di oggi</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {dataUpdatedAt ? `Aggiornato alle ${format(new Date(dataUpdatedAt), 'HH:mm')}` : ''}
          </span>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aggiorna
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">
          {matches.length} totali
        </span>
        <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700">
          {inProgressCount} in corso
        </span>
        <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-700">
          {completedCount} concluse
        </span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
              statusFilter === s
                ? 'bg-[#103e31] text-white shadow'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'Tutte' : s === 'SCHEDULED' ? 'Da giocare' : s === 'IN_PROGRESS' ? 'In corso' : 'Concluse'}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-semibold text-slate-600">Nessuna partita programmata per oggi</p>
          <p className="mt-1 text-xs text-slate-400">Le partite appariranno qui quando verranno schedulate.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Nessuna partita corrisponde al filtro selezionato.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped).map(([fieldLabel, fieldMatches]) => (
            <section key={fieldLabel}>
              <div className="mb-3 flex items-center gap-2">
                <p className="text-sm font-black text-slate-800">{fieldLabel}</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {fieldMatches.length}
                </span>
              </div>
              <div className="space-y-3">
                {fieldMatches.map((match) => (
                  <MatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: TodayMatchItem }) {
  const [editing, setEditing] = useState(false)
  const [homeScore, setHomeScore] = useState('')
  const [awayScore, setAwayScore] = useState('')
  const [homeTries, setHomeTries] = useState('')
  const [awayTries, setAwayTries] = useState('')
  const enterScore = useEnterMatchScore()
  const qc = useQueryClient()

  const isCompleted = match.status === 'COMPLETED'
  const isInProgress = match.status === 'IN_PROGRESS'

  function openEdit() {
    setHomeScore(match.home_score != null ? String(match.home_score) : '')
    setAwayScore(match.away_score != null ? String(match.away_score) : '')
    setHomeTries(match.home_tries != null ? String(match.home_tries) : '')
    setAwayTries(match.away_tries != null ? String(match.away_tries) : '')
    setEditing(true)
  }

  async function handleSubmit(status: 'IN_PROGRESS' | 'COMPLETED') {
    const hs = parseInt(homeScore)
    const as_ = parseInt(awayScore)
    if (isNaN(hs) || isNaN(as_)) return
    await enterScore.mutateAsync({
      matchId: match.id,
      data: {
        home_score: hs,
        away_score: as_,
        home_tries: homeTries !== '' ? parseInt(homeTries) : undefined,
        away_tries: awayTries !== '' ? parseInt(awayTries) : undefined,
        status,
      },
    })
    qc.invalidateQueries({ queryKey: ['today-matches'] })
    setEditing(false)
  }

  async function handleClear() {
    await enterScore.mutateAsync({
      matchId: match.id,
      data: { clear_result: true },
    })
    qc.invalidateQueries({ queryKey: ['today-matches'] })
    setEditing(false)
  }

  return (
    <div className={`overflow-hidden rounded-[1.5rem] border bg-white shadow-sm ${
      isInProgress ? 'border-amber-300' : isCompleted ? 'border-emerald-200' : 'border-slate-200'
    }`}>
      <div className={`flex items-center justify-between gap-2 px-4 py-2 text-xs font-bold ${
        isInProgress ? 'bg-amber-50 text-amber-700' : isCompleted ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'
      }`}>
        <span>{match.tournament_name} · {match.age_group_name}</span>
        <span className="flex items-center gap-1">
          {isInProgress && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" /></span>}
          {isInProgress ? 'In corso' : isCompleted ? 'Conclusa' : match.scheduled_at ? format(new Date(match.scheduled_at), 'HH:mm', { locale: it }) : 'Non schedulata'}
        </span>
      </div>

      <div className="px-4 py-4">
        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="space-y-1 text-center">
                <p className="truncate text-sm font-bold text-slate-900">{match.home_label ?? '?'}</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border-2 border-slate-200 py-4 text-center text-3xl font-black text-slate-900 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={homeTries}
                  onChange={(e) => setHomeTries(e.target.value)}
                  placeholder="Mete"
                  className="w-full rounded-xl border border-slate-200 py-2 text-center text-sm text-slate-600 focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <span className="text-lg font-black text-slate-300">–</span>
              <div className="space-y-1 text-center">
                <p className="truncate text-sm font-bold text-slate-900">{match.away_label ?? '?'}</p>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-2xl border-2 border-slate-200 py-4 text-center text-3xl font-black text-slate-900 focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={awayTries}
                  onChange={(e) => setAwayTries(e.target.value)}
                  placeholder="Mete"
                  className="w-full rounded-xl border border-slate-200 py-2 text-center text-sm text-slate-600 focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleSubmit('IN_PROGRESS')}
                disabled={enterScore.isPending}
                className="flex items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                In corso
              </button>
              <button
                onClick={() => handleSubmit('COMPLETED')}
                disabled={enterScore.isPending}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                Conclusa
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleClear}
                disabled={enterScore.isPending}
                className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Cancella risultato
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annulla
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-bold text-slate-900">{match.home_label ?? '?'}</p>
            </div>
            <div className="shrink-0 text-center">
              {isCompleted || isInProgress ? (
                <span className="rounded-xl bg-slate-900 px-4 py-2 text-xl font-black tabular-nums text-white">
                  {match.home_score ?? '–'} – {match.away_score ?? '–'}
                </span>
              ) : (
                <span className="text-base font-black text-slate-300">vs</span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-bold text-slate-900">{match.away_label ?? '?'}</p>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
          <button
            onClick={openEdit}
            className="flex-1 rounded-xl bg-[#103e31] py-3 text-sm font-bold text-white"
          >
            {isCompleted ? 'Modifica risultato' : 'Inserisci risultato'}
          </button>
          <Link
            to={`/admin/tornei/${match.tournament_id}/categorie/${match.age_group_id}/gestione`}
            className="flex items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Dettaglio
          </Link>
        </div>
      )}
    </div>
  )
}

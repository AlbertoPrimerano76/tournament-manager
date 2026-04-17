import { useParams, Link, useLocation } from 'react-router-dom'
import { useMatch } from '@/api/tournaments'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import { ArrowLeft, Clock, MapPin, User, Share2, Timer } from 'lucide-react'
import { format, formatDistanceToNow, isFuture } from 'date-fns'
import { it } from 'date-fns/locale'
import { stripFieldCategory } from '@/utils/dateFormat'

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Programmata',
  IN_PROGRESS: 'In corso',
  COMPLETED: 'Finale',
  CANCELLED: 'Cancellata',
  POSTPONED: 'Rinviata',
}

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-red-100 text-red-700',
  POSTPONED: 'bg-orange-100 text-orange-700',
}

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const location = useLocation()
  const backLabel: string = (location.state as { backLabel?: string } | null)?.backLabel ?? 'Categoria'
  const backTo: string = (location.state as { backTo?: string } | null)?.backTo ?? '..'

  const { data: match, isLoading, error } = useMatch(matchId!)

  if (isLoading) return <LoadingSpinner className="py-16" />
  if (error) return <ErrorMessage message="Partita non trovata" />
  if (!match) return null
  const currentMatch = match

  const homeLabel = currentMatch.home_label ?? 'Squadra A'
  const awayLabel = currentMatch.away_label ?? 'Squadra B'
  const isScheduled = currentMatch.status === 'SCHEDULED' || currentMatch.status === 'POSTPONED'
  const isCompleted = currentMatch.status === 'COMPLETED'

  const countdown =
    isScheduled && currentMatch.scheduled_at && isFuture(new Date(currentMatch.scheduled_at))
      ? formatDistanceToNow(new Date(currentMatch.scheduled_at), { locale: it, addSuffix: false })
      : null

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `${homeLabel} vs ${awayLabel}`,
        text: isCompleted
          ? `${homeLabel} ${currentMatch.home_score} – ${currentMatch.away_score} ${awayLabel}`
          : `${homeLabel} vs ${awayLabel}`,
        url: window.location.href,
      }).catch(() => {/* dismissed */})
    } else {
      navigator.clipboard?.writeText(window.location.href)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      {/* Back nav */}
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>

      {/* Match card */}
      <div className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            {currentMatch.bracket_round && (
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                {currentMatch.bracket_round}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${statusColors[currentMatch.status] ?? statusColors.SCHEDULED}`}>
              {statusLabels[currentMatch.status] ?? currentMatch.status}
            </span>
            <button
              onClick={handleShare}
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Condividi partita"
            >
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Score section */}
        <div className="px-5 py-6">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            {/* Home team */}
            <div className="flex flex-col items-center gap-2 text-center">
              {currentMatch.home_logo_url && (
                <img
                  src={currentMatch.home_logo_url}
                  alt={homeLabel}
                  className="h-12 w-12 rounded-full border border-slate-100 object-contain"
                />
              )}
              <p className="text-sm font-bold leading-tight text-slate-900">{homeLabel}</p>
            </div>

            {/* Score / vs */}
            <div className="flex flex-col items-center gap-1">
              {isCompleted ? (
                <div className="text-4xl font-black tabular-nums text-slate-950">
                  {currentMatch.home_score} <span className="font-light text-slate-400">–</span> {currentMatch.away_score}
                </div>
              ) : (
                <div className="text-2xl font-black text-slate-300">vs</div>
              )}
              {countdown && (
                <p className="mt-1 text-center text-xs text-slate-400">
                  tra {countdown}
                </p>
              )}
            </div>

            {/* Away team */}
            <div className="flex flex-col items-center gap-2 text-center">
              {currentMatch.away_logo_url && (
                <img
                  src={currentMatch.away_logo_url}
                  alt={awayLabel}
                  className="h-12 w-12 rounded-full border border-slate-100 object-contain"
                />
              )}
              <p className="text-sm font-bold leading-tight text-slate-900">{awayLabel}</p>
            </div>
          </div>

          {/* Tries row */}
          {isCompleted && (currentMatch.home_tries != null || currentMatch.away_tries != null) && (
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center text-xs text-slate-400">
              <span>{currentMatch.home_tries ?? 0} mete</span>
              <span className="font-medium text-slate-300">mete</span>
              <span>{currentMatch.away_tries ?? 0} mete</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="border-t border-slate-100 px-5 py-4 space-y-3">
          {currentMatch.scheduled_at && (
            <DetailRow icon={<Clock className="h-4 w-4" />} label="Orario">
              {format(new Date(currentMatch.scheduled_at), "EEEE d MMMM yyyy, HH:mm", { locale: it })}
            </DetailRow>
          )}
          {currentMatch.field_name && (
            <DetailRow icon={<MapPin className="h-4 w-4" />} label="Campo">
              {stripFieldCategory(currentMatch.field_name)}{currentMatch.field_number ? ` — Campo ${currentMatch.field_number}` : ''}
            </DetailRow>
          )}
          {currentMatch.match_duration_minutes && (
            <DetailRow icon={<Timer className="h-4 w-4" />} label="Durata">
              {currentMatch.match_duration_minutes} minuti
            </DetailRow>
          )}
          {currentMatch.referee && (
            <DetailRow icon={<User className="h-4 w-4" />} label="Arbitro">
              {currentMatch.referee}
            </DetailRow>
          )}
        </div>

        {currentMatch.notes && (
          <div className="border-t border-yellow-100 bg-yellow-50 px-5 py-3 text-sm text-yellow-800">
            {currentMatch.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div>
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm text-slate-900">{children}</p>
      </div>
    </div>
  )
}

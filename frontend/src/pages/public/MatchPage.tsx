import { useParams, Link } from 'react-router-dom'
import { useMatch } from '@/api/tournaments'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import { ArrowLeft, Clock, MapPin, User } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Programmata',
  IN_PROGRESS: 'In corso',
  COMPLETED: 'Completata',
  CANCELLED: 'Cancellata',
  POSTPONED: 'Rinviata',
}

export default function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>()
  const { data: match, isLoading, error } = useMatch(matchId!)

  if (isLoading) return <LoadingSpinner className="py-16" />
  if (error) return <ErrorMessage message="Partita non trovata" />
  if (!match) return null

  return (
    <div className="max-w-lg mx-auto">
      <div className="bg-rugby-green text-white px-4 pt-4 pb-8">
        <Link to=".." className="flex items-center gap-1 text-white/70 text-sm mb-4">
          <ArrowLeft className="h-4 w-4" />
          Indietro
        </Link>

        {match.bracket_round && (
          <p className="text-white/70 text-xs uppercase tracking-wider mb-2">{match.bracket_round}</p>
        )}

        {/* Score display */}
        <div className="grid grid-cols-3 items-center gap-4 py-4">
          <p className="text-center font-bold text-lg">
            {match.home_team_id ? match.home_team_id.slice(0, 8) : 'TBD'}
          </p>
          <div className="text-center">
            {match.status === 'COMPLETED' ? (
              <div className="text-4xl font-black">
                {match.home_score} – {match.away_score}
              </div>
            ) : (
              <div className="text-white/70 font-medium">vs</div>
            )}
            <p className="text-xs text-white/60 mt-1">{statusLabels[match.status] || match.status}</p>
          </div>
          <p className="text-center font-bold text-lg">
            {match.away_team_id ? match.away_team_id.slice(0, 8) : 'TBD'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="px-4 py-4 space-y-3">
        {match.scheduled_at && (
          <DetailRow icon={<Clock className="h-4 w-4" />} label="Orario">
            {format(new Date(match.scheduled_at), "EEEE d MMMM yyyy, HH:mm", { locale: it })}
          </DetailRow>
        )}
        {match.field_name && (
          <DetailRow icon={<MapPin className="h-4 w-4" />} label="Campo">
            {match.field_name}{match.field_number ? ` — Campo ${match.field_number}` : ''}
          </DetailRow>
        )}
        {match.referee && (
          <DetailRow icon={<User className="h-4 w-4" />} label="Arbitro">
            {match.referee}
          </DetailRow>
        )}
        {match.notes && (
          <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3 text-sm text-yellow-800">
            {match.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100">
      <span className="text-rugby-green mt-0.5">{icon}</span>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-900 mt-0.5">{children}</p>
      </div>
    </div>
  )
}

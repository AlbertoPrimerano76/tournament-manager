import { Link } from 'react-router-dom'
import { Clock, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { Match } from '@/api/tournaments'

interface Props {
  match: Match
  homeTeamName?: string
  awayTeamName?: string
}

const statusColors: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  POSTPONED: 'bg-gray-100 text-gray-700',
}

const statusLabels: Record<string, string> = {
  SCHEDULED: 'Programmata',
  IN_PROGRESS: 'In corso',
  COMPLETED: 'Completata',
  CANCELLED: 'Cancellata',
  POSTPONED: 'Rinviata',
}

export default function MatchCard({ match, homeTeamName, awayTeamName }: Props) {
  return (
    <Link to={`/partite/${match.id}`} className="block bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[match.status] || 'bg-gray-100 text-gray-700'}`}>
            {statusLabels[match.status] || match.status}
          </span>
          {match.bracket_round && (
            <span className="text-xs text-gray-500 font-medium">{match.bracket_round}</span>
          )}
        </div>

        {/* Teams & Score */}
        <div className="grid grid-cols-3 items-center gap-2">
          <div className="text-right">
            <p className="font-semibold text-gray-900 text-sm">{homeTeamName || 'TBD'}</p>
          </div>
          <div className="text-center">
            {match.status === 'COMPLETED' ? (
              <div className="flex items-center justify-center gap-1">
                <span className="text-2xl font-bold text-gray-900">{match.home_score}</span>
                <span className="text-gray-400">–</span>
                <span className="text-2xl font-bold text-gray-900">{match.away_score}</span>
              </div>
            ) : (
              <span className="text-gray-400 font-medium text-lg">vs</span>
            )}
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-900 text-sm">{awayTeamName || 'TBD'}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
          {match.scheduled_at && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {format(new Date(match.scheduled_at), 'HH:mm', { locale: it })}
            </div>
          )}
          {match.field_name && (
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {match.field_name}{match.field_number ? ` #${match.field_number}` : ''}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

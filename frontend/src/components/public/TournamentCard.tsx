import { Link } from 'react-router-dom'
import { Calendar, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { EVENT_TYPE_LABELS, type Tournament } from '@/api/tournaments'

interface Props {
  tournament: Tournament
}

export default function TournamentCard({ tournament }: Props) {
  return (
    <Link
      to={`/tornei/${tournament.slug}`}
      className="block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow active:scale-95"
    >
      <div className="bg-rugby-green h-2" />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-900 text-lg leading-tight">{tournament.name}</h3>
            {tournament.edition && (
              <p className="text-sm text-gray-500 mt-0.5">{tournament.edition}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="shrink-0 bg-rugby-green/10 text-rugby-green text-xs font-semibold px-2 py-1 rounded-full">
              {tournament.year}
            </span>
            <span className="shrink-0 bg-slate-100 text-slate-600 text-[11px] font-bold uppercase px-2 py-1 rounded-full tracking-[0.14em]">
              {EVENT_TYPE_LABELS[tournament.event_type]}
            </span>
          </div>
        </div>

        <div className="mt-3 space-y-1">
          {tournament.start_date && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Calendar className="h-4 w-4 text-rugby-green shrink-0" />
              <span>
                {format(new Date(tournament.start_date), 'd MMM yyyy', { locale: it })}
                {tournament.end_date && tournament.end_date !== tournament.start_date && (
                  <> – {format(new Date(tournament.end_date), 'd MMM yyyy', { locale: it })}</>
                )}
              </span>
            </div>
          )}
          {tournament.location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="h-4 w-4 text-rugby-green shrink-0" />
              <span>{tournament.location}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

import { Calendar, Clock3, Trophy, Building2, CheckCircle2, ArrowRight, BookOpen } from 'lucide-react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useDashboardSummary } from '@/api/dashboard'
import { useAuth } from '@/context/AuthContext'

export default function DashboardPage() {
  const { data, isLoading } = useDashboardSummary()
  const { user } = useAuth()

  if (isLoading || !data || !user) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento dashboard...</div>
  }

  const isScoreKeeper = user.role === 'SCORE_KEEPER'
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="bg-[linear-gradient(135deg,_#103e31_0%,_#14523f_58%,_#1c6a51_100%)] px-7 py-8 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/75">Dashboard</p>
          <h1 className="mt-3 text-3xl font-black">
            {isScoreKeeper ? 'Segnapunti operativo' : 'Controllo tornei e attività'}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50/80">
            {isScoreKeeper
              ? 'Accedi subito ai tornei assegnati, entra nel torneo di oggi e aggiorna risultati e ritardi senza passare da schermate inutili.'
              : 'Panoramica reale di tornei, società e partite. Da qui controlli stato pubblicazione, avanzamento gare e calendario operativo.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link to="/admin/tornei" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#103e31]">
              {isScoreKeeper ? 'Apri i miei tornei' : 'Vai ai tornei'}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/admin/guida" className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white">
              <BookOpen className="h-4 w-4" />
              Guida rapida
            </Link>
            {isScoreKeeper && data.quick_access_tournament_id && (
              <Link
                to={`/admin/tornei/${data.quick_access_tournament_id}/gestione`}
                className="inline-flex items-center gap-2 rounded-full border border-amber-200/40 bg-amber-300/15 px-5 py-3 text-sm font-semibold text-amber-50"
              >
                Torneo odierno
                <Clock3 className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {isScoreKeeper ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard icon={<Trophy className="h-6 w-6 text-rugby-green" />} label="Tornei assegnati" value={String(data.tournaments.length)} />
            <StatCard icon={<Calendar className="h-6 w-6 text-rugby-green" />} label="Partite oggi" value={String(data.matches_today)} />
            <StatCard icon={<CheckCircle2 className="h-6 w-6 text-rugby-green" />} label="Partite concluse" value={String(data.completed_matches)} />
          </div>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700/70">Accesso rapido</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Tornei da seguire</h2>
              <div className="mt-4 space-y-3">
                {data.tournaments.map((tournament) => (
                  <Link key={tournament.id} to={`/admin/tornei/${tournament.id}/gestione`} className="flex items-center justify-between gap-3 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:bg-white">
                    <div>
                      <p className="font-semibold text-slate-900">{tournament.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {tournament.today_matches > 0 ? `${tournament.today_matches} partite oggi` : 'Nessuna partita oggi'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700/70">Guida rapida</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Cosa fare oggi</h2>
              <div className="mt-4 space-y-3">
                {[
                  'Apri il torneo assegnato dal calendario qui a fianco.',
                  'Entra nella categoria corretta e usa il tabellino partita.',
                  'Inserisci punteggio, ora fine e lascia al sistema il calcolo del ritardo.',
                ].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-black text-white">{index + 1}</span>
                    <p className="text-sm text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard icon={<Trophy className="h-6 w-6 text-rugby-green" />} label="Tornei pubblicati" value={String(data.published_tournaments)} />
            <StatCard icon={<Building2 className="h-6 w-6 text-rugby-green" />} label="Società" value={String(data.organizations_count)} />
            <StatCard icon={<Calendar className="h-6 w-6 text-rugby-green" />} label="Partite oggi" value={String(data.matches_today)} />
          </div>

          <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700/70">Grafico tornei</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Stato pubblicazione</h2>
              <div className="mt-5 flex items-center gap-6">
                <div
                  className="relative flex h-36 w-36 items-center justify-center rounded-full"
                  style={{ background: `conic-gradient(#15803d 0 ${data.published_tournaments && data.tournaments.length ? Math.round((data.published_tournaments / data.tournaments.length) * 100) : 0}%, #dbeafe 0 100%)` }}
                >
                  <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
                    <span className="text-2xl font-black text-slate-950">{data.tournaments.length ? Math.round((data.published_tournaments / data.tournaments.length) * 100) : 0}%</span>
                    <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Live</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <LegendRow label="Pubblicati" value={data.published_tournaments} color="#15803d" />
                  <LegendRow label="Bozze" value={Math.max(data.tournaments.length - data.published_tournaments, 0)} color="#93c5fd" />
                  <LegendRow label="Totale tornei" value={data.tournaments.length} color="#0f172a" />
                </div>
              </div>
            </div>

            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-700/70">Grafico partite</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Stato partite</h2>
              <div className="mt-5 space-y-4">
                <ProgressRow label="Concluse" value={data.completed_matches} total={data.total_matches} colorClass="bg-emerald-500" />
                <ProgressRow label="Da giocare" value={data.scheduled_matches} total={data.total_matches} colorClass="bg-sky-500" />
                <ProgressRow label="In corso" value={data.in_progress_matches} total={data.total_matches} colorClass="bg-amber-500" />
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Avanzamento tornei</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Situazione per torneo</h2>
              <div className="mt-4 space-y-3">
                {data.tournaments.map((tournament) => (
                  <Link key={tournament.id} to={`/admin/tornei/${tournament.id}/modifica`} className="block rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4 transition-colors hover:bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{tournament.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{tournament.organization_name ?? 'Società non definita'}</p>
                      </div>
                      <span className="text-sm font-black text-slate-900">{tournament.total_matches > 0 ? Math.round((tournament.completed_matches / tournament.total_matches) * 100) : 0}%</span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[linear-gradient(90deg,_#0f766e_0%,_#22c55e_100%)]" style={{ width: `${tournament.total_matches > 0 ? Math.max((tournament.completed_matches / tournament.total_matches) * 100, 4) : 4}%` }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{tournament.completed_matches}/{tournament.total_matches} concluse</span>
                      <span>{tournament.today_matches} oggi</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-700/70">Calendario tornei</p>
              <h2 className="mt-2 text-lg font-black text-slate-950">Agenda attività</h2>
              <div className="mt-4 space-y-3">
                {data.tournaments.map((tournament) => (
                  <div key={`calendar-${tournament.id}`} className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{tournament.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatTournamentDateRange(tournament.start_date, tournament.end_date)}
                        </p>
                      </div>
                      {tournament.today_matches > 0 && (
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Oggi</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/80 bg-white p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.35)]">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-rugby-green/10 p-3">{icon}</div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-black text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

function LegendRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <span className="text-sm font-black text-slate-950">{value}</span>
    </div>
  )
}

function ProgressRow({ label, value, total, colorClass }: { label: string; value: number; total: number; colorClass: string }) {
  const width = total > 0 ? Math.max((value / total) * 100, value > 0 ? 4 : 0) : 0
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-800">{label}</span>
        <span className="font-black text-slate-950">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function formatTournamentDateRange(startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return 'Date non impostate'
  if (startDate && endDate && startDate !== endDate) {
    return `${format(new Date(startDate), 'd MMM', { locale: it })} - ${format(new Date(endDate), 'd MMM yyyy', { locale: it })}`
  }
  const value = startDate || endDate
  return value ? format(new Date(value), 'd MMM yyyy', { locale: it }) : 'Date non impostate'
}

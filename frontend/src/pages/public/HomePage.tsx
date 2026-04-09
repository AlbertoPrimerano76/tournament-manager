import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { EVENT_TYPE_LABELS, useTournaments, type Tournament } from '@/api/tournaments'

export default function HomePage() {
  const { data: tournaments } = useTournaments()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const eventTypeFilter = (searchParams.get('type') ?? 'all') as 'all' | Tournament['event_type']
  const yearFilter = searchParams.get('year') ?? 'all'

  function setFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === 'all' || value === '') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      return next
    }, { replace: true })
  }

  const filteredTournaments = (tournaments ?? []).filter((tournament) => {
    const matchesSearch = search.trim().length === 0
      || tournament.name.toLowerCase().includes(search.toLowerCase())
      || (tournament.organization_name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchesType = eventTypeFilter === 'all' || tournament.event_type === eventTypeFilter
    const matchesYear = yearFilter === 'all' || String(tournament.year) === yearFilter
    return matchesSearch && matchesType && matchesYear
  })
  const groupedByOrganization = filteredTournaments.reduce<Record<string, Tournament[]>>((acc, tournament) => {
    const key = tournament.organization_slug || tournament.organization_id
    acc[key] = acc[key] ?? []
    acc[key].push(tournament)
    return acc
  }, {})

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e9fff2_0%,_#f6f8fb_38%,_#edf2f7_100%)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Events list — primary content for public visitors */}
        <section className="rounded-[1.8rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Tornei &amp; Raggruppamenti</p>
              <h1 className="mt-1 text-2xl font-black text-slate-950">Trova il tuo evento</h1>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(e) => setFilter('q', e.target.value)}
                placeholder="Cerca società o evento"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
              <select value={eventTypeFilter} onChange={(e) => setFilter('type', e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                <option value="all">Tutti i tipi</option>
                <option value="TOURNAMENT">Tornei</option>
                <option value="GATHERING">Raggruppamenti</option>
              </select>
              <select value={yearFilter} onChange={(e) => setFilter('year', e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                <option value="all">Tutti gli anni</option>
                {Array.from(new Set((tournaments ?? []).map((tournament) => String(tournament.year)))).sort((left, right) => Number(right) - Number(left)).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            {filteredTournaments.length > 0 ? Object.entries(groupedByOrganization).map(([organizationKey, organizationTournaments]) => {
              const organization = organizationTournaments?.[0]
              if (!organizationTournaments || !organization) return null
              return (
                <section key={organizationKey} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-slate-950">{organization.organization_name}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {organizationTournaments.length} eventi pubblicati
                      </p>
                    </div>
                    {organization.organization_slug && (
                      <Link to={`/${organization.organization_slug}`} className="text-sm font-semibold text-emerald-700">
                        Apri società
                      </Link>
                    )}
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {organizationTournaments.map((tournament) => (
                      <Link
                        key={tournament.id}
                        to={`/tornei/${tournament.slug}`}
                        className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-base font-black text-slate-950">{tournament.name}</p>
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                            {EVENT_TYPE_LABELS[tournament.event_type]}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{tournament.start_date ? new Date(tournament.start_date).toLocaleDateString('it-IT') : 'Data da definire'}</p>
                        <p className="mt-3 text-sm font-semibold text-emerald-700">Apri evento</p>
                      </Link>
                    ))}
                  </div>
                </section>
              )
            }) : (
              <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                Nessun evento pubblicato corrisponde ai filtri selezionati.
              </div>
            )}
          </div>
        </section>

        {/* Platform info — secondary, for organisers */}
        <div className="mt-6 flex flex-col items-center gap-3 rounded-[1.4rem] border border-white/60 bg-[#0e3b2e]/90 px-6 py-5 text-center sm:flex-row sm:text-left">
          <div className="flex-1">
            <p className="text-sm font-bold text-white">Sei un organizzatore?</p>
            <p className="mt-0.5 text-xs text-white/60">Gestisci tornei, squadre e campi dall'area amministrativa.</p>
          </div>
          <Link
            to="/admin"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#0e3b2e] transition-transform hover:-translate-y-0.5"
          >
            Area amministrativa
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}


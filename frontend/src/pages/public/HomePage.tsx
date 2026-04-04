import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Shield, Trophy, ArrowRight, MapPinned } from 'lucide-react'
import { EVENT_TYPE_LABELS, useTournaments, type Tournament } from '@/api/tournaments'

export default function HomePage() {
  const { data: tournaments } = useTournaments()
  const [search, setSearch] = useState('')
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | Tournament['event_type']>('all')
  const [yearFilter, setYearFilter] = useState('all')
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
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-[#0e3b2e] px-8 py-10 text-white shadow-[0_30px_80px_-35px_rgba(14,59,46,0.65)]">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-emerald-300/20 blur-2xl" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                <Shield className="h-3.5 w-3.5" />
                Gestione Tornei Rugby
              </div>

              <h1 className="mt-5 max-w-xl text-4xl font-black leading-tight sm:text-5xl">
                Tornei, campi, risultati e organizzazione in un unico spazio.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/70 sm:text-base">
                Portale pubblico per seguire i tornei e area amministrativa per gestire società,
                squadre, campi di gioco e pubblicazione delle informazioni.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/admin"
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#0e3b2e] transition-transform hover:-translate-y-0.5"
                >
                  Apri area amministrativa
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-4">
            <InfoCard
              icon={<Trophy className="h-5 w-5" />}
              title="Pagine torneo più complete"
              text="Categorie, descrizione, mappa generale e ora anche elenco campi con indirizzo, foto e Google Maps."
            />
            <InfoCard
              icon={<MapPinned className="h-5 w-5" />}
              title="Campi per ogni torneo"
              text="Ogni torneo può avere più campi configurati direttamente dal pannello amministrativo."
            />
            <InfoCard
              icon={<Shield className="h-5 w-5" />}
              title="Area amministrativa più ordinata"
              text="Le sezioni admin sono state rese più chiare, leggibili e visivamente coerenti."
            />
          </section>
        </div>

        <section className="mt-8 rounded-[1.8rem] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Eventi attivi</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Apri una società e i suoi eventi</h2>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca società o evento"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
              />
              <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value as 'all' | Tournament['event_type'])} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
                <option value="all">Tutti i tipi</option>
                <option value="TOURNAMENT">Tornei</option>
                <option value="GATHERING">Raggruppamenti</option>
              </select>
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
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
      </div>
    </div>
  )
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode
  title: string
  text: string
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </div>
  )
}

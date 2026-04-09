import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { usePublicOrganization } from '@/api/organizations'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { EVENT_TYPE_LABELS, type Tournament } from '@/api/tournaments'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import { ExternalLink, Calendar, MapPin, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default function OrgPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const { data: org, isLoading, error } = usePublicOrganization(orgSlug!)
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''
  const eventTypeFilter = (searchParams.get('type') ?? 'all') as 'all' | Tournament['event_type']
  const yearFilter = searchParams.get('year') ?? 'all'

  function setFilter(key: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === 'all' || value === '') { next.delete(key) } else { next.set(key, value) }
      return next
    }, { replace: true })
  }

  const { data: tournaments } = useQuery({
    queryKey: ['public-org-tournaments', orgSlug],
    queryFn: async () => {
      const res = await apiClient.get<Tournament[]>(`/api/v1/tournaments?organization_slug=${orgSlug}`)
      return res.data
    },
    enabled: !!orgSlug,
  })

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingSpinner className="py-16" />
      </div>
    )
  }

  if (error || !org) {
    return <ErrorMessage message="Società non trovata" />
  }

  const filteredTournaments = useMemo(() => (tournaments ?? []).filter((tournament) => {
    const matchesSearch = search.trim().length === 0 || tournament.name.toLowerCase().includes(search.toLowerCase())
    const matchesType = eventTypeFilter === 'all' || tournament.event_type === eventTypeFilter
    const matchesYear = yearFilter === 'all' || String(tournament.year) === yearFilter
    return matchesSearch && matchesType && matchesYear
  }), [eventTypeFilter, search, tournaments, yearFilter])

  const tournamentsByYear = filteredTournaments.reduce<Record<string, Tournament[]>>((acc, tournament) => {
    const key = String(tournament.year)
    acc[key] = acc[key] ?? []
    acc[key].push(tournament)
    return acc
  }, {})

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
      <div className="mb-3">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700">
          ← Tutti gli eventi
        </Link>
      </div>
      <section className="surface-panel overflow-hidden border-emerald-100 bg-[linear-gradient(135deg,_#ffffff_0%,_#f7fcf8_58%,_#eefbf2_100%)]">
        <div className="p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <div
              className="flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm"
            >
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name} className="h-14 w-14 object-contain" />
              ) : (
                <span className="text-lg font-black text-slate-700">{org.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700/70">Società organizzatrice</p>
              <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-4xl">{org.name}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Qui trovi tornei, categorie, risultati, classifiche e indicazioni per raggiungere i campi.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                  {tournaments?.length ?? 0} tornei disponibili
                </span>
                {org.website && (
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Sito ufficiale
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="surface-panel mt-4 border-emerald-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 sm:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700/70">Eventi</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">Calendario attività</h2>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={(e) => setFilter('q', e.target.value)}
            placeholder="Cerca evento"
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

        {filteredTournaments.length > 0 ? (
          <div className="space-y-5">
            {Object.entries(tournamentsByYear)
              .sort((left, right) => Number(right[0]) - Number(left[0]))
              .map(([year, yearTournaments]) => (
                <section key={year}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-900">{year}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {yearTournaments.length} eventi
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {yearTournaments.map((t) => (
                      <Link
                        key={t.id}
                        to={`/tornei/${t.slug}`}
                        className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/60 hover:shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-base font-bold text-slate-900">{t.name}</p>
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-700">
                              {EVENT_TYPE_LABELS[t.event_type]}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {t.start_date && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <Calendar className="h-3.5 w-3.5" />
                                {format(new Date(t.start_date), 'd MMM yyyy', { locale: it })}
                              </span>
                            )}
                            {t.location && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                <MapPin className="h-3.5 w-3.5" />
                                {t.location}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nessun evento pubblicato corrisponde ai filtri selezionati.
          </div>
        )}
      </section>
      </div>
    </div>
  )
}

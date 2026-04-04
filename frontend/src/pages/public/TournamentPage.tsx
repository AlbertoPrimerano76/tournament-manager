import { useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { EVENT_TYPE_LABELS, useTournament, useTournamentAgeGroups, useTournamentProgram } from '@/api/tournaments'
import { usePublicTournamentFields } from '@/api/fields'
import { usePublicTournamentOrganization } from '@/api/organizations'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import SponsorBar from '@/components/public/SponsorBar'
import { Calendar, MapPin, ChevronRight, MapPinned, Navigation, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export default function TournamentPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data: tournament, isLoading: loadingT, error: errorT } = useTournament(slug!)
  const { data: ageGroups, isLoading: loadingAG } = useTournamentAgeGroups(slug!)
  const { data: tournamentProgram, isLoading: loadingProgram } = useTournamentProgram(slug!)
  const { data: fields, isLoading: loadingFields } = usePublicTournamentFields(slug!)
  const { data: organization, isLoading: loadingOrg } = usePublicTournamentOrganization(slug!)

  if (loadingT || loadingAG || loadingFields || loadingOrg || loadingProgram) return <LoadingSpinner className="py-16" />
  if (errorT) return <ErrorMessage message="Evento non trovato" />
  if (!tournament) return null

  useEffect(() => {
    if (slug && tournament.slug !== slug) {
      navigate(`/tornei/${tournament.slug}`, { replace: true })
    }
  }, [navigate, slug, tournament.slug])

  const theme = getTournamentTheme(tournament)
  const heroMedia = tournament.venue_map_url ?? tournament.logo_url ?? null

  return (
    <div className="page-shell" style={theme.pageStyle}>
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
      <section className="surface-panel relative overflow-hidden" style={{ borderColor: theme.softBorder, background: theme.heroSurface }}>
        {heroMedia && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-[34%] bg-cover bg-center opacity-[0.18] md:block"
              style={{ backgroundImage: `url(${heroMedia})` }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: theme.heroOverlay }}
            />
          </>
        )}
        {tournament.logo_url && (
          <div className="relative flex justify-center border-b px-4 py-5" style={{ borderColor: theme.heroDivider, background: theme.heroTopStrip }}>
            <img src={tournament.logo_url} alt={tournament.name} className="h-20 w-auto object-contain" />
          </div>
        )}

        <div className="relative p-5 sm:p-7">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: theme.heroEyebrow }}>
              {EVENT_TYPE_LABELS[tournament.event_type]}
            </p>
            <h1 className="mt-2 text-2xl font-black sm:text-4xl" style={{ color: theme.heroText }}>{tournament.name}</h1>
          </div>
          {tournament.edition && <p className="mt-1 text-sm" style={{ color: theme.heroSubtext }}>{tournament.edition}</p>}

          <div className="mt-5 flex flex-wrap gap-2">
            {tournament.start_date && (
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm" style={{ background: theme.heroPillBg, color: theme.heroPillText }}>
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(tournament.start_date), 'd MMM yyyy', { locale: it })}
                {tournament.end_date && tournament.end_date !== tournament.start_date && (
                  <> - {format(new Date(tournament.end_date), 'd MMM yyyy', { locale: it })}</>
                )}
              </span>
            )}
            {tournament.location && (
              <span className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm" style={{ background: theme.heroPillBg, color: theme.heroPillText }}>
                <MapPin className="h-3.5 w-3.5" />
                {tournament.location}
              </span>
            )}
            {organization && (
              <Link
                to={`/${organization.slug}`}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{ borderColor: theme.heroCardBorder, background: theme.heroPillBg, color: theme.heroPillText }}
              >
                <Building2 className="h-3.5 w-3.5" />
                Pagina società
              </Link>
            )}
          </div>

          {tournament.description && (
            <p className="mt-4 max-w-3xl text-sm leading-6" style={{ color: theme.heroSubtext }}>{tournament.description}</p>
          )}

          <div className="mt-6 border-t pt-5" style={{ borderColor: theme.heroDivider }}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: theme.heroEyebrow }}>Impianti</p>
                <h2 className="mt-1 text-lg font-black" style={{ color: theme.heroText }}>Come arrivare</h2>
              </div>
            </div>

            {fields && fields.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {fields.map((field) => (
                  <div key={field.id} className="rounded-[1.5rem] border bg-white p-3 shadow-sm" style={{ borderColor: theme.softBorder }}>
                    <div className="grid gap-3 sm:grid-cols-[1fr_112px] sm:items-start">
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-base font-bold text-slate-900">{field.name}</p>
                            {field.address && (
                              <p className="mt-1 text-sm leading-6 text-slate-600">{field.address}</p>
                            )}
                          </div>
                          <MapPinned className="mt-1 h-5 w-5 shrink-0" style={{ color: theme.softBorder }} />
                        </div>

                        {field.maps_url && (
                          <div className="mt-3">
                            <a
                              href={field.maps_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm"
                              style={{ backgroundColor: theme.primary }}
                            >
                              <Navigation className="h-4 w-4" />
                              Apri Google Maps
                            </a>
                          </div>
                        )}
                      </div>

                      {(field.photo_url || tournament.venue_map_url) && (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <img
                            src={field.photo_url ?? tournament.venue_map_url ?? ''}
                            alt={field.photo_url ? field.name : 'Mappa sede'}
                            className="h-28 w-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Nessun impianto configurato per questo evento.
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mt-4">
        <SponsorBar
          images={tournament.sponsor_images}
          accentColor={tournament.theme_accent_color}
          primaryColor={tournament.theme_primary_color}
        />
      </div>

      <section className="surface-panel mt-4 p-4 sm:p-5" style={{ borderColor: theme.softBorder, background: theme.sectionSurface }}>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: theme.primaryMuted }}>Categorie</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">Gironi, partite e giornate</h2>
        </div>

        {ageGroups && ageGroups.length > 0 ? (
          <div className="space-y-3">
            {ageGroups.map((ag) => (
              (() => {
                const programAgeGroup = tournamentProgram?.age_groups.find((item) => item.age_group_id === ag.id)
                const programMatches = programAgeGroup?.days.flatMap((day) => day.phases.flatMap((phase) => [
                  ...phase.knockout_matches,
                  ...phase.groups.flatMap((group) => group.matches),
                ])) ?? []
                const firstMatch = [...programMatches]
                  .filter((match) => !!match.scheduled_at)
                  .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0]
                const fieldCount = new Set(programMatches.filter((match) => match.field_name).map((match) => `${match.field_name}-${match.field_number ?? 'x'}`)).size
                const facilityNames = Array.from(
                  new Set(programMatches.filter((match) => match.field_name).map((match) => match.field_name as string)),
                )

                return (
                  <Link
                    key={ag.id}
                    to={`/tornei/${slug}/${ag.id}`}
                    className="flex items-center justify-between gap-3 rounded-[1.5rem] border px-4 py-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
                    style={{
                      borderColor: theme.softBorder,
                      background: getAgeGroupCardBackground(theme, ag.age_group),
                    }}
                  >
                    <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
                      style={{ backgroundColor: getAgeGroupBadgeColor(theme, ag.age_group) }}
                    >
                      {ag.age_group}
                    </span>
                    <p className="text-base font-bold text-slate-900">{ag.display_name || formatAgeGroup(ag.age_group)}</p>
                  </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Apri per vedere partite, classifica e fasi della categoria.
                      </p>
                      {(firstMatch || fieldCount > 0) && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {firstMatch?.scheduled_at && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                              <Calendar className="h-3.5 w-3.5" />
                              Inizio {format(new Date(firstMatch.scheduled_at), 'HH:mm', { locale: it })}
                            </span>
                          )}
                          {fieldCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                              <MapPinned className="h-3.5 w-3.5" />
                              {fieldCount} {fieldCount === 1 ? 'campo' : 'campi'}
                            </span>
                          )}
                          {facilityNames.length > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                              <Building2 className="h-3.5 w-3.5" />
                              {facilityNames.join(' · ')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </Link>
                )
              })()
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Nessuna categoria configurata.
          </div>
        )}
      </section>

      {tournament.venue_map_url && (
        <section className="surface-panel mt-4 p-4 sm:p-5" style={{ borderColor: theme.softBorder, background: theme.sectionSurface }}>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Mappa generale</p>
            <h2 className="mt-1 text-xl font-black text-slate-900">Piantina della sede</h2>
          </div>
          <img
            src={tournament.venue_map_url}
            alt="Mappa della sede"
            className="w-full rounded-2xl object-cover"
          />
        </section>
      )}
      </div>
    </div>
  )
}

function getTournamentTheme(tournament: { theme_primary_color: string | null; theme_accent_color: string | null }) {
  const primary = tournament.theme_primary_color || '#166534'
  const accent = tournament.theme_accent_color || '#d97706'
  const isDark = isDarkColor(primary)
  return {
    primary,
    accent,
    primaryMuted: `${primary}cc`,
    softBorder: `${primary}22`,
    softFill: `${accent}14`,
    heroSurface: isDark
      ? `linear-gradient(135deg, ${primary} 0%, ${primary}f0 52%, ${accent}18 100%)`
      : `linear-gradient(135deg, ${primary}18 0%, #ffffff 42%, ${accent}1c 100%)`,
    heroOverlay: isDark
      ? 'linear-gradient(90deg, rgba(12,18,28,0.94) 0%, rgba(20,28,38,0.92) 58%, rgba(20,28,38,0.7) 100%)'
      : 'linear-gradient(90deg, rgba(255,255,255,0.94) 0%, rgba(255,255,255,0.9) 58%, rgba(255,255,255,0.7) 100%)',
    heroTopStrip: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)',
    heroDivider: isDark ? `${accent}66` : `${primary}22`,
    heroText: isDark ? '#f8fafc' : '#0f172a',
    heroSubtext: isDark ? 'rgba(241,245,249,0.8)' : '#475569',
    heroEyebrow: isDark ? accent : `${primary}cc`,
    heroCardBg: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.8)',
    heroCardBorder: isDark ? 'rgba(255,255,255,0.12)' : `${primary}22`,
    heroCardText: isDark ? '#f8fafc' : '#334155',
    heroPillBg: isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
    heroPillText: isDark ? '#f8fafc' : '#334155',
    sectionSurface: `linear-gradient(180deg, ${primary}08 0%, #ffffff 25%, ${accent}10 100%)`,
    pageStyle: {
      background: isDark
        ? `radial-gradient(circle at top, ${primary}2a 0%, #f3f6fb 34%, #e8edf5 100%)`
        : `radial-gradient(circle at top, ${primary}18 0%, #f8fafc 40%, #edf2f7 100%)`,
    },
  }
}

function isDarkColor(hex: string) {
  const normalized = hex.replace('#', '')
  const safeHex = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0')
  const red = Number.parseInt(safeHex.slice(0, 2), 16)
  const green = Number.parseInt(safeHex.slice(2, 4), 16)
  const blue = Number.parseInt(safeHex.slice(4, 6), 16)
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
  return luminance < 0.45
}

function formatAgeGroup(ageGroup: string) {
  return ageGroup.replace('U', 'Under ')
}

function getAgeGroupCardBackground(theme: ReturnType<typeof getTournamentTheme>, ageGroup: string) {
  const alphaMap: Record<string, string> = {
    U6: '12',
    U8: '16',
    U10: '10',
    U12: '1b',
  }
  const accentAlpha = alphaMap[ageGroup] ?? '12'
  return `linear-gradient(135deg, ${theme.primary}10 0%, #ffffff 52%, ${theme.accent}${accentAlpha} 100%)`
}

function getAgeGroupBadgeColor(theme: ReturnType<typeof getTournamentTheme>, ageGroup: string) {
  const badgeMap: Record<string, string> = {
    U6: theme.accent,
    U8: theme.primary,
    U10: theme.primary,
    U12: theme.accent,
  }
  return badgeMap[ageGroup] ?? theme.primary
}

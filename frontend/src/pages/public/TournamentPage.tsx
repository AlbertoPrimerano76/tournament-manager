import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { EVENT_TYPE_LABELS, useTournament, useTournamentAgeGroups, useTournamentProgram } from '@/api/tournaments'
import { usePublicTournamentFields } from '@/api/fields'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import SponsorBar from '@/components/public/SponsorBar'
import { Calendar, MapPin, ChevronRight, MapPinned, Navigation, Route, X, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { stripFieldCategory } from '@/utils/dateFormat'

export default function TournamentPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { data: tournament, isLoading: loadingT, error: errorT } = useTournament(slug!)
  const { data: ageGroups, isLoading: loadingAG } = useTournamentAgeGroups(slug!)
  const { data: tournamentProgram, isLoading: loadingProgram } = useTournamentProgram(slug!)
  const { data: fields, isLoading: loadingFields } = usePublicTournamentFields(slug!)
  const [activeFieldPreview, setActiveFieldPreview] = useState<{ src: string; title: string } | null>(null)

  const theme = useMemo(
    () => getTournamentTheme(tournament ?? { theme_primary_color: null, theme_accent_color: null }),
    [tournament?.theme_primary_color, tournament?.theme_accent_color],
  )
  const sortedAgeGroups = useMemo(
    () => [...(ageGroups ?? [])].sort((left, right) => sortAgeGroupsAsc(left.age_group, right.age_group)),
    [ageGroups],
  )

  useEffect(() => {
    if (slug && tournament?.slug && tournament.slug !== slug) {
      navigate(`/tornei/${tournament.slug}`, { replace: true })
    }
  }, [navigate, slug, tournament?.slug])

  if (loadingT || loadingAG || loadingFields || loadingProgram) return <LoadingSpinner className="py-16" />
  if (errorT) return <ErrorMessage message="Evento non trovato" />
  if (!tournament) return null

  const heroMedia = tournament.venue_map_url ?? tournament.logo_url ?? null

  return (
    <div className="page-shell" style={theme.pageStyle}>
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
      {tournament.organization_slug && (
        <div className="mb-3">
          <Link
            to={`/${tournament.organization_slug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700"
          >
            ← {tournament.organization_name ?? 'Società'}
          </Link>
        </div>
      )}
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
        <div className="relative p-5 sm:p-7">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:gap-5">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: theme.heroEyebrow }}>
                {EVENT_TYPE_LABELS[tournament.event_type]}
              </p>
              <h1 className="mt-2 text-2xl font-black sm:text-4xl" style={{ color: theme.heroText }}>{tournament.name}</h1>
              {tournament.edition && <p className="mt-1 text-sm" style={{ color: theme.heroSubtext }}>{tournament.edition}</p>}
            </div>
            {tournament.logo_url && (
              <button
                type="button"
                onClick={() => setActiveFieldPreview({ src: tournament.logo_url!, title: tournament.name })}
                className="group relative self-start overflow-hidden rounded-[1.6rem] border p-2 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.85)] transition-transform hover:-translate-y-0.5"
                style={{ borderColor: theme.heroDivider, background: theme.heroCardBg }}
              >
                <div
                  className="absolute inset-0 opacity-80"
                  style={{ background: `linear-gradient(135deg, ${theme.accent}1e 0%, transparent 55%, ${theme.primary}22 100%)` }}
                />
                <img src={tournament.logo_url} alt={tournament.name} className="relative h-20 w-20 rounded-[1rem] object-contain bg-white/90 p-2 sm:h-32 sm:w-32 sm:rounded-[1.25rem]" />
              </button>
            )}
          </div>

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
              {tournament.venue_map_url && (
                <button
                  type="button"
                  onClick={() => setActiveFieldPreview({ src: tournament.venue_map_url!, title: 'Percorso tra i campi' })}
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-sm"
                  style={{ borderColor: theme.heroCardBorder, background: theme.heroPillBg, color: theme.heroPillText }}
                >
                  <Route className="h-4 w-4" />
                  Percorso tra i campi
                </button>
              )}
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

                      {field.photo_url && (
                        <button
                          type="button"
                          onClick={() => setActiveFieldPreview({ src: field.photo_url!, title: field.name })}
                          className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-transform hover:-translate-y-0.5"
                        >
                          <img
                            src={field.photo_url}
                            alt={field.name}
                            className="h-28 w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        </button>
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

        {sortedAgeGroups.length > 0 ? (
          <div className="space-y-3">
            {sortedAgeGroups.map((ag) => (
              (() => {
                const programAgeGroup = tournamentProgram?.age_groups.find((item) => item.age_group_id === ag.id)
                const programMatches = programAgeGroup?.days.flatMap((day) => day.phases.flatMap((phase) => [
                  ...phase.knockout_matches,
                  ...phase.groups.flatMap((group) => group.matches),
                ])) ?? []
                const firstMatch = [...programMatches]
                  .filter((match) => !!match.scheduled_at)
                  .sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime())[0]
                const fieldCount = new Set(programMatches.filter((match) => match.field_name).map((match) => `${stripFieldCategory(match.field_name!)}-${match.field_number ?? 'x'}`)).size
                const facilityNames = Array.from(
                  new Set(programMatches.filter((match) => match.field_name).map((match) => stripFieldCategory(match.field_name!))),
                )
                const cardStyle = getAgeGroupCardStyle(theme, ag.age_group)

                return (
                  <Link
                    key={ag.id}
                    to={`/tornei/${slug}/${ag.id}`}
                    className="relative flex items-center justify-between gap-3 overflow-hidden rounded-[1.5rem] border px-4 py-4 transition-all hover:-translate-y-0.5"
                    style={{
                      borderColor: cardStyle.borderColor,
                      background: cardStyle.background,
                      boxShadow: cardStyle.shadow,
                    }}
                  >
                    <div
                      className="pointer-events-none absolute inset-y-3 left-0 w-1 rounded-r-full"
                      style={{ background: cardStyle.accent }}
                    />
                    <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded-full px-2.5 py-1 text-xs font-bold text-white"
                      style={{ backgroundColor: cardStyle.badge }}
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
                    <ChevronRight className="h-5 w-5 shrink-0" style={{ color: cardStyle.badge }} />
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

      {activeFieldPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/82 p-4 backdrop-blur-sm" onClick={() => setActiveFieldPreview(null)}>
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setActiveFieldPreview(null)}
              aria-label="Chiudi anteprima"
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/80 text-white shadow-lg transition-colors hover:bg-slate-800"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="overflow-hidden rounded-[1.75rem] border border-white/15 bg-slate-950 shadow-[0_25px_80px_-30px_rgba(0,0,0,0.8)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Anteprima</p>
                  <p className="mt-1 text-base font-black text-white">{activeFieldPreview.title}</p>
                </div>
              </div>
              <img
                src={activeFieldPreview.src}
                alt={activeFieldPreview.title}
                className="max-h-[78vh] w-full object-contain bg-slate-900"
              />
            </div>
          </div>
        </div>
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

function sortAgeGroupsAsc(left: string, right: string) {
  const leftValue = Number(left.replace(/[^0-9]/g, ''))
  const rightValue = Number(right.replace(/[^0-9]/g, ''))
  if (!Number.isNaN(leftValue) && !Number.isNaN(rightValue)) {
    return leftValue - rightValue
  }
  return left.localeCompare(right)
}

// Static age-group colour palette — colours are from Tailwind (see tailwind.config.js `age-*` tokens)
const AGE_GROUP_PALETTE: Record<string, { accent: string; glow: string; tint: string; badge: string }> = {
  U6:  { accent: '#22c55e', glow: 'rgba(34,197,94,0.14)',   tint: 'rgba(34,197,94,0.12)',   badge: '#16a34a' },
  U8:  { accent: '#0ea5e9', glow: 'rgba(14,165,233,0.14)',  tint: 'rgba(14,165,233,0.12)',  badge: '#0284c7' },
  U10: { accent: '#f59e0b', glow: 'rgba(245,158,11,0.14)',  tint: 'rgba(245,158,11,0.12)',  badge: '#d97706' },
  U12: { accent: '#8b5cf6', glow: 'rgba(139,92,246,0.14)',  tint: 'rgba(139,92,246,0.12)',  badge: '#7c3aed' },
  U14: { accent: '#ec4899', glow: 'rgba(236,72,153,0.14)',  tint: 'rgba(236,72,153,0.12)',  badge: '#db2777' },
  U16: { accent: '#f97316', glow: 'rgba(249,115,22,0.14)',  tint: 'rgba(249,115,22,0.12)',  badge: '#ea580c' },
  U18: { accent: '#06b6d4', glow: 'rgba(6,182,212,0.14)',   tint: 'rgba(6,182,212,0.12)',   badge: '#0891b2' },
  U20: { accent: '#64748b', glow: 'rgba(100,116,139,0.14)', tint: 'rgba(100,116,139,0.12)', badge: '#475569' },
}

function getAgeGroupCardStyle(theme: ReturnType<typeof getTournamentTheme>, ageGroup: string) {
  const palette = AGE_GROUP_PALETTE[ageGroup] ?? { accent: theme.accent, glow: `${theme.accent}22`, tint: `${theme.accent}12`, badge: theme.primary }
  return {
    background: `linear-gradient(135deg, ${palette.tint} 0%, rgba(255,255,255,0.98) 42%, ${palette.glow} 100%)`,
    borderColor: palette.glow,
    shadow: `0 18px 40px -32px ${palette.accent}`,
    accent: palette.accent,
    badge: palette.badge,
  }
}

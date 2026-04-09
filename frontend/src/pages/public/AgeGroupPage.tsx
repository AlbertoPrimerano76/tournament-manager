import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink, Star } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  useAgeGroupProgram,
  useAgeGroupStandings,
  useTournament,
} from '@/api/tournaments'
import { usePublicTournamentFields } from '@/api/fields'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import SponsorBar from '@/components/public/SponsorBar'
import {
  TeamLogo,
  PublicMatchRow,
  StandingsTable,
  PodiumGrid,
  flattenPhases,
  filterVisiblePhases,
  formatPhaseWindow,
  createTeamQueryValue,
} from '@/components/public/AgeGroupComponents'

type GroupPhaseView = 'matches' | 'standings' | 'team'
type KnockoutPhaseView = 'matches' | 'ranking'
type MatchStatusView = 'pending' | 'completed'

export default function AgeGroupPage() {
  const { slug, ageGroupId } = useParams<{ slug: string; ageGroupId: string }>()
  const navigate = useNavigate()
  const { data: tournament } = useTournament(slug!)
  const { data: facilities } = usePublicTournamentFields(slug!)
  const { data: program, isLoading, error, refetch, dataUpdatedAt } = useAgeGroupProgram(ageGroupId!)
  const { data: standings } = useAgeGroupStandings(ageGroupId!)
  const phases = useMemo(() => flattenPhases(program), [program])
  const visiblePhases = useMemo(
    () => filterVisiblePhases(phases, program?.hide_future_phases_until_complete ?? false),
    [phases, program?.hide_future_phases_until_complete],
  )
  const teamNameMap = useMemo(() => {
    const pairs = phases.flatMap((phase) =>
      phase.groups.flatMap((group) =>
        group.teams.flatMap((team) => {
          const items: Array<readonly [string, string]> = []
          if (team.team_id) items.push([team.team_id, team.label] as const)
          if (team.tournament_team_id) items.push([team.tournament_team_id, team.label] as const)
          return items
        }),
      ),
    )
    return new Map(pairs)
  }, [phases])
  const teamLogoMap = useMemo(() => {
    const pairs = phases.flatMap((phase) =>
      phase.groups.flatMap((group) =>
        group.teams.flatMap((team) => {
          const items: Array<readonly [string, string]> = []
          if (team.team_logo_url) {
            if (team.team_id) items.push([team.team_id, team.team_logo_url] as const)
            if (team.tournament_team_id) items.push([team.tournament_team_id, team.team_logo_url] as const)
          }
          return items
        }),
      ),
    )
    return new Map(pairs)
  }, [phases])
  const [searchParams, setSearchParams] = useSearchParams()
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)
  const groupPhaseView = (searchParams.get('tab') as GroupPhaseView | null) ?? 'matches'
  function setGroupPhaseView(tab: GroupPhaseView) {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('tab', tab); return next }, { replace: true })
  }
  const teamQuery = searchParams.get('team') ?? ''
  const [activeMatchesGroupId, setActiveMatchesGroupId] = useState<string | null>(null)
  const [activeStandingsGroupId, setActiveStandingsGroupId] = useState<string | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string>('')
  const [rememberedTeamId, setRememberedTeamId] = useState<string>('')
  const [teamSearch, setTeamSearch] = useState('')
  const knockoutPhaseView = (searchParams.get('ktab') as KnockoutPhaseView | null) ?? 'matches'
  function setKnockoutPhaseView(tab: KnockoutPhaseView) {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('ktab', tab); return next }, { replace: true })
  }
  const [groupStatusView, setGroupStatusView] = useState<MatchStatusView>('pending')
  const [knockoutStatusView, setKnockoutStatusView] = useState<MatchStatusView>('pending')

  const activePhase = visiblePhases.find((phase) => phase.id === (activePhaseId ?? visiblePhases[0]?.id)) ?? visiblePhases[0] ?? null
  const activeMatchesGroup = activePhase?.groups.find((group) => group.id === (activeMatchesGroupId ?? activePhase.groups[0]?.id)) ?? activePhase?.groups[0] ?? null
  const activeStandingsGroup = activePhase?.groups.find((group) => group.id === (activeStandingsGroupId ?? activePhase.groups[0]?.id)) ?? activePhase?.groups[0] ?? null
  const activeStandingsMeta = activePhase ? standings?.[activePhase.id] : undefined
  const activeStandingsRows = activePhase && activeStandingsGroup
    ? activeStandingsMeta?.groups?.[activeStandingsGroup.id] ?? []
    : []
  const activeGroupCompleted = Boolean(
    activeStandingsGroup
    && activeStandingsGroup.matches.length > 0
    && activeStandingsGroup.matches.every((match) => match.status === 'COMPLETED'),
  )
  const finalGroupPodium = activeStandingsMeta?.is_final_phase
    ? activeStandingsRows.slice(0, 3).map((row, index) => ({
        position: index + 1,
        team_id: row.team_id,
        team_name: row.team_name,
      }))
    : []
  const finalRankingRows = useMemo(() => {
    if (!activePhase || activePhase.phase_type === 'GROUP_STAGE') return []
    const ranked = standings?.[activePhase.id]?.final_ranking ?? []
    const rankedIds = new Set(ranked.map((row) => row.team_id).filter(Boolean))
    const missing = Array.from(teamNameMap.entries())
      .filter(([teamId]) => !rankedIds.has(teamId))
      .map(([teamId, teamName]) => ({
        position: null,
        team_id: teamId,
        team_name: teamName,
      }))
    return [...ranked, ...missing]
  }, [activePhase, standings, teamNameMap])
  const publicFinalRanking = useMemo(() => {
    const rankingPhase = [...visiblePhases].reverse().find((phase) => (standings?.[phase.id]?.final_ranking?.length ?? 0) > 0)
    if (rankingPhase) {
      return {
        phaseName: rankingPhase.name,
        isProvisional: false,
        rows: standings?.[rankingPhase.id]?.final_ranking ?? [],
      }
    }

    const finalGroupPhase = [...visiblePhases].reverse().find((phase) => (
      phase.phase_type === 'GROUP_STAGE'
      && standings?.[phase.id]?.is_final_phase
      && phase.groups.some((group) => group.matches.some((match) => match.status === 'COMPLETED'))
    ))
    if (!finalGroupPhase) return null

    const rows = finalGroupPhase.groups.flatMap((group) => standings?.[finalGroupPhase.id]?.groups?.[group.id] ?? [])
    if (rows.length === 0) return null
    const allComplete = finalGroupPhase.groups.every((group) =>
      group.matches.length > 0 && group.matches.every((match) => match.status === 'COMPLETED'),
    )
    return {
      phaseName: finalGroupPhase.name,
      isProvisional: !allComplete,
      rows: rows.map((row, index) => ({
        position: index + 1,
        team_id: row.team_id,
        team_name: row.team_name,
      })),
    }
  }, [visiblePhases, standings])
  const knockoutMatches = useMemo(() => {
    if (!activePhase || activePhase.phase_type === 'GROUP_STAGE') return []
    return [...activePhase.knockout_matches.filter((match) => (
      knockoutStatusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'
    ))].sort((left, right) => {
      const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
      const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
      if (leftTime !== rightTime) return leftTime - rightTime
      return (left.bracket_position ?? 0) - (right.bracket_position ?? 0)
    })
  }, [activePhase, knockoutStatusView])
  const phaseTeamOptions = useMemo(() => {
    if (!activePhase || activePhase.phase_type !== 'GROUP_STAGE') return []
    const seen = new Set<string>()
    return activePhase.groups.flatMap((group) =>
      group.teams
        .filter((team) => !team.is_placeholder && team.tournament_team_id)
        .filter((team) => {
          if (!team.tournament_team_id || seen.has(team.tournament_team_id)) return false
          seen.add(team.tournament_team_id)
          return true
        })
        .map((team) => ({
          value: team.tournament_team_id!,
          label: team.label,
          logo: team.team_logo_url,
          queryValue: createTeamQueryValue(team.label),
        })),
    )
  }, [activePhase])
  const visibleTeamOptions = useMemo(() => {
    const query = teamSearch.trim().toLowerCase()
    if (!query) return phaseTeamOptions
    return phaseTeamOptions.filter((team) => team.label.toLowerCase().includes(query))
  }, [phaseTeamOptions, teamSearch])
  const teamViewMatches = useMemo(() => {
    if (!activePhase || activePhase.phase_type !== 'GROUP_STAGE' || !activeTeamId) return []
    return activePhase.groups.flatMap((group) =>
      group.matches
        .filter((match) => match.home_team_id === activeTeamId || match.away_team_id === activeTeamId)
        .filter((match) => (groupStatusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'))
        .map((match) => ({ ...match, __groupName: group.name })),
    )
  }, [activePhase, activeTeamId, groupStatusView])
  const selectedTeamSummary = useMemo(() => {
    if (!activePhase || activePhase.phase_type !== 'GROUP_STAGE' || !activeTeamId) return null

    const teamOption = phaseTeamOptions.find((team) => team.value === activeTeamId) ?? null
    const relatedGroup = activePhase.groups.find((group) =>
      group.teams.some((team) => team.tournament_team_id === activeTeamId),
    ) ?? null
    const standingsRows = relatedGroup ? (standings?.[activePhase.id]?.groups?.[relatedGroup.id] ?? []) : []
    const position = standingsRows.findIndex((row) => row.team_id === activeTeamId) + 1
    const allMatches = activePhase.groups.flatMap((group) =>
      group.matches
        .filter((match) => match.home_team_id === activeTeamId || match.away_team_id === activeTeamId)
        .map((match) => ({ ...match, __groupName: group.name })),
    )
    const nextMatch = allMatches
      .filter((match) => match.status !== 'COMPLETED')
      .sort((left, right) => {
        const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
        return leftTime - rightTime
      })[0] ?? null
    const lastMatch = allMatches
      .filter((match) => match.status === 'COMPLETED')
      .sort((left, right) => {
        const leftTime = left.scheduled_at ? new Date(left.scheduled_at).getTime() : 0
        const rightTime = right.scheduled_at ? new Date(right.scheduled_at).getTime() : 0
        return rightTime - leftTime
      })[0] ?? null

    return {
      team: teamOption,
      group: relatedGroup,
      position: position > 0 ? position : null,
      nextMatch,
      lastMatch,
    }
  }, [activePhase, activeTeamId, phaseTeamOptions, standings])
  const activeTeamOption = useMemo(
    () => phaseTeamOptions.find((team) => team.value === activeTeamId) ?? null,
    [activeTeamId, phaseTeamOptions],
  )
  const useTeamTabs = phaseTeamOptions.length <= 8
  const isFamilyFriendlyAgeGroup = program?.age_group === 'U8'
  const hasSingleGroup = (activePhase?.groups.length ?? 0) <= 1
  const isLive = useMemo(() => phases.some((phase) =>
    [...phase.groups.flatMap((g) => g.matches), ...phase.knockout_matches].some((m) => m.status === 'IN_PROGRESS')
  ), [phases])
  const activePhaseWindowLabel = activePhase ? formatPhaseWindow(activePhase) : null
  const favoriteTeamStorageKey = slug && ageGroupId ? `rugby.favoriteTeam.${slug}.${ageGroupId}` : ''
  const filteredMatches = activeMatchesGroup
    ? activeMatchesGroup.matches.filter((match) => {
        const matchesStatus = groupStatusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'
        return matchesStatus
      })
    : []
  const activePhaseFieldSummary = useMemo(() => {
    if (!activePhase) return []
    const matches = activePhase.phase_type === 'GROUP_STAGE'
      ? activePhase.groups.flatMap((group) => group.matches)
      : activePhase.knockout_matches
    const facilityMap = new Map((facilities ?? []).map((facility) => [facility.name, facility]))
    return Array.from(
      new Map(
        matches
          .filter((match) => match.field_name)
          .map((match) => {
            const facility = facilityMap.get(match.field_name ?? '')
            return [match.field_name as string, {
              name: match.field_name as string,
              maps_url: facility?.maps_url ?? null,
            }] as const
          }),
      ).values(),
    )
  }, [activePhase, facilities])

  useEffect(() => {
    setActiveMatchesGroupId(activePhase?.groups[0]?.id ?? null)
    setActiveStandingsGroupId(activePhase?.groups[0]?.id ?? null)
    setActiveTeamId('')
    setGroupStatusView('pending')
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('ktab'); return next }, { replace: true })
    setKnockoutStatusView('pending')
  }, [activePhase?.id])

  useEffect(() => {
    if (!teamQuery || phaseTeamOptions.length === 0 || activeTeamId) return
    const teamFromQuery = phaseTeamOptions.find((team) => team.queryValue === teamQuery)
    if (!teamFromQuery) return
    setActiveTeamId(teamFromQuery.value)
    if (!searchParams.get('tab')) {
      setGroupPhaseView('team')
    }
  }, [activeTeamId, phaseTeamOptions, searchParams, teamQuery])

  useEffect(() => {
    const teamIsValid = rememberedTeamId && phaseTeamOptions.some((team) => team.value === rememberedTeamId)
    if (!activeTeamId && phaseTeamOptions.length > 0 && teamIsValid) {
      setActiveTeamId(rememberedTeamId)
      // Auto-switch to "my team" tab only if the user hasn't explicitly chosen a tab
      if (!searchParams.get('tab')) {
        setGroupPhaseView('team')
      }
      return
    }
    if (!activeTeamId && phaseTeamOptions.length > 0 && isFamilyFriendlyAgeGroup && !searchParams.get('tab')) {
      setActiveTeamId(phaseTeamOptions[0].value)
      setGroupPhaseView('team')
      return
    }
    if (!activeTeamId && phaseTeamOptions.length > 0 && useTeamTabs) {
      setActiveTeamId(phaseTeamOptions[0].value)
    }
  }, [activeTeamId, isFamilyFriendlyAgeGroup, phaseTeamOptions, rememberedTeamId, searchParams, useTeamTabs])

  useEffect(() => {
    if (!favoriteTeamStorageKey || typeof window === 'undefined') return
    const stored = window.localStorage.getItem(favoriteTeamStorageKey) ?? ''
    setRememberedTeamId(stored)
  }, [favoriteTeamStorageKey])

  useEffect(() => {
    if (phaseTeamOptions.length === 0) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (!activeTeamOption) {
        next.delete('team')
        return next
      }
      if (next.get('team') === activeTeamOption.queryValue) return prev
      next.set('team', activeTeamOption.queryValue)
      return next
    }, { replace: true })
  }, [activeTeamOption, phaseTeamOptions.length, setSearchParams])

  useEffect(() => {
    if (slug && tournament?.slug && tournament.slug !== slug && ageGroupId) {
      navigate(`/tornei/${tournament.slug}/${ageGroupId}`, { replace: true })
    }
  }, [ageGroupId, navigate, slug, tournament?.slug])

  if (isLoading) return <LoadingSpinner className="py-16" />
  if (error || !program) {
    return <ErrorMessage message="Impossibile caricare la categoria" retry={() => refetch()} />
  }

  const theme = getAgeGroupThemeStyle(tournament?.theme_primary_color ?? null, tournament?.theme_accent_color ?? null)
  const categoryBackdrop = tournament?.venue_map_url ?? tournament?.logo_url ?? null

  return (
    <div className="page-shell" style={theme.pageStyle}>
    <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
      <div className="mb-4">
        <Link
          to={`/tornei/${slug}`}
          className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
          style={{ borderColor: theme.softBorder, backgroundColor: theme.softFill, color: theme.primary }}
        >
          <ChevronLeft className="h-4 w-4" />
          Torna al torneo
        </Link>
      </div>

      <section
        className="relative overflow-hidden rounded-[1.8rem] border p-5 shadow-sm"
        style={{ borderColor: theme.softBorder, background: theme.panelSurface }}
      >
        {categoryBackdrop && (
          <>
            <div
              className="pointer-events-none absolute inset-y-0 right-0 hidden w-44 bg-cover bg-center opacity-[0.16] sm:block"
              style={{ backgroundImage: `url(${categoryBackdrop})` }}
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: `linear-gradient(90deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.92) 55%, rgba(255,255,255,0.72) 100%)` }}
            />
          </>
        )}
        <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: theme.primaryMuted }}>Categoria</p>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                Live
              </span>
            )}
            <button
              onClick={() => refetch()}
              className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
              title="Aggiorna dati"
            >
              Aggiornato alle {format(new Date(dataUpdatedAt), 'HH:mm', { locale: it })}
            </button>
          </div>
        </div>
        <h1 className="mt-2 text-2xl font-black text-slate-950">{program.display_name || program.age_group}</h1>
        <p className="mt-2 text-sm text-slate-700">
          Consulta le partite della fase, le classifiche dei gironi e l’eventuale fase a eliminazione.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {program.field_map_url ? (
            <a
              href={program.field_map_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:text-slate-950"
            >
              <ExternalLink className="h-4 w-4" />
              Mappa campi categoria
            </a>
          ) : null}
        </div>
        {activePhase?.phase_type === 'GROUP_STAGE' && phaseTeamOptions.length > 0 && (
          <div className="mt-4 rounded-[1.2rem] border bg-white/85 px-4 py-4 shadow-sm" style={{ borderColor: theme.softBorder }}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.accent }}>Trova subito la tua squadra</p>
                <p className="mt-1 text-sm text-slate-600">
                  {isFamilyFriendlyAgeGroup
                    ? 'Flusso rapido pensato per Under 8: scegli la squadra e apri subito solo le sue partite.'
                    : 'Seleziona una squadra per aprire rapidamente la vista dedicata.'}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="min-w-[240px]">
                  <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Squadra
                  </label>
                  <select
                    value={activeTeamId}
                    onChange={(e) => setActiveTeamId(e.target.value)}
                    className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900"
                    style={{ borderColor: theme.softBorder }}
                  >
                    <option value="">Seleziona squadra</option>
                    {phaseTeamOptions.map((team) => (
                      <option key={team.value} value={team.value}>{team.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setGroupPhaseView('team')}
                  disabled={!activeTeamId}
                  className="rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ backgroundColor: theme.primary }}
                >
                  Vai alla mia squadra
                </button>
              </div>
            </div>
          </div>
        )}
        {(activePhaseFieldSummary.length > 0 || program.field_map_url) && (
          <div className="mt-4 rounded-[1.2rem] border bg-white/80 px-4 py-3" style={{ borderColor: theme.softBorder }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Impianti della categoria</p>
              {program.field_map_url ? (
                <a
                  href={program.field_map_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Apri mappa dedicata
                </a>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {activePhaseFieldSummary.map((facility) => (
                facility.maps_url ? (
                  <a
                    key={facility.name}
                    href={facility.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:text-slate-950"
                  >
                    Apri impianto
                  </a>
                ) : (
                  <span key={facility.name} className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                    {facility.name}
                  </span>
                )
              ))}
            </div>
          </div>
        )}
        </div>
      </section>

      <div className="mt-4">
        <SponsorBar
          images={tournament?.sponsor_images ?? []}
          accentColor={tournament?.theme_accent_color ?? null}
          primaryColor={tournament?.theme_primary_color ?? null}
        />
      </div>

      {visiblePhases.length > 1 && (
        <section className="mt-4 rounded-[1.8rem] border p-4 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.panelSurface }}>
          <div className="flex flex-wrap gap-2">
            {visiblePhases.map((phase) => (
              <button
                key={phase.id}
                type="button"
                onClick={() => setActivePhaseId(phase.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  activePhase?.id === phase.id
                    ? 'text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
                style={activePhase?.id === phase.id ? { backgroundColor: theme.primary } : { borderColor: theme.softBorder }}
              >
                <span>{phase.name}</span>
                {formatPhaseWindow(phase) ? (
                  <span className="ml-2 text-xs font-medium opacity-80">{formatPhaseWindow(phase)}</span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      )}

      {activePhase?.phase_type === 'GROUP_STAGE' ? (
        <>
          <section className="mt-4 rounded-[1.8rem] border p-4 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.tabSurface }}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setGroupPhaseView('matches')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  groupPhaseView === 'matches'
                    ? 'text-white'
                    : 'border bg-white text-slate-700'
                }`}
                style={groupPhaseView === 'matches' ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
              >
                Partite
              </button>
              <button
                type="button"
                onClick={() => setGroupPhaseView('standings')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  groupPhaseView === 'standings'
                    ? 'text-white'
                    : 'border bg-white text-slate-700'
                }`}
                style={groupPhaseView === 'standings' ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
              >
                Classifica
              </button>
              <button
                type="button"
                onClick={() => setGroupPhaseView('team')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  groupPhaseView === 'team'
                    ? 'text-white'
                    : 'border bg-white text-slate-700'
                }`}
                style={groupPhaseView === 'team' ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
              >
                La mia squadra
              </button>
            </div>
          </section>

          {groupPhaseView === 'matches' ? (
            <div className="mt-4 space-y-4">
              <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
                <div className="mb-4">
                  <h2 className="text-xl font-black text-slate-950">{activePhase.name}</h2>
                  {activePhaseWindowLabel ? (
                    <p className="mt-1 text-sm text-slate-500">{activePhaseWindowLabel}</p>
                  ) : null}
                </div>

                {!hasSingleGroup && (
                  <div className="flex flex-wrap gap-2">
                    {activePhase.groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveMatchesGroupId(group.id)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                          activeMatchesGroup?.id === group.id
                            ? 'text-white'
                            : 'border bg-white text-slate-700'
                        }`}
                        style={activeMatchesGroup?.id === group.id ? { backgroundColor: theme.primary } : { borderColor: theme.softBorder }}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                )}

                {activeMatchesGroup && (
                  <>
                    <div className="mt-5">
                      {!hasSingleGroup && <p className="text-sm font-black text-slate-950">{activeMatchesGroup.name}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setGroupStatusView('pending')}
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            groupStatusView === 'pending'
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          Da giocare
                        </button>
                        <button
                          type="button"
                          onClick={() => setGroupStatusView('completed')}
                          className={`rounded-full px-4 py-2 text-sm font-semibold ${
                            groupStatusView === 'completed'
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-700'
                          }`}
                        >
                          Giocate
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {filteredMatches.length > 0 ? filteredMatches.map((match) => (
                        <PublicMatchRow key={match.id} match={match} teamLogoMap={teamLogoMap} backTo={`/tornei/${slug}/${ageGroupId}`} backLabel={`← ${program.display_name || program.age_group}`} />
                      )) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          Nessuna partita trovata con questo filtro.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </div>
          ) : groupPhaseView === 'standings' ? (
            <div className="mt-4 space-y-4">
              <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.primaryMuted }}>Classifica</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{activePhase.name}</h2>
                  {activePhaseWindowLabel ? (
                    <p className="mt-1 text-sm text-slate-500">{activePhaseWindowLabel}</p>
                  ) : null}
                </div>

                {!hasSingleGroup && (
                  <div className="flex flex-wrap gap-2">
                    {activePhase.groups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setActiveStandingsGroupId(group.id)}
                        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                          activeStandingsGroup?.id === group.id
                            ? 'text-white'
                            : 'border bg-white text-slate-700'
                        }`}
                        style={activeStandingsGroup?.id === group.id ? { backgroundColor: theme.primary } : { borderColor: theme.softBorder }}
                      >
                        {group.name}
                      </button>
                    ))}
                  </div>
                )}

                {activeStandingsGroup && (
                  <div className="mt-5">
                    {!hasSingleGroup && <p className="mb-4 text-sm font-black text-slate-950">{activeStandingsGroup.name}</p>}
                    {activeStandingsMeta?.is_final_phase && activeGroupCompleted && finalGroupPodium.length > 0 && (
                      <div className="mb-5">
                        <PodiumGrid rows={finalGroupPodium} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} highlightedTeamId={activeTeamId} />
                      </div>
                    )}
                    <StandingsTable
                      rows={activeStandingsRows}
                      teamNameMap={teamNameMap}
                      teamLogoMap={teamLogoMap}
                      isFinalPhase={Boolean(activeStandingsMeta?.is_final_phase)}
                      highlightedTeamId={activeTeamId}
                    />
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
                <div className="mb-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>La mia squadra</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">Partite della squadra</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Vista rapida per genitori e accompagnatori. Mostra solo le partite della squadra selezionata.
                  </p>
                  {activePhaseWindowLabel ? (
                    <p className="mt-2 text-sm text-slate-500">{activePhaseWindowLabel}</p>
                  ) : null}
                </div>

                {phaseTeamOptions.length > 0 ? (
                  <>
                    {phaseTeamOptions.length > 8 && (
                      <div className="mb-4 max-w-md">
                        <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Cerca squadra
                        </label>
                        <input
                          value={teamSearch}
                          onChange={(e) => setTeamSearch(e.target.value)}
                          placeholder="Scrivi il nome della squadra"
                          className="mt-2 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900"
                          style={{ borderColor: theme.softBorder }}
                        />
                      </div>
                    )}
                    {useTeamTabs ? (
                      <div className="flex flex-wrap gap-2">
                        {visibleTeamOptions.map((team) => (
                          <button
                            key={team.value}
                            type="button"
                            onClick={() => setActiveTeamId(team.value)}
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                              activeTeamId === team.value
                                ? 'text-white'
                                : 'border bg-white text-slate-700'
                            }`}
                            style={activeTeamId === team.value ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
                          >
                            <TeamLogo src={team.logo} alt={team.label} />
                            <span>{team.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="max-w-md">
                        <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                          Scegli la squadra
                        </label>
                        <select
                          value={activeTeamId}
                          onChange={(e) => setActiveTeamId(e.target.value)}
                          className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                          style={{ borderColor: theme.softBorder }}
                        >
                          <option value="">Seleziona squadra</option>
                          {visibleTeamOptions.map((team) => (
                            <option key={team.value} value={team.value}>{team.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {activeTeamId && (
                        rememberedTeamId === activeTeamId ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (favoriteTeamStorageKey && typeof window !== 'undefined') {
                                window.localStorage.removeItem(favoriteTeamStorageKey)
                              }
                              setRememberedTeamId('')
                            }}
                            className="rounded-full border bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                            style={{ borderColor: theme.softBorder }}
                          >
                            Dimentica squadra
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (favoriteTeamStorageKey && typeof window !== 'undefined') {
                                window.localStorage.setItem(favoriteTeamStorageKey, activeTeamId)
                              }
                              setRememberedTeamId(activeTeamId)
                            }}
                            className="rounded-full px-4 py-2 text-sm font-semibold text-white"
                            style={{ backgroundColor: theme.primary }}
                          >
                            Ricorda questa squadra
                          </button>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => setGroupStatusView('pending')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                          groupStatusView === 'pending'
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        Da giocare
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroupStatusView('completed')}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${
                          groupStatusView === 'completed'
                            ? 'bg-slate-900 text-white'
                            : 'border border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        Giocate
                      </button>
                    </div>

                    {selectedTeamSummary && (
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: theme.softBorder, backgroundColor: `${theme.accent}10` }}>
                          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.accent }}>Posizione attuale</p>
                          <div className="mt-2 flex items-center gap-2">
                            <TeamLogo src={selectedTeamSummary.team?.logo} alt={selectedTeamSummary.team?.label || 'Squadra'} />
                            <p className="text-lg font-black text-slate-950">
                              {selectedTeamSummary.position ? `${selectedTeamSummary.position}° posto` : 'Da definire'}
                            </p>
                          </div>
                          {!hasSingleGroup && selectedTeamSummary.group && (
                            <p className="mt-2 text-sm text-slate-600">{selectedTeamSummary.group.name}</p>
                          )}
                        </div>

                        <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: theme.softBorder, backgroundColor: `${theme.primary}0f` }}>
                          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.primary }}>Prossima partita</p>
                          {selectedTeamSummary.nextMatch ? (
                            <>
                              <p className="mt-2 text-sm font-bold text-slate-950">
                                {selectedTeamSummary.nextMatch.home_label} - {selectedTeamSummary.nextMatch.away_label}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {selectedTeamSummary.nextMatch.scheduled_at
                                  ? format(new Date(selectedTeamSummary.nextMatch.scheduled_at), 'HH:mm', { locale: it })
                                  : 'Orario da definire'}
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">Nessuna partita in programma.</p>
                          )}
                        </div>

                        <div className="rounded-[1.2rem] border px-4 py-4" style={{ borderColor: theme.softBorder, backgroundColor: `${theme.accent}14` }}>
                          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: theme.primary }}>Ultimo risultato</p>
                          {selectedTeamSummary.lastMatch ? (
                            <>
                              <p className="mt-2 text-sm font-bold text-slate-950">
                                {selectedTeamSummary.lastMatch.home_label} {selectedTeamSummary.lastMatch.home_score ?? '-'} - {selectedTeamSummary.lastMatch.away_score ?? '-'} {selectedTeamSummary.lastMatch.away_label}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {selectedTeamSummary.lastMatch.scheduled_at
                                  ? format(new Date(selectedTeamSummary.lastMatch.scheduled_at), 'HH:mm', { locale: it })
                                  : 'Orario non disponibile'}
                              </p>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-slate-600">Nessun risultato ancora registrato.</p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 space-y-3">
                      {activeTeamId ? (
                        teamViewMatches.length > 0 ? (
                          teamViewMatches.map((match) => (
                            <PublicMatchRow
                              key={match.id}
                              match={match}
                              teamLogoMap={teamLogoMap}
                              highlightedTeamId={activeTeamId}
                              backTo={`/tornei/${slug}/${ageGroupId}`}
                              backLabel={`← ${program.display_name || program.age_group}`}
                            />
                          ))
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                            Nessuna partita trovata per questa squadra.
                          </div>
                        )
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          Seleziona una squadra per vedere solo le sue partite.
                        </div>
                      )}
                    </div>
                    {!useTeamTabs && visibleTeamOptions.length === 0 && (
                      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        Nessuna squadra corrisponde alla ricerca.
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    Squadre non ancora disponibili.
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      ) : activePhase ? (
        <div className="mt-4 space-y-4">
          <section className="rounded-[1.8rem] border p-4 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.tabSurface }}>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKnockoutPhaseView('matches')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  knockoutPhaseView === 'matches'
                    ? 'text-white'
                    : 'border bg-white text-slate-700'
                }`}
                style={knockoutPhaseView === 'matches' ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
              >
                Partite
              </button>
              <button
                type="button"
                onClick={() => setKnockoutPhaseView('ranking')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  knockoutPhaseView === 'ranking'
                      ? 'text-white'
                      : 'border bg-white text-slate-700'
                }`}
                style={knockoutPhaseView === 'ranking' ? { backgroundColor: theme.accent } : { borderColor: theme.softBorder }}
              >
                Classifica
              </button>
              
            </div>
          </section>

          {knockoutPhaseView === 'matches' ? (
          <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                {activePhase.is_final_phase ? 'Eliminazione diretta' : 'Fase a eliminazione'}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{activePhase.name}</h2>
              {activePhaseWindowLabel ? (
                <p className="mt-1 text-sm text-slate-500">{activePhaseWindowLabel}</p>
              ) : null}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setKnockoutStatusView('pending')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  knockoutStatusView === 'pending'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Da giocare
              </button>
              <button
                type="button"
                onClick={() => setKnockoutStatusView('completed')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  knockoutStatusView === 'completed'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Giocate
              </button>
            </div>
            <div className="mt-4 space-y-3">
                {knockoutMatches.length > 0 ? (
                <div className="space-y-3">
                  {knockoutMatches.map((match) => (
                    <PublicMatchRow key={match.id} match={match} teamLogoMap={teamLogoMap} backTo={`/tornei/${slug}/${ageGroupId}`} backLabel={`← ${program.display_name || program.age_group}`} />
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  Nessuna partita in questa sezione.
                </div>
              )}
            </div>
          </section>
          ) : null}

          {knockoutPhaseView === 'ranking' && (
            <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.primaryMuted }}>Classifica</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{activePhase.name}</h2>
                {activePhaseWindowLabel ? (
                  <p className="mt-1 text-sm text-slate-500">{activePhaseWindowLabel}</p>
                ) : null}
              </div>
              {finalRankingRows.length > 0 ? (
                <>
                  <div className="mb-4">
                    <PodiumGrid rows={finalRankingRows.filter((row) => typeof row.position === 'number').slice(0, 3)} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} highlightedTeamId={activeTeamId} />
                  </div>

                  <div className="overflow-hidden rounded-[1.3rem] border border-emerald-100 bg-white">
                    <table className="min-w-full divide-y divide-emerald-100 text-sm">
                      <thead className="bg-emerald-50 text-left text-emerald-900">
                        <tr>
                          <th className="px-4 py-3 font-bold">Pos.</th>
                          <th className="px-4 py-3 font-bold">Squadra</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {finalRankingRows.map((row) => (
                          <tr
                            key={`${activePhase.id}-${row.position ?? 'na'}-${row.team_id ?? row.team_name}`}
                            className={row.team_id && row.team_id === activeTeamId ? 'bg-amber-50' : ''}
                          >
                            <td className="px-4 py-3 font-black text-slate-900">{row.position ?? '-'}</td>
                            <td className="px-4 py-3 font-semibold text-slate-900">
                              <div className="flex items-center gap-2">
                                <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                                <span>{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</span>
                                {row.team_id && row.team_id === activeTeamId ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-amber-800">La tua</span>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Classifica non ancora disponibile.
                </div>
              )}
            </section>
          )}
        </div>
      ) : null}

      {publicFinalRanking && (
        <section className="mt-4 rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.primaryMuted }}>Classifica finale</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{publicFinalRanking.phaseName}</h2>
            </div>
            {publicFinalRanking.isProvisional && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-widest2 text-amber-700">Provvisoria</span>
            )}
          </div>
          <div className="mb-4">
            <PodiumGrid rows={publicFinalRanking.rows.filter((row) => typeof row.position === 'number').slice(0, 3)} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} highlightedTeamId={activeTeamId} />
          </div>
          <div className="overflow-hidden rounded-[1.3rem] border border-emerald-100 bg-white">
            <table className="min-w-full divide-y divide-emerald-100 text-sm">
              <thead className="bg-emerald-50 text-left text-emerald-900">
                <tr>
                  <th className="px-4 py-3 font-bold">Pos.</th>
                  <th className="px-4 py-3 font-bold">Squadra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {publicFinalRanking.rows.map((row) => (
                  <tr
                    key={`public-final-${row.position ?? 'na'}-${row.team_id ?? row.team_name}`}
                    className={row.team_id && row.team_id === activeTeamId ? 'bg-amber-50' : ''}
                  >
                    <td className="px-4 py-3 font-black text-slate-900">{row.position ?? '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                        <span>{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</span>
                        {row.team_id && row.team_id === activeTeamId ? (
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="La tua squadra" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
    </div>
  )
}

function getAgeGroupThemeStyle(primaryColor: string | null, accentColor: string | null) {
  const primary = primaryColor || '#166534'
  const accent = accentColor || '#d97706'
  return {
    primary,
    accent,
    primaryMuted: `${primary}cc`,
    softBorder: `${primary}22`,
    softFill: `${accent}16`,
    panelSurface: `linear-gradient(135deg, ${primary}10 0%, #ffffff 60%, ${accent}12 100%)`,
    tabSurface: `linear-gradient(135deg, ${accent}10 0%, #ffffff 55%, ${primary}0d 100%)`,
    contentSurface: `linear-gradient(180deg, ${primary}08 0%, #ffffff 28%, ${accent}10 100%)`,
    pageStyle: {
      background: `radial-gradient(circle at top, ${primary}14 0%, #f8fafc 38%, #edf2f7 100%)`,
    },
  }
}


import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Award, ChevronLeft, Medal, Trophy } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import {
  useAgeGroupProgram,
  useAgeGroupStandings,
  useTournament,
  type ProgramMatch,
  type ProgramPhase,
  type StandingRow,
} from '@/api/tournaments'
import { usePublicTournamentFields } from '@/api/fields'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import ErrorMessage from '@/components/shared/ErrorMessage'
import SponsorBar from '@/components/public/SponsorBar'

type GroupPhaseView = 'matches' | 'standings' | 'team'
type KnockoutPhaseView = 'matches' | 'ranking'
type MatchStatusView = 'pending' | 'completed'

export default function AgeGroupPage() {
  const { slug, ageGroupId } = useParams<{ slug: string; ageGroupId: string }>()
  const navigate = useNavigate()
  const { data: tournament } = useTournament(slug!)
  const { data: facilities } = usePublicTournamentFields(slug!)
  const { data: program, isLoading, error, refetch } = useAgeGroupProgram(ageGroupId!)
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
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null)
  const [groupPhaseView, setGroupPhaseView] = useState<GroupPhaseView>('matches')
  const [activeMatchesGroupId, setActiveMatchesGroupId] = useState<string | null>(null)
  const [activeStandingsGroupId, setActiveStandingsGroupId] = useState<string | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string>('')
  const [rememberedTeamId, setRememberedTeamId] = useState<string>('')
  const [knockoutPhaseView, setKnockoutPhaseView] = useState<KnockoutPhaseView>('matches')
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
        rows: standings?.[rankingPhase.id]?.final_ranking ?? [],
      }
    }

    const finalGroupPhase = [...visiblePhases].reverse().find((phase) => (
      phase.phase_type === 'GROUP_STAGE'
      && standings?.[phase.id]?.is_final_phase
      && phase.groups.some((group) => group.matches.length > 0 && group.matches.every((match) => match.status === 'COMPLETED'))
    ))
    if (!finalGroupPhase) return null

    const rows = finalGroupPhase.groups.flatMap((group) => standings?.[finalGroupPhase.id]?.groups?.[group.id] ?? [])
    if (rows.length === 0) return null
    return {
      phaseName: finalGroupPhase.name,
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
        })),
    )
  }, [activePhase])
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
  const useTeamTabs = phaseTeamOptions.length <= 8
  const hasSingleGroup = (activePhase?.groups.length ?? 0) <= 1
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
    setKnockoutPhaseView('matches')
    setKnockoutStatusView('pending')
  }, [activePhase?.id])

  useEffect(() => {
    if (!activeTeamId && phaseTeamOptions.length > 0 && rememberedTeamId && phaseTeamOptions.some((team) => team.value === rememberedTeamId)) {
      setActiveTeamId(rememberedTeamId)
      return
    }
    if (!activeTeamId && phaseTeamOptions.length > 0 && useTeamTabs) {
      setActiveTeamId(phaseTeamOptions[0].value)
    }
  }, [activeTeamId, phaseTeamOptions, rememberedTeamId, useTeamTabs])

  useEffect(() => {
    if (!favoriteTeamStorageKey || typeof window === 'undefined') return
    const stored = window.localStorage.getItem(favoriteTeamStorageKey) ?? ''
    setRememberedTeamId(stored)
  }, [favoriteTeamStorageKey])

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
        <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: theme.primaryMuted }}>Categoria</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">{program.display_name || program.age_group}</h1>
        <p className="mt-2 text-sm text-slate-700">
          Consulta le partite della fase, le classifiche dei gironi e l’eventuale fase a eliminazione.
        </p>
        {activePhaseFieldSummary.length > 0 && (
          <div className="mt-4 rounded-[1.2rem] border bg-white/80 px-4 py-3" style={{ borderColor: theme.softBorder }}>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Impianti della categoria</p>
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
                {phase.is_final_phase && (
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                    activePhase?.id === phase.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>
                    Conclusiva
                  </span>
                )}
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
                        <PublicMatchRow key={match.id} match={match} teamLogoMap={teamLogoMap} />
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
                        <PodiumGrid rows={finalGroupPodium} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} />
                      </div>
                    )}
                    <StandingsTable
                      rows={activeStandingsRows}
                      teamNameMap={teamNameMap}
                      teamLogoMap={teamLogoMap}
                      isFinalPhase={Boolean(activeStandingsMeta?.is_final_phase)}
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
                </div>

                {phaseTeamOptions.length > 0 ? (
                  <>
                    {useTeamTabs ? (
                      <div className="flex flex-wrap gap-2">
                        {phaseTeamOptions.map((team) => (
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
                          {phaseTeamOptions.map((team) => (
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
              {(standings?.[activePhase.id]?.final_ranking?.length ?? 0) > 0 && (
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
                  Classifica finale
                </button>
              )}
            </div>
          </section>

          {knockoutPhaseView === 'matches' ? (
          <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.accent }}>
                  {activePhase.is_final_phase ? 'Fase conclusiva' : 'Fase a eliminazione'}
                </p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{activePhase.name}</h2>
              </div>
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
                    <PublicMatchRow key={match.id} match={match} teamLogoMap={teamLogoMap} />
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

          {knockoutPhaseView === 'ranking' && finalRankingRows.length > 0 && (
            <section className="rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.primaryMuted }}>Classifica finale</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{activePhase.name}</h2>
              </div>
              <div className="mb-4">
                <PodiumGrid rows={finalRankingRows.filter((row) => typeof row.position === 'number').slice(0, 3)} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} />
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
                      <tr key={`${activePhase.id}-${row.position ?? 'na'}-${row.team_id ?? row.team_name}`}>
                        <td className="px-4 py-3 font-black text-slate-900">
                          <div className="flex items-center gap-2">
                            {row.position === 1 ? <Trophy className="h-4 w-4 text-amber-500" /> : row.position === 2 ? <Medal className="h-4 w-4 text-slate-500" /> : row.position === 3 ? <Award className="h-4 w-4 text-orange-500" /> : null}
                            <span>{row.position ?? '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                            <span>{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</span>
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
      ) : null}

      {publicFinalRanking && (
        <section className="mt-4 rounded-[1.8rem] border p-5 shadow-sm" style={{ borderColor: theme.softBorder, background: theme.contentSurface }}>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: theme.primaryMuted }}>Classifica finale</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{publicFinalRanking.phaseName}</h2>
          </div>
          <div className="mb-4">
            <PodiumGrid rows={publicFinalRanking.rows.filter((row) => typeof row.position === 'number').slice(0, 3)} teamNameMap={teamNameMap} teamLogoMap={teamLogoMap} />
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
                  <tr key={`public-final-${row.position ?? 'na'}-${row.team_id ?? row.team_name}`}>
                    <td className="px-4 py-3 font-black text-slate-900">{row.position ?? '-'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                        <span>{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</span>
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

function PublicMatchRow({
  match,
  teamLogoMap,
}: {
  match: ProgramMatch
  teamLogoMap: Map<string, string>
}) {
  const homeLogo = match.home_logo_url || teamLogoMap.get(match.home_team_id ?? '') || null
  const awayLogo = match.away_logo_url || teamLogoMap.get(match.away_team_id ?? '') || null
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-end gap-3">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
          match.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
        }`}>
          {match.status === 'COMPLETED' ? 'Finale' : 'Da giocare'}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
            <TeamLogo src={homeLogo} alt={match.home_label} />
            <span className="truncate">{match.home_label}</span>
          </span>
          <span className="text-lg font-black text-slate-950">{match.home_score ?? '-'}</span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-3">
          <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-900">
            <TeamLogo src={awayLogo} alt={match.away_label} />
            <span className="truncate">{match.away_label}</span>
          </span>
          <span className="text-lg font-black text-slate-950">{match.away_score ?? '-'}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-600 sm:grid-cols-3">
        <p><span className="font-semibold text-slate-900">Orario:</span> {match.scheduled_at ? format(new Date(match.scheduled_at), 'HH:mm', { locale: it }) : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Campo:</span> {match.field_name ? `${match.field_name}${match.field_number ? ` #${match.field_number}` : ''}` : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Arbitro:</span> {match.referee || 'Da definire'}</p>
      </div>
    </div>
  )
}

function StandingsTable({
  rows,
  teamNameMap,
  teamLogoMap,
  isFinalPhase = false,
}: {
  rows: StandingRow[]
  teamNameMap: Map<string, string>
  teamLogoMap: Map<string, string>
  isFinalPhase?: boolean
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        Classifica non ancora disponibile.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
            <th className="px-3 py-3">#</th>
            <th className="px-3 py-3">Squadra</th>
            <th className="px-3 py-3">Pt</th>
            <th className="px-3 py-3">G</th>
            <th className="px-3 py-3">V</th>
            <th className="px-3 py-3">N</th>
            <th className="px-3 py-3">P</th>
            <th className="px-3 py-3">Diff</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.team_id} className="border-b border-slate-100 last:border-b-0">
              <td className="px-3 py-3 font-black text-slate-950">{index + 1}</td>
              <td className="px-3 py-3 font-semibold text-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo src={teamLogoMap.get(row.team_id)} alt={row.team_name ?? teamNameMap.get(row.team_id) ?? 'Squadra'} />
                    <span className="truncate">{row.team_name ?? teamNameMap.get(row.team_id) ?? row.team_id}</span>
                  </div>
                  {isFinalPhase && (
                    <span className="shrink-0">
                      {index === 0 ? <Trophy className="h-4 w-4 text-amber-500" /> : index === 1 ? <Medal className="h-4 w-4 text-slate-500" /> : index === 2 ? <Award className="h-4 w-4 text-orange-500" /> : null}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-3 font-black text-slate-950">{row.points}</td>
              <td className="px-3 py-3 text-slate-700">{row.played}</td>
              <td className="px-3 py-3 text-slate-700">{row.wins}</td>
              <td className="px-3 py-3 text-slate-700">{row.draws}</td>
              <td className="px-3 py-3 text-slate-700">{row.losses}</td>
              <td className="px-3 py-3 text-slate-700">{row.goal_diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PodiumGrid({
  rows,
  teamNameMap,
  teamLogoMap,
}: {
  rows: Array<{ position?: number | null; team_id?: string | null; team_name?: string | null }>
  teamNameMap: Map<string, string>
  teamLogoMap: Map<string, string>
}) {
  const topRows = rows.filter((row) => typeof row.position === 'number').slice(0, 3)
  if (topRows.length === 0) return null

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {topRows.map((row, index) => (
        <div
          key={`podium-${row.position ?? index}-${row.team_id ?? row.team_name ?? 'na'}`}
          className={`rounded-[1.4rem] border p-4 shadow-sm ${
            index === 0
              ? 'border-amber-200 bg-amber-50'
              : index === 1
                ? 'border-slate-200 bg-slate-50'
                : 'border-orange-200 bg-orange-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
              index === 0
                ? 'bg-amber-100 text-amber-700'
                : index === 1
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-orange-100 text-orange-700'
            }`}>
              {index === 0 ? <Trophy className="h-5 w-5" /> : index === 1 ? <Medal className="h-5 w-5" /> : <Award className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{row.position}° posto</p>
              <div className="mt-1 flex items-center gap-2">
                <TeamLogo src={teamLogoMap.get(row.team_id ?? '')} alt={row.team_name || teamNameMap.get(row.team_id ?? '') || 'Squadra'} />
                <p className="truncate text-sm font-black text-slate-950">{row.team_name || teamNameMap.get(row.team_id ?? '') || 'Da definire'}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TeamLogo({ src, alt }: { src?: string | null; alt: string }) {
  if (!src) {
    return <span className="block h-7 w-7 shrink-0 rounded-full bg-slate-100" aria-hidden="true" />
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-7 w-7 shrink-0 rounded-full border border-slate-200 bg-white object-contain p-0.5"
    />
  )
}

function flattenPhases(program?: { days: Array<{ phases: ProgramPhase[] }> }) {
  if (!program) return []
  return [...program.days.flatMap((day) => day.phases)].sort(compareProgramPhases)
}

function filterVisiblePhases(phases: ProgramPhase[], hideFuture: boolean) {
  if (!hideFuture) return phases
  const visible: ProgramPhase[] = []
  for (const phase of phases) {
    if (visible.length === 0) {
      visible.push(phase)
      continue
    }
    if (!isPhaseComplete(visible[visible.length - 1])) break
    visible.push(phase)
  }
  return visible
}

function isPhaseComplete(phase: ProgramPhase) {
  const matches = [
    ...phase.groups.flatMap((group) => group.matches),
    ...phase.knockout_matches,
  ]
  return matches.length > 0 && matches.every((match) => match.status === 'COMPLETED')
}

function compareProgramPhases(left: ProgramPhase, right: ProgramPhase) {
  const leftTime = firstPhaseTimestamp(left)
  const rightTime = firstPhaseTimestamp(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.phase_order - right.phase_order
}

function firstPhaseTimestamp(phase: ProgramPhase) {
  const timestamps = [
    ...phase.groups.flatMap((group) => group.matches.map((match) => match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER)),
    ...phase.knockout_matches.map((match) => match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER),
  ]
  return timestamps.length > 0 ? Math.min(...timestamps) : Number.MAX_SAFE_INTEGER
}

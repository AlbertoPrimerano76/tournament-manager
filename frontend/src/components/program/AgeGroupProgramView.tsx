import { useEffect, useState } from 'react'
import type { AgeGroupProgram, ProgramGroup, ProgramMatch, ProgramPhase, TournamentParticipant } from '@/api/tournaments'
import { useBulkScheduleGroupMatches, useBulkSchedulePhaseMatches, useEnterMatchScore, useUpdateMatchSchedule } from '@/api/matches'
import { useMoveAgeGroupTeam, useRegenerateAgeGroupPhase, useUpdateMatchParticipants } from '@/api/tournaments'
import KnockoutBracket from '@/components/public/KnockoutBracket'
import { CalendarDays, Trophy, Users } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

type PlayingFieldOption = {
  field_name: string
  field_number: number | null
}

export default function AgeGroupProgramView({
  program,
  mode = 'public',
  playingFields = [],
  participants = [],
  variant = 'full',
  matchDurationMinutes = 12,
  intervalMinutes = 8,
}: {
  program: AgeGroupProgram
  mode?: 'public' | 'admin'
  playingFields?: PlayingFieldOption[]
  participants?: TournamentParticipant[]
  variant?: 'full' | 'operations'
  matchDurationMinutes?: number
  intervalMinutes?: number
}) {
  const [adminTab, setAdminTab] = useState<'gironi' | 'partite' | 'eliminazione'>('gironi')
  const [groupStatusView, setGroupStatusView] = useState<'pending' | 'completed'>('pending')
  const [knockoutStatusView, setKnockoutStatusView] = useState<'pending' | 'completed'>('pending')

  if (!program.generated || program.days.length === 0) {
    return (
      <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
        Nessuna struttura generata per questa categoria.
      </div>
    )
  }

  if (mode === 'admin') {
    if (variant === 'operations') {
      return (
        <AdminOperationsView
          program={program}
          playingFields={playingFields}
          participants={participants}
          matchDurationMinutes={matchDurationMinutes}
          intervalMinutes={intervalMinutes}
        />
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'gironi' as const, label: 'Gironi e cambi' },
            { id: 'partite' as const, label: 'Calendario e risultati' },
            { id: 'eliminazione' as const, label: 'Fase finale' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setAdminTab(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                adminTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {adminTab === 'gironi' && <AdminGroupsView program={program} participants={participants} />}
        {adminTab === 'partite' && (
          <AdminMatchesView
            program={program}
            playingFields={playingFields}
            participants={participants}
            statusView={groupStatusView}
            onStatusViewChange={setGroupStatusView}
          />
        )}
        {adminTab === 'eliminazione' && (
          <AdminKnockoutView
            program={program}
            playingFields={playingFields}
            participants={participants}
            statusView={knockoutStatusView}
            onStatusViewChange={setKnockoutStatusView}
          />
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {program.days.map((day) => (
        <section key={day.label} className="overflow-hidden rounded-[1.7rem] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#ffffff_0%,_#f8fafc_100%)] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Giornata</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{day.label}</h3>
              </div>
            </div>
          </div>

          <div className="space-y-5 p-5">
            {day.phases.map((phase) => (
              <div key={phase.id} className="space-y-4 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fase {phase.phase_order}</p>
                    <h4 className="mt-1 text-base font-black text-slate-950">{phase.name}</h4>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {phase.phase_type === 'GROUP_STAGE' ? 'Gironi' : 'Eliminazione'}
                  </span>
                </div>

                {phase.groups.length > 0 && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {phase.groups.map((group) => (
                      <GroupCard key={group.id} group={group} mode="public" />
                    ))}
                  </div>
                )}

                {phase.knockout_matches.length > 0 && (
                  <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Trophy className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-950">Fase a eliminazione</p>
                        <p className="text-xs text-slate-500">Accoppiamenti e turni finali</p>
                      </div>
                    </div>
                    <KnockoutBracket rounds={buildBracketRounds(phase.knockout_matches)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AdminOperationsView({
  program,
  playingFields,
  participants,
  matchDurationMinutes,
  intervalMinutes,
}: {
  program: AgeGroupProgram
  playingFields: PlayingFieldOption[]
  participants: TournamentParticipant[]
  matchDurationMinutes: number
  intervalMinutes: number
}) {
  const phases = flattenPhases(program)
  const [selectedPhaseId, setSelectedPhaseId] = useState(phases[0]?.id ?? '')
  const [statusView, setStatusView] = useState<'pending' | 'completed'>('pending')
  const pageSize = 8
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const selectedPhase = phases.find((phase) => phase.id === selectedPhaseId) ?? phases[0]
  const visibleGroups = selectedPhase?.groups ?? []
  const [selectedGroupId, setSelectedGroupId] = useState(visibleGroups[0]?.id ?? '')

  useEffect(() => {
    setVisibleCount(pageSize)
  }, [selectedPhaseId, selectedGroupId, statusView])

  useEffect(() => {
    if (!selectedPhase) return
    if (selectedPhase.groups.length === 0) {
      setSelectedGroupId('')
      return
    }
    if (!selectedPhase.groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(selectedPhase.groups[0]?.id ?? '')
    }
  }, [selectedPhaseId, selectedPhase, selectedGroupId])

  if (!selectedPhase) {
    return <EmptyBlock text="Nessuna fase disponibile in questa categoria." />
  }

  const selectedGroup = selectedPhase.groups.find((group) => group.id === selectedGroupId) ?? selectedPhase.groups[0]
  const filteredGroupMatches = selectedGroup
    ? selectedGroup.matches.filter((match) => statusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED')
    : []
  const filteredKnockoutMatches = selectedPhase.knockout_matches.filter((match) => statusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED')
  const activeMatches = sortMatchesBySchedule(selectedPhase.groups.length > 0 ? filteredGroupMatches : filteredKnockoutMatches)
  const visibleMatches = activeMatches.slice(0, visibleCount)
  const hasMoreMatches = visibleMatches.length < activeMatches.length
  const nextMatch = activeMatches[0] ?? null

  function jumpToNextMatch() {
    if (!nextMatch) return
    if (visibleCount < pageSize) setVisibleCount(pageSize)
    if (visibleCount < activeMatches.length && !visibleMatches.some((match) => match.id === nextMatch.id)) {
      setVisibleCount((value) => Math.max(value, pageSize))
    }
    window.setTimeout(() => {
      document.getElementById(`scorekeeper-match-${nextMatch.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-[1.35rem] border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Scegli la fase</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {phases.map((phase) => (
                <button
                  key={phase.id}
                  type="button"
                  onClick={() => setSelectedPhaseId(phase.id)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    selectedPhase.id === phase.id
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {phase.name}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(135deg,_#f8fafc_0%,_#ffffff_100%)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Modalità segnapunti</p>
            <p className="mt-2 text-base font-black text-slate-950">Solo tabellini e ritardi</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Qui non puoi cambiare gironi o struttura. Apri una partita, salva risultato, orario finale o ritardo.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.7rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Tabellini</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">{selectedPhase.name}</h3>
          <p className="mt-1 text-sm text-slate-600">
            Scegli prima il filtro giusto, poi apri la partita da aggiornare.
          </p>
          <PhaseTimingNotice phase={selectedPhase} />
        </div>

        {statusView === 'pending' && nextMatch && (
          <div className="mb-4 rounded-[1.3rem] border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Prossima partita</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {nextMatch.home_label} vs {nextMatch.away_label}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {formatMatchScheduleSummary(nextMatch)}
                </p>
              </div>
              <button
                type="button"
                onClick={jumpToNextMatch}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Apri prossima partita
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">1. Stato partite</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStatusView('pending')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  statusView === 'pending' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Da giocare
              </button>
              <button
                type="button"
                onClick={() => setStatusView('completed')}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  statusView === 'completed' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                Giocate
              </button>
            </div>
          </div>

          {selectedPhase.groups.length > 1 && (
            <div className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">2. Girone</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedPhase.groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      selectedGroup?.id === group.id ? 'bg-sky-700 text-white' : 'border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {selectedPhase.groups.length > 0 ? (
            visibleMatches.length > 0 ? visibleMatches.map((match) => (
              <ProgramMatchCard
                key={match.id}
                match={match}
                mode="admin"
                phase={selectedPhase}
                playingFields={playingFields}
                ageGroupId={program.age_group_id}
                participants={participants}
                group={selectedGroup}
                adminVariant="results"
                matchDurationMinutes={matchDurationMinutes}
                intervalMinutes={intervalMinutes}
                domId={`scorekeeper-match-${match.id}`}
                highlight={statusView === 'pending' && nextMatch?.id === match.id}
              />
            )) : (
              <EmptyBlock text="Nessuna partita del girone selezionato con questo stato." />
            )
          ) : visibleMatches.length > 0 ? (
            visibleMatches.map((match) => (
              <ProgramMatchCard
                key={match.id}
                match={match}
                mode="admin"
                phase={selectedPhase}
                playingFields={playingFields}
                ageGroupId={program.age_group_id}
                participants={participants}
                adminVariant="results"
                matchDurationMinutes={matchDurationMinutes}
                intervalMinutes={intervalMinutes}
                domId={`scorekeeper-match-${match.id}`}
                highlight={statusView === 'pending' && nextMatch?.id === match.id}
              />
            ))
          ) : (
            <EmptyBlock text="Nessuna partita della fase selezionata con questo stato." />
          )}
        </div>

        {activeMatches.length > pageSize && (
          <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Partite 1-{visibleMatches.length} di {activeMatches.length}
              </p>
              <div className="flex flex-wrap gap-2">
                {hasMoreMatches && (
                  <>
                    <button
                      type="button"
                      onClick={() => setVisibleCount((value) => Math.min(value + pageSize, activeMatches.length))}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                    >
                      Mostra altre 8
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCount(activeMatches.length)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                    >
                      Mostra tutte
                    </button>
                  </>
                )}
                {visibleMatches.length > pageSize && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(pageSize)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    Mostra meno
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function AdminGroupsView({ program, participants }: { program: AgeGroupProgram; participants: TournamentParticipant[] }) {
  const groupPhases = flattenPhases(program).filter((phase) => phase.groups.length > 0)
  const regeneratePhase = useRegenerateAgeGroupPhase()
  const [phaseMessage, setPhaseMessage] = useState('')
  const [phaseError, setPhaseError] = useState('')
  if (groupPhases.length === 0) {
    return <EmptyBlock text="Nessun girone disponibile in questa categoria." />
  }

  async function handleRegenerate(phaseOrder: number) {
    setPhaseMessage('')
    setPhaseError('')
    try {
      await regeneratePhase.mutateAsync({ ageGroupId: program.age_group_id, phaseOrder })
      setPhaseMessage(`Fase ${phaseOrder} rigenerata correttamente`)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPhaseError(msg ?? 'Errore durante la rigenerazione della fase')
    }
  }

  return (
    <div className="space-y-5">
      {(phaseMessage || phaseError) && (
        <p className={`text-sm ${phaseError ? 'text-red-600' : 'text-emerald-700'}`}>{phaseError || phaseMessage}</p>
      )}
      {groupPhases.map((phase) => (
        <section key={phase.id} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fase {phase.phase_order}</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{phase.name}</h3>
              <PhaseTimingNotice phase={phase} compact />
            </div>
            <button
              type="button"
              onClick={() => void handleRegenerate(phase.phase_order)}
              disabled={regeneratePhase.isPending}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Rigenera da qui
            </button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {phase.groups.map((group) => (
              <AdminGroupCard key={group.id} group={group} phaseGroups={phase.groups} ageGroupId={program.age_group_id} participants={participants} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function AdminMatchesView({
  program,
  playingFields,
  participants,
  statusView,
  onStatusViewChange,
}: {
  program: AgeGroupProgram
  playingFields: PlayingFieldOption[]
  participants: TournamentParticipant[]
  statusView: 'pending' | 'completed'
  onStatusViewChange: (value: 'pending' | 'completed') => void
}) {
  const phases = flattenPhases(program)
  const phasesWithMatches = phases.filter((phase) => phase.groups.some((group) => group.matches.length > 0))
  const regeneratePhase = useRegenerateAgeGroupPhase()
  const [phaseMessage, setPhaseMessage] = useState('')
  const [phaseError, setPhaseError] = useState('')
  if (phasesWithMatches.length === 0) {
    return <EmptyBlock text="Nessuna partita di girone disponibile." />
  }

  async function handleRegenerate(phaseOrder: number) {
    setPhaseMessage('')
    setPhaseError('')
    try {
      await regeneratePhase.mutateAsync({ ageGroupId: program.age_group_id, phaseOrder })
      setPhaseMessage(`Fase ${phaseOrder} rigenerata correttamente`)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPhaseError(msg ?? 'Errore durante la rigenerazione della fase')
    }
  }

  return (
    <div className="space-y-5">
      {(phaseMessage || phaseError) && (
        <p className={`text-sm ${phaseError ? 'text-red-600' : 'text-emerald-700'}`}>{phaseError || phaseMessage}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStatusViewChange('pending')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            statusView === 'pending' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
          }`}
        >
          Da giocare
        </button>
        <button
          type="button"
          onClick={() => onStatusViewChange('completed')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            statusView === 'completed' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
          }`}
        >
          Giocate
        </button>
      </div>
      {phasesWithMatches.map((phase) => (
        <section key={phase.id} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fase {phase.phase_order}</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{phase.name}</h3>
              <PhaseTimingNotice phase={phase} compact />
            </div>
            <button
              type="button"
              onClick={() => void handleRegenerate(phase.phase_order)}
              disabled={regeneratePhase.isPending}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Rigenera da qui
            </button>
          </div>
          <div className="space-y-4">
            {phase.groups.map((group) => (
              group.matches.filter((match) => (
                statusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'
              )).length > 0 ? (
                <div key={group.id} className="rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-950">{group.name}</p>
                  <BulkGroupSchedulePanel group={group} ageGroupId={program.age_group_id} playingFields={playingFields} />
                  <div className="mt-3 space-y-3">
                    {group.matches.filter((match) => (
                      statusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'
                    )).map((match) => (
                      <ProgramMatchCard key={match.id} match={match} mode="admin" phase={phase} playingFields={playingFields} ageGroupId={program.age_group_id} participants={participants} group={group} />
                    ))}
                  </div>
                </div>
              ) : null
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BulkGroupSchedulePanel({
  group,
  ageGroupId,
  playingFields,
}: {
  group: ProgramGroup
  ageGroupId: string
  playingFields: PlayingFieldOption[]
}) {
  const bulkMutation = useBulkScheduleGroupMatches()
  const [startAt, setStartAt] = useState('')
  const [stepMinutes, setStepMinutes] = useState('20')
  const [fieldName, setFieldName] = useState('')
  const [fieldNumber, setFieldNumber] = useState('')
  const [referee, setReferee] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleApply() {
    setMessage('')
    setError('')
    try {
      await bulkMutation.mutateAsync({
        groupId: group.id,
        ageGroupId,
        data: {
          start_at: startAt ? new Date(startAt).toISOString() : null,
          step_minutes: stepMinutes ? Number(stepMinutes) : null,
          field_name: fieldName || null,
          field_number: fieldNumber ? Number(fieldNumber) : null,
          referee: referee.trim() || null,
        },
      })
      setMessage('Programmazione massiva applicata')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante l’applicazione massiva')
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Gestione massiva</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-500">
          Primo orario
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Intervallo minuti
          <input
            type="number"
            min="0"
            value={stepMinutes}
            onChange={(e) => setStepMinutes(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Campo
          <select
            value={fieldName && fieldNumber ? `${fieldName}::${fieldNumber}` : ''}
            onChange={(e) => {
              const [nextFieldName, nextFieldNumber] = e.target.value.split('::')
              setFieldName(nextFieldName || '')
              setFieldNumber(nextFieldNumber || '')
            }}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Lascia invariato</option>
            {playingFields.map((playingField) => (
              <option key={`${group.id}-${playingField.field_name}-${playingField.field_number ?? 'x'}`} value={`${playingField.field_name}::${playingField.field_number ?? ''}`}>
                {playingField.field_name}{playingField.field_number ? ` · Campo ${playingField.field_number}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500 xl:col-span-2">
          Arbitro
          <input
            value={referee}
            onChange={(e) => setReferee(e.target.value)}
            placeholder="Es. Staff torneo A"
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={bulkMutation.isPending}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Applica al girone
        </button>
      </div>

      {(message || error) && (
        <p className={`mt-3 text-sm ${error ? 'text-red-600' : 'text-emerald-700'}`}>{error || message}</p>
      )}
    </div>
  )
}

function AdminKnockoutView({
  program,
  playingFields,
  participants,
  statusView,
  onStatusViewChange,
}: {
  program: AgeGroupProgram
  playingFields: PlayingFieldOption[]
  participants: TournamentParticipant[]
  statusView: 'pending' | 'completed'
  onStatusViewChange: (value: 'pending' | 'completed') => void
}) {
  const knockoutPhases = flattenPhases(program).filter((phase) => phase.knockout_matches.length > 0)
  const regeneratePhase = useRegenerateAgeGroupPhase()
  const [phaseMessage, setPhaseMessage] = useState('')
  const [phaseError, setPhaseError] = useState('')
  if (knockoutPhases.length === 0) {
    return <EmptyBlock text="Nessuna fase a eliminazione disponibile." />
  }

  async function handleRegenerate(phaseOrder: number) {
    setPhaseMessage('')
    setPhaseError('')
    try {
      await regeneratePhase.mutateAsync({ ageGroupId: program.age_group_id, phaseOrder })
      setPhaseMessage(`Fase ${phaseOrder} rigenerata correttamente`)
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setPhaseError(msg ?? 'Errore durante la rigenerazione della fase')
    }
  }

  return (
    <div className="space-y-5">
      {(phaseMessage || phaseError) && (
        <p className={`text-sm ${phaseError ? 'text-red-600' : 'text-emerald-700'}`}>{phaseError || phaseMessage}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onStatusViewChange('pending')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            statusView === 'pending' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
          }`}
        >
          Da giocare
        </button>
        <button
          type="button"
          onClick={() => onStatusViewChange('completed')}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            statusView === 'completed' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'
          }`}
        >
          Giocate
        </button>
      </div>
      {knockoutPhases.map((phase) => (
        <section key={phase.id} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fase {phase.phase_order}</p>
              <h3 className="mt-1 text-lg font-black text-slate-950">{phase.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => void handleRegenerate(phase.phase_order)}
              disabled={regeneratePhase.isPending}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Rigenera da qui
            </button>
          </div>
          <BulkPhaseSchedulePanel phase={phase} ageGroupId={program.age_group_id} playingFields={playingFields} />
          <KnockoutBracket rounds={buildBracketRounds(phase.knockout_matches)} />
          <div className="mt-4 space-y-3">
            {phase.knockout_matches.filter((match) => (
              statusView === 'completed' ? match.status === 'COMPLETED' : match.status !== 'COMPLETED'
            )).map((match) => (
              <ProgramMatchCard key={match.id} match={match} mode="admin" phase={phase} playingFields={playingFields} ageGroupId={program.age_group_id} participants={participants} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function BulkPhaseSchedulePanel({
  phase,
  ageGroupId,
  playingFields,
}: {
  phase: { id: string }
  ageGroupId: string
  playingFields: PlayingFieldOption[]
}) {
  const bulkMutation = useBulkSchedulePhaseMatches()
  const [startAt, setStartAt] = useState('')
  const [stepMinutes, setStepMinutes] = useState('20')
  const [fieldName, setFieldName] = useState('')
  const [fieldNumber, setFieldNumber] = useState('')
  const [referee, setReferee] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleApply() {
    setMessage('')
    setError('')
    try {
      await bulkMutation.mutateAsync({
        phaseId: phase.id,
        ageGroupId,
        data: {
          start_at: startAt ? new Date(startAt).toISOString() : null,
          step_minutes: stepMinutes ? Number(stepMinutes) : null,
          field_name: fieldName || null,
          field_number: fieldNumber ? Number(fieldNumber) : null,
          referee: referee.trim() || null,
        },
      })
      setMessage('Programmazione massiva fase finale applicata')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante l’applicazione massiva della fase finale')
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Gestione massiva fase finale</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-semibold text-slate-500">
          Primo orario
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Intervallo minuti
          <input
            type="number"
            min="0"
            value={stepMinutes}
            onChange={(e) => setStepMinutes(e.target.value)}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Campo
          <select
            value={fieldName && fieldNumber ? `${fieldName}::${fieldNumber}` : ''}
            onChange={(e) => {
              const [nextFieldName, nextFieldNumber] = e.target.value.split('::')
              setFieldName(nextFieldName || '')
              setFieldNumber(nextFieldNumber || '')
            }}
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="">Lascia invariato</option>
            {playingFields.map((playingField) => (
              <option key={`${phase.id}-${playingField.field_name}-${playingField.field_number ?? 'x'}`} value={`${playingField.field_name}::${playingField.field_number ?? ''}`}>
                {playingField.field_name}{playingField.field_number ? ` · Campo ${playingField.field_number}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500 xl:col-span-2">
          Arbitro
          <input
            value={referee}
            onChange={(e) => setReferee(e.target.value)}
            placeholder="Es. Staff finale"
            className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={bulkMutation.isPending}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Applica alla fase finale
        </button>
      </div>

      {(message || error) && (
        <p className={`mt-3 text-sm ${error ? 'text-red-600' : 'text-emerald-700'}`}>{error || message}</p>
      )}
    </div>
  )
}

function GroupCard({ group, mode }: { group: ProgramGroup; mode: 'public' | 'admin' }) {
  return (
    <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">{group.name}</p>
          <p className="mt-1 text-xs text-slate-500">{group.teams.length} squadre</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Users className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {group.teams.map((team, index) => (
          <span
            key={`${group.id}-${team.label}-${index}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              team.is_placeholder ? 'bg-slate-100 text-slate-500' : 'bg-sky-50 text-sky-700'
            }`}
          >
            {team.label}
          </span>
        ))}
      </div>

      {mode === 'public' && group.matches.length > 0 && (
        <div className="mt-4 space-y-3">
          {group.matches.map((match) => (
            <ProgramMatchCard key={match.id} match={match} mode="public" />
          ))}
        </div>
      )}
    </div>
  )
}

function AdminGroupCard({
  group,
  phaseGroups,
  ageGroupId,
  participants,
}: {
  group: ProgramGroup
  phaseGroups: ProgramGroup[]
  ageGroupId: string
  participants: TournamentParticipant[]
}) {
  const moveMutation = useMoveAgeGroupTeam()
  const [targetGroupByTeam, setTargetGroupByTeam] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const participantMap = new Map(participants.map((item) => [item.id, item]))

  async function handleMove(tournamentTeamId: string) {
    const targetGroupId = targetGroupByTeam[tournamentTeamId]
    if (!targetGroupId) return
    setMessage('')
    setError('')
    try {
      await moveMutation.mutateAsync({
        ageGroupId,
        groupId: group.id,
        tournamentTeamId,
        data: { target_group_id: targetGroupId },
      })
      setMessage('Squadra spostata correttamente')
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante lo spostamento della squadra')
    }
  }

  return (
    <div className="rounded-[1.3rem] border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-950">{group.name}</p>
          <p className="mt-1 text-xs text-slate-500">{group.teams.length} squadre</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Users className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {group.teams.map((team, index) => (
          <div key={`${group.id}-${team.label}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{team.label}</p>
            {!team.is_placeholder && team.tournament_team_id && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[180px] flex-1 text-xs font-semibold text-slate-500">
                  Sposta in girone
                  <select
                    value={targetGroupByTeam[team.tournament_team_id] ?? ''}
                    onChange={(e) => setTargetGroupByTeam((current) => ({ ...current, [team.tournament_team_id!]: e.target.value }))}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="">Seleziona girone</option>
                    {phaseGroups.filter((item) => item.id !== group.id).map((targetGroup) => (
                      <option key={targetGroup.id} value={targetGroup.id}>{targetGroup.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => void handleMove(team.tournament_team_id!)}
                  disabled={!targetGroupByTeam[team.tournament_team_id] || moveMutation.isPending}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  Sposta
                </button>
              </div>
            )}
            {team.tournament_team_id && participantMap.get(team.tournament_team_id)?.city && (
              <p className="mt-2 text-xs text-slate-500">{participantMap.get(team.tournament_team_id)?.city}</p>
            )}
          </div>
        ))}
      </div>

      {(message || error) && (
        <p className={`mt-3 text-sm ${error ? 'text-red-600' : 'text-emerald-700'}`}>{error || message}</p>
      )}
    </div>
  )
}

function ProgramMatchCard({
  match,
  mode,
  playingFields = [],
  ageGroupId,
  participants = [],
  group,
  phase: _phase,
  adminVariant = 'full',
  matchDurationMinutes = 12,
  intervalMinutes = 8,
  domId,
  highlight = false,
}: {
  match: ProgramMatch
  mode: 'public' | 'admin'
  playingFields?: PlayingFieldOption[]
  ageGroupId?: string
  participants?: TournamentParticipant[]
  group?: ProgramGroup
  phase?: ProgramPhase
  adminVariant?: 'full' | 'results' | 'delays'
  matchDurationMinutes?: number
  intervalMinutes?: number
  domId?: string
  highlight?: boolean
}) {
  const scoreMutation = useEnterMatchScore()
  const scheduleMutation = useUpdateMatchSchedule()
  const participantsMutation = useUpdateMatchParticipants()
  const [homeScore, setHomeScore] = useState(match.home_score?.toString() ?? '')
  const [awayScore, setAwayScore] = useState(match.away_score?.toString() ?? '')
  const [homeTries, setHomeTries] = useState(match.home_tries?.toString() ?? '')
  const [awayTries, setAwayTries] = useState(match.away_tries?.toString() ?? '')
  const [scheduledAt, setScheduledAt] = useState(toLocalDateTimeValue(match.scheduled_at))
  const [actualEndAt, setActualEndAt] = useState(getInitialActualEndAt(match.scheduled_at, match.actual_end_at, matchDurationMinutes))
  const [delayMinutes, setDelayMinutes] = useState('')
  const [fieldName, setFieldName] = useState(match.field_name ?? '')
  const [fieldNumber, setFieldNumber] = useState(match.field_number?.toString() ?? '')
  const [referee, setReferee] = useState(match.referee ?? '')
  const [status, setStatus] = useState(match.status)
  const [propagateDelay, setPropagateDelay] = useState(true)
  const [scoreMessage, setScoreMessage] = useState('')
  const [scoreError, setScoreError] = useState('')
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [homeTeamId, setHomeTeamId] = useState(match.home_team_id ?? '')
  const [awayTeamId, setAwayTeamId] = useState(match.away_team_id ?? '')
  const [participantsMessage, setParticipantsMessage] = useState('')
  const [participantsError, setParticipantsError] = useState('')
  const isEditable = mode === 'admin'
  const selectedPlayingField = playingFields.find((playingField) => (
    playingField.field_name === fieldName && `${playingField.field_number ?? ''}` === fieldNumber
  ))

  useEffect(() => {
    setHomeScore(match.home_score?.toString() ?? '')
    setAwayScore(match.away_score?.toString() ?? '')
    setHomeTries(match.home_tries?.toString() ?? '')
    setAwayTries(match.away_tries?.toString() ?? '')
    setScheduledAt(toLocalDateTimeValue(match.scheduled_at))
    setActualEndAt(getInitialActualEndAt(match.scheduled_at, match.actual_end_at, matchDurationMinutes))
    setDelayMinutes('')
    setFieldName(match.field_name ?? '')
    setFieldNumber(match.field_number?.toString() ?? '')
    setReferee(match.referee ?? '')
    setStatus(match.status)
    setHomeTeamId(match.home_team_id ?? '')
    setAwayTeamId(match.away_team_id ?? '')
  }, [match])

  const availableParticipantOptions = group
    ? group.teams.filter((item) => !item.is_placeholder && item.tournament_team_id)
        .map((item) => ({ value: item.tournament_team_id!, label: item.label }))
    : participants.map((item) => ({ value: item.id, label: item.team_name }))
  const scheduledAtValue = scheduledAt || toLocalDateTimeValue(match.scheduled_at)
  const actualEndAtValue = actualEndAt || getInitialActualEndAt(match.scheduled_at, match.actual_end_at, matchDurationMinutes)
  const expectedEndAt = deriveExpectedEnd(scheduledAtValue || match.scheduled_at, matchDurationMinutes)
  const slotDeadlineAt = deriveSlotDeadline(scheduledAtValue || match.scheduled_at, matchDurationMinutes, intervalMinutes)
  const calculatedDelayMinutes = deriveDelayMinutes(
    scheduledAtValue || match.scheduled_at,
    actualEndAtValue || match.actual_end_at,
    matchDurationMinutes,
    intervalMinutes,
  )
  const visibleDelayMinutes = delayMinutes === '' ? calculatedDelayMinutes : Number(delayMinutes)
  async function handleSaveScore() {
    setScoreError('')
    setScoreMessage('')
    if (homeScore === '' || awayScore === '') {
      setScoreError('Inserisci entrambi i punteggi prima di salvare il risultato.')
      return
    }
    try {
      await scoreMutation.mutateAsync({
        matchId: match.id,
        data: {
          home_score: Number(homeScore),
          away_score: Number(awayScore),
          status: adminVariant === 'results' ? 'COMPLETED' : status,
        },
      })
      if (actualEndAtValue) {
        await scheduleMutation.mutateAsync({
          matchId: match.id,
          data: {
            scheduled_at: scheduledAtValue ? new Date(scheduledAtValue).toISOString() : match.scheduled_at,
            actual_end_at: new Date(actualEndAtValue).toISOString(),
            delay_minutes: calculatedDelayMinutes,
            field_name: fieldName.trim() || null,
            field_number: fieldNumber ? Number(fieldNumber) : null,
            referee: referee.trim() || null,
            propagate_delay: calculatedDelayMinutes > 0 && propagateDelay,
          },
        })
      }
      setScoreMessage('Risultato salvato correttamente')
    } catch (error) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setScoreError(message ?? 'Errore durante il salvataggio del risultato')
    }
  }

  async function handleClearScore() {
    setScoreError('')
    setScoreMessage('')
    try {
      await scoreMutation.mutateAsync({
        matchId: match.id,
        data: {
          clear_result: true,
          status: 'SCHEDULED',
        },
      })
      setHomeScore('')
      setAwayScore('')
      setHomeTries('')
      setAwayTries('')
      setActualEndAt('')
      setStatus('SCHEDULED')
      setScoreMessage('Risultato annullato')
    } catch (error) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setScoreError(message ?? 'Errore durante l’annullamento del risultato')
    }
  }

  async function handleSaveSchedule() {
    setScheduleError('')
    setScheduleMessage('')
    try {
      await scheduleMutation.mutateAsync({
        matchId: match.id,
        data: {
          scheduled_at: scheduledAtValue ? new Date(scheduledAtValue).toISOString() : null,
          actual_end_at: actualEndAtValue ? new Date(actualEndAtValue).toISOString() : null,
          delay_minutes: delayMinutes === '' ? null : Number(delayMinutes),
          field_name: fieldName.trim() || null,
          field_number: fieldNumber ? Number(fieldNumber) : null,
          referee: referee.trim() || null,
          propagate_delay: propagateDelay,
        },
      })
      setScheduleMessage('Programmazione salvata correttamente')
    } catch (error) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setScheduleError(message ?? 'Errore durante il salvataggio della programmazione')
    }
  }

  async function handleSaveParticipants() {
    if (!ageGroupId) return
    setParticipantsError('')
    setParticipantsMessage('')
    try {
      await participantsMutation.mutateAsync({
        matchId: match.id,
        ageGroupId,
        data: {
          home_team_id: homeTeamId || null,
          away_team_id: awayTeamId || null,
        },
      })
      setParticipantsMessage('Squadre partita aggiornate')
    } catch (error) {
      const message = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setParticipantsError(message ?? 'Errore durante l’aggiornamento delle squadre')
    }
  }

  return (
    <div id={domId} className={`rounded-2xl border p-3 ${
      adminVariant !== 'full'
        ? status === 'COMPLETED'
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-amber-200 bg-amber-50/40'
        : 'border-slate-200 bg-slate-50'
    } ${highlight ? 'ring-2 ring-amber-300 ring-offset-2' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span className="truncate font-semibold text-slate-900">{match.home_label}</span>
              {adminVariant === 'results' ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-black text-slate-950"
                />
              ) : match.home_score !== null ? <span className="font-black text-slate-950">{match.home_score}</span> : null}
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
              <span className="truncate font-semibold text-slate-900">{match.away_label}</span>
              {adminVariant === 'results' ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-right text-sm font-black text-slate-950"
                />
              ) : match.away_score !== null ? <span className="font-black text-slate-950">{match.away_score}</span> : null}
            </div>
          </div>
        </div>
        <span className={`self-start rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
          status === 'COMPLETED'
            ? 'bg-emerald-100 text-emerald-700'
            : status === 'IN_PROGRESS'
              ? 'bg-amber-100 text-amber-700'
              : status === 'POSTPONED' || status === 'CANCELLED'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-200 text-slate-600'
        }`}>
          {statusLabel(status)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 rounded-xl bg-white px-3 py-3 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
        <p><span className="font-semibold text-slate-900">Orario:</span> {match.scheduled_at ? format(new Date(match.scheduled_at), 'HH:mm', { locale: it }) : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Campo:</span> {match.field_name ? `${match.field_name}${match.field_number ? ` · Campo ${match.field_number}` : ''}` : 'Da definire'}</p>
        <p><span className="font-semibold text-slate-900">Arbitro:</span> {match.referee || 'Da definire'}</p>
        {(adminVariant === 'results' || adminVariant === 'delays') && (
          <>
            <p><span className="font-semibold text-slate-900">Fine prevista:</span> {expectedEndAt ? format(expectedEndAt, 'HH:mm', { locale: it }) : 'Da definire'}</p>
            <p><span className="font-semibold text-slate-900">Slot fino a:</span> {slotDeadlineAt ? format(slotDeadlineAt, 'HH:mm', { locale: it }) : 'Da definire'}</p>
            <p><span className="font-semibold text-slate-900">Fine reale:</span> {match.actual_end_at ? format(new Date(match.actual_end_at), 'HH:mm', { locale: it }) : 'Da definire'}</p>
            <p>
              <span className="font-semibold text-slate-900">Ritardo:</span>{' '}
              {visibleDelayMinutes > 0 ? (
                <span className="font-bold text-rose-600">+{visibleDelayMinutes} min</span>
              ) : (
                <span className="font-medium text-emerald-700">in orario</span>
              )}
            </p>
          </>
        )}
      </div>

      {isEditable && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
          {adminVariant === 'full' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-500">
                Squadra casa
                <select
                  value={homeTeamId}
                  onChange={(e) => setHomeTeamId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Da definire</option>
                  {availableParticipantOptions.map((option) => (
                    <option key={`home-${match.id}-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Squadra ospite
                <select
                  value={awayTeamId}
                  onChange={(e) => setAwayTeamId(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Da definire</option>
                  {availableParticipantOptions.map((option) => (
                    <option key={`away-${match.id}-${option.value}`} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveParticipants()}
                disabled={participantsMutation.isPending}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Salva squadre partita
              </button>
            </div>

            {(participantsMessage || participantsError) && (
              <p className={`mt-3 text-sm ${participantsError ? 'text-red-600' : 'text-emerald-700'}`}>
                {participantsError || participantsMessage}
              </p>
            )}
          </div>
          )}

          {(adminVariant === 'full' || adminVariant === 'delays') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className={`grid gap-3 ${adminVariant === 'delays' ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-4'}`}>
              <label className="text-xs font-semibold text-slate-500">
                Orario
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Ritardo
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <input
                    type="number"
                    value={delayMinutes}
                    onChange={(e) => setDelayMinutes(e.target.value)}
                    placeholder="0"
                    className="block min-w-0 flex-1 bg-transparent text-sm text-slate-900 focus:outline-none"
                  />
                  <span className="text-xs font-medium text-slate-500">min</span>
                </div>
              </label>
              {adminVariant === 'delays' && (
                <label className="text-xs font-semibold text-slate-500">
                  Ora fine
                  <input
                    type="datetime-local"
                    value={actualEndAtValue}
                    onChange={(e) => setActualEndAt(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>
              )}
              {adminVariant === 'full' && (
                <>
                  <label className="text-xs font-semibold text-slate-500">
                    Campo definito
                    <select
                      value={selectedPlayingField ? `${selectedPlayingField.field_name}::${selectedPlayingField.field_number ?? ''}` : ''}
                      onChange={(e) => {
                        const [nextFieldName, nextFieldNumber] = e.target.value.split('::')
                        setFieldName(nextFieldName || '')
                        setFieldNumber(nextFieldNumber || '')
                      }}
                      className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Seleziona campo del programma</option>
                      {playingFields.map((playingField) => (
                        <option key={`${playingField.field_name}-${playingField.field_number ?? 'x'}`} value={`${playingField.field_name}::${playingField.field_number ?? ''}`}>
                          {playingField.field_name}{playingField.field_number ? ` · Campo ${playingField.field_number}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-500">
                    Arbitro
                    <input
                      value={referee}
                      onChange={(e) => setReferee(e.target.value)}
                      className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={propagateDelay}
                  onChange={(e) => setPropagateDelay(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Propaga il ritardo alle partite successive dello stesso campo
              </label>
              <button
                type="button"
                onClick={() => void handleSaveSchedule()}
                disabled={scheduleMutation.isPending}
                className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  adminVariant === 'delays'
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-700'
                }`}
              >
                {adminVariant === 'delays' ? 'Salva ritardo e orario' : 'Salva programmazione'}
              </button>
            </div>

            {(scheduleMessage || scheduleError) && (
              <p className={`mt-3 text-sm ${scheduleError ? 'text-red-600' : 'text-emerald-700'}`}>
                {scheduleError || scheduleMessage}
              </p>
            )}
          </div>
          )}

          {(adminVariant === 'full' || adminVariant === 'results') && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            {adminVariant === 'results' ? (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  Salvando il punteggio, la partita viene segnata come <span className="font-bold text-slate-900">finale</span>.
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-500">
                  Ora fine
                  <input
                    type="datetime-local"
                    value={actualEndAtValue}
                    onChange={(e) => setActualEndAt(e.target.value)}
                    className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>
                  <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={propagateDelay}
                      onChange={(e) => setPropagateDelay(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Propaga il ritardo
                  </label>
                </div>
              </div>
            ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="text-xs font-semibold text-slate-500">
                Stato partita
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="SCHEDULED">Da giocare</option>
                  <option value="IN_PROGRESS">In corso</option>
                  <option value="COMPLETED">Finale</option>
                  <option value="POSTPONED">Rinviata</option>
                  <option value="CANCELLED">Annullata</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Punti casa
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={homeScore}
                  onChange={(e) => setHomeScore(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Punti ospite
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={awayScore}
                  onChange={(e) => setAwayScore(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Mete casa
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={homeTries}
                  onChange={(e) => setHomeTries(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <label className="text-xs font-semibold text-slate-500">
                Mete ospite
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={awayTries}
                  onChange={(e) => setAwayTries(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
            </div>
            )}

            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => void handleSaveScore()}
                disabled={scoreMutation.isPending}
                className="rounded-xl bg-rugby-green px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {adminVariant === 'results' ? 'Salva punteggio e fine partita' : 'Salva risultato'}
              </button>
              <button
                type="button"
                onClick={() => void handleClearScore()}
                disabled={scoreMutation.isPending}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Annulla risultato
              </button>
            </div>

            {(scoreMessage || scoreError) && (
              <p className={`mt-3 text-sm ${scoreError ? 'text-red-600' : 'text-emerald-700'}`}>
                {scoreError || scoreMessage}
              </p>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}

function statusLabel(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'Finale'
    case 'IN_PROGRESS':
      return 'In corso'
    case 'POSTPONED':
      return 'Rinviata'
    case 'CANCELLED':
      return 'Annullata'
    default:
      return 'Da giocare'
  }
}

function flattenPhases(program: AgeGroupProgram) {
  const phases = [...program.days.flatMap((day) => day.phases)].sort(compareProgramPhases)
  if (!program.hide_future_phases_until_complete) return phases

  const visible: ProgramPhase[] = []
  for (const phase of phases) {
    if (visible.length === 0) {
      visible.push(phase)
      continue
    }
    if (!isProgramPhaseComplete(visible[visible.length - 1])) break
    visible.push(phase)
  }
  return visible
}

function isProgramPhaseComplete(phase: ProgramPhase) {
  const matches = [...phase.groups.flatMap((group) => group.matches), ...phase.knockout_matches]
  return matches.length > 0 && matches.every((match) => match.status === 'COMPLETED')
}

function compareProgramPhases(left: ProgramPhase, right: ProgramPhase) {
  const leftTime = firstProgramPhaseTimestamp(left)
  const rightTime = firstProgramPhaseTimestamp(right)
  if (leftTime !== rightTime) return leftTime - rightTime
  return left.phase_order - right.phase_order
}

function firstProgramPhaseTimestamp(phase: ProgramPhase) {
  const timestamps = [
    ...phase.groups.flatMap((group) => group.matches.map((match) => match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER)),
    ...phase.knockout_matches.map((match) => match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER),
  ]
  return timestamps.length > 0 ? Math.min(...timestamps) : Number.MAX_SAFE_INTEGER
}

function buildBracketRounds(matches: ProgramMatch[]) {
  const grouped = new Map<string, { roundName: string; roundOrder: number; matches: Array<{ id: string; homeTeam: string; awayTeam: string; homeScore: number | null; awayScore: number | null; status: string }> }>()

  matches.forEach((match, index) => {
    const key = match.bracket_round || `Round ${index + 1}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        roundName: key,
        roundOrder: grouped.size + 1,
        matches: [],
      })
    }
    grouped.get(key)?.matches.push({
      id: match.id,
      homeTeam: match.home_label,
      awayTeam: match.away_label,
      homeScore: match.home_score,
      awayScore: match.away_score,
      status: match.status,
    })
  })

  return Array.from(grouped.values())
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  )
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function deriveExpectedEnd(scheduledAt: string | null, durationMinutes: number) {
  if (!scheduledAt) return null
  const base = new Date(scheduledAt)
  return new Date(base.getTime() + durationMinutes * 60_000)
}

function deriveSlotDeadline(scheduledAt: string | null, durationMinutes: number, intervalMinutes: number) {
  if (!scheduledAt) return null
  const base = new Date(scheduledAt)
  return new Date(base.getTime() + (durationMinutes + intervalMinutes) * 60_000)
}

function getInitialActualEndAt(
  scheduledAt: string | null,
  actualEndAt: string | null,
  durationMinutes: number,
) {
  if (actualEndAt) return toLocalDateTimeValue(actualEndAt)
  const expectedEnd = deriveExpectedEnd(scheduledAt, durationMinutes)
  return expectedEnd ? toLocalDateTimeValue(expectedEnd.toISOString()) : ''
}

function deriveDelayMinutes(
  scheduledAt: string | null,
  actualEndAt: string | null,
  durationMinutes: number,
  intervalMinutes: number,
) {
  if (!scheduledAt || !actualEndAt) return 0
  const slotDeadline = deriveSlotDeadline(scheduledAt, durationMinutes, intervalMinutes)
  if (!slotDeadline) return 0
  const delay = Math.round((new Date(actualEndAt).getTime() - slotDeadline.getTime()) / 60_000)
  return Math.max(delay, 0)
}


function formatPhaseTimingSummary(phase: ProgramPhase) {
  const actualStart = phase.phase_start_at ? format(new Date(phase.phase_start_at), 'HH:mm', { locale: it }) : 'da definire'
  const estimatedEnd = phase.estimated_end_at ? format(new Date(phase.estimated_end_at), 'HH:mm', { locale: it }) : 'da definire'
  return {
    changed: false,
    text: `Inizio ${actualStart} · fine stimata ${estimatedEnd}`,
  }
}

function PhaseTimingNotice({ phase, compact = false }: { phase: ProgramPhase; compact?: boolean }) {
  const summary = formatPhaseTimingSummary(phase)
  return (
    <p className={`mt-2 text-sm text-slate-500 ${compact ? 'max-w-2xl' : ''}`}>
      {summary.text}
    </p>
  )
}

function matchScheduleTimestamp(match: ProgramMatch) {
  return match.scheduled_at ? new Date(match.scheduled_at).getTime() : Number.MAX_SAFE_INTEGER
}

function sortMatchesBySchedule(matches: ProgramMatch[]) {
  return [...matches].sort((left, right) => {
    const leftTime = matchScheduleTimestamp(left)
    const rightTime = matchScheduleTimestamp(right)
    if (leftTime !== rightTime) return leftTime - rightTime
    return `${left.home_label}-${left.away_label}`.localeCompare(`${right.home_label}-${right.away_label}`)
  })
}

function formatMatchScheduleSummary(match: ProgramMatch) {
  const parts: string[] = []
  parts.push(match.scheduled_at ? format(new Date(match.scheduled_at), 'HH:mm', { locale: it }) : 'Orario da definire')
  if (match.field_name) {
    parts.push(match.field_number ? `${match.field_name} · Campo ${match.field_number}` : match.field_name)
  }
  return parts.join(' · ')
}

export function AdminAllMatchesEditorView({
  program,
  playingFields,
  participants,
  matchDurationMinutes = 12,
  intervalMinutes = 8,
}: {
  program: AgeGroupProgram
  playingFields: PlayingFieldOption[]
  participants: TournamentParticipant[]
  matchDurationMinutes?: number
  intervalMinutes?: number
}) {
  const phases = flattenPhases(program)
  const phasesWithMatches = phases.filter((phase) => (
    phase.groups.some((g) => g.matches.length > 0) || phase.knockout_matches.length > 0
  ))

  if (phasesWithMatches.length === 0) {
    return <EmptyBlock text="Nessuna partita disponibile per questa categoria." />
  }

  return (
    <div className="space-y-5">
      {phasesWithMatches.map((phase) => (
        <section key={phase.id} className="rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Fase {phase.phase_order}</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">{phase.name}</h3>
            {phase.phase_start_at && (
              <p className="mt-1 text-sm text-slate-500">
                Inizio {format(new Date(phase.phase_start_at), 'HH:mm', { locale: it })}
                {phase.estimated_end_at && ` · fine stimata ${format(new Date(phase.estimated_end_at), 'HH:mm', { locale: it })}`}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {phase.groups.map((group) => (
              <div key={group.id}>
                {phase.groups.length > 1 && (
                  <p className="mb-2 text-sm font-bold text-slate-700">{group.name}</p>
                )}
                <div className="space-y-3">
                  {group.matches.map((match) => (
                    <ProgramMatchCard
                      key={match.id}
                      match={match}
                      mode="admin"
                      phase={phase}
                      playingFields={playingFields}
                      ageGroupId={program.age_group_id}
                      participants={participants}
                      group={group}
                      adminVariant="full"
                      matchDurationMinutes={matchDurationMinutes}
                      intervalMinutes={intervalMinutes}
                    />
                  ))}
                </div>
              </div>
            ))}

            {phase.knockout_matches.length > 0 && (
              <div className="space-y-3">
                {phase.groups.length > 0 && (
                  <p className="text-sm font-bold text-slate-700">Partite finali</p>
                )}
                {sortMatchesBySchedule(phase.knockout_matches).map((match) => (
                  <ProgramMatchCard
                    key={match.id}
                    match={match}
                    mode="admin"
                    phase={phase}
                    playingFields={playingFields}
                    ageGroupId={program.age_group_id}
                    participants={participants}
                    adminVariant="full"
                    matchDurationMinutes={matchDurationMinutes}
                    intervalMinutes={intervalMinutes}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

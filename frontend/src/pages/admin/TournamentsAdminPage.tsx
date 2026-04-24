import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import {
  useAdminTournaments, useCreateTournament, useUpdateTournament, useDeleteTournament,
  useAdminTournamentAgeGroups, useCreateAgeGroup, useDeleteAgeGroup,
  useAgeGroupParticipants, useStructureTemplates, useUpdateAgeGroupStructure,
  useUpdateAgeGroup, useCreateStructureTemplate, useCreateTournamentTemplate, useTournamentTemplates, useAdminAgeGroupProgram, useGenerateAgeGroupProgram, useDeleteAgeGroupProgram, useResetTournamentResults, downloadAdminAgeGroupProgramPdf, downloadAdminAgeGroupProgramExcel, downloadAdminTournamentFullExcel, downloadAdminTournamentFullPdf, downloadAdminTournamentCampoCalendarExcel, downloadAdminTournamentCampoCalendarPdf, Tournament, EVENT_TYPE_LABELS, type AgeGroup, type AgeGroupProgram, type ProgramMatch, type StructureTemplate, type TournamentTemplate, type AgeGroupScoringRules, type TournamentParticipant,
} from '@/api/tournaments'
import { apiClient } from '@/api/client'
import { useAdminOrganizations, useCreateOrganization } from '@/api/organizations'
import { useAdminTeams, useCreateTeam, useEnrollTournamentTeam, useUnenrollTournamentTeam, useUpdateTeam } from '@/api/teams'
import { useOrganizationFields } from '@/api/fields'
import ImageUpload from '@/components/shared/ImageUpload'
import AgeGroupProgramView, { AdminAllMatchesEditorView } from '@/components/program/AgeGroupProgramView'
import { Calendar, MapPin, Globe, Pencil, Trash2, X, Plus, Eye, EyeOff, Users, Save, ArrowRight, ExternalLink, Sparkles, AlertTriangle, Clock3, Download, ClipboardList } from 'lucide-react'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { useAuth } from '@/context/AuthContext'

function slugifyTournamentPart(value: string) {
  return value.toLowerCase()
    .replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìí]/g, 'i')
    .replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function buildTournamentSlugPreview({
  organizationSlug,
  name,
  eventType,
  year,
  startDate,
}: {
  organizationSlug?: string | null
  name: string
  eventType: 'TOURNAMENT' | 'GATHERING'
  year: number
  startDate?: string
}) {
  const orgPart = slugifyTournamentPart(organizationSlug || 'societa')
  const namePart = slugifyTournamentPart(name || 'evento')
  const suffix = eventType === 'GATHERING' && startDate ? startDate : String(year)
  return [orgPart, namePart, suffix].filter(Boolean).join('-')
}

export default function TournamentsAdminPage() {
  const { tournamentId, ageGroupId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: tournaments, isLoading } = useAdminTournaments()
  const { data: organizations } = useAdminOrganizations()
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('all')
  const [eventTypeFilter, setEventTypeFilter] = useState<'all' | Tournament['event_type']>('all')
  const [yearFilter, setYearFilter] = useState('all')
  function openCreate() { navigate('/admin/tornei/nuovo') }
  function openEdit(t: Tournament) { navigate(`/admin/tornei/${t.id}/modifica`) }
  function openOperations(t: Tournament) { navigate(`/admin/tornei/${t.id}/gestione`) }
  function openCategories(t: Tournament) { navigate(`/admin/tornei/${t.id}/categorie`) }
  const isScoreKeeper = user?.role === 'SCORE_KEEPER'
  const filteredTournaments = (tournaments ?? []).filter((tournament) => {
    const matchesSearch = search.trim().length === 0
      || tournament.name.toLowerCase().includes(search.toLowerCase())
      || (tournament.organization_name ?? '').toLowerCase().includes(search.toLowerCase())
      || tournament.slug.toLowerCase().includes(search.toLowerCase())
    const matchesOrg = organizationFilter === 'all' || tournament.organization_id === organizationFilter
    const matchesType = eventTypeFilter === 'all' || tournament.event_type === eventTypeFilter
    const matchesYear = yearFilter === 'all' || String(tournament.year) === yearFilter
    return matchesSearch && matchesOrg && matchesType && matchesYear
  })

  if (tournamentId && ageGroupId && location.pathname.endsWith('/gestione')) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento gestione categoria...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <AgeGroupOperationsScreen tournament={tournament} ageGroupId={ageGroupId} />
  }

  if (tournamentId && !ageGroupId && location.pathname.endsWith('/categorie')) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento categorie...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <TournamentCategoriesScreen tournament={tournament} />
  }

  if (tournamentId && location.pathname.endsWith('/calendario')) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento calendario campi...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <TournamentFieldScheduleScreen tournament={tournament} />
  }

  if (tournamentId && ageGroupId) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento configurazione categoria...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <AgeGroupConfigurationScreen tournament={tournament} ageGroupId={ageGroupId} />
  }

  if (location.pathname.endsWith('/nuovo')) {
    return <TournamentEditorScreen tournament={null} />
  }

  if (tournamentId && location.pathname.endsWith('/modifica')) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento evento...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <TournamentEditorScreen tournament={tournament} />
  }

  if (tournamentId && location.pathname.endsWith('/gestione')) {
    const tournament = tournaments?.find((item) => item.id === tournamentId) ?? null

    if (isLoading) {
      return <div className="py-12 text-center text-sm text-slate-500">Caricamento gestione evento...</div>
    }

    if (!tournament) {
      return (
        <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
          Evento non trovato.
        </div>
      )
    }

    return <TournamentOperationsScreen tournament={tournament} />
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Gestione eventi</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Tornei e raggruppamenti</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Gli eventi sono raggruppati per società organizzatrice. Ogni evento può essere un
            torneo oppure un raggruppamento, con URL coerente per anno o data e configurazione
            completa delle categorie.
          </p>
        </div>
        {!isScoreKeeper && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-2xl bg-rugby-green px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-rugby-green-dark"
          >
            <Plus className="h-4 w-4" /> Nuovo evento
          </button>
        )}
      </div>

      <div className="mb-5 grid gap-3 rounded-[1.8rem] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.4)] backdrop-blur md:grid-cols-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca torneo, raggruppamento o società"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
        />
        <select value={organizationFilter} onChange={(e) => setOrganizationFilter(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900">
          <option value="all">Tutte le società</option>
          {(organizations ?? []).map((organization) => (
            <option key={organization.id} value={organization.id}>{organization.name}</option>
          ))}
        </select>
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

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Caricamento...</div>}

      {!isLoading && filteredTournaments.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <p className="font-medium">{isScoreKeeper ? 'Nessun torneo assegnato' : 'Nessun evento trovato'}</p>
          <p className="text-sm mt-1">{isScoreKeeper ? 'Chiedi a un amministratore di assegnarti uno o più tornei.' : 'Prova a cambiare i filtri o crea un nuovo evento.'}</p>
        </div>
      )}

      {filteredTournaments.length > 0 && (
        <div className="space-y-6">
          {Object.entries(
            filteredTournaments.reduce<Record<string, Tournament[]>>((acc, tournament) => {
              const key = tournament.organization_id
              acc[key] = acc[key] ?? []
              acc[key].push(tournament)
              return acc
            }, {})
          )
            .sort((left, right) => {
              const leftName = organizations?.find((org) => org.id === left[0])?.name ?? left[0]
              const rightName = organizations?.find((org) => org.id === right[0])?.name ?? right[0]
              return leftName.localeCompare(rightName)
            })
            .map(([organizationId, organizationTournaments]) => {
              const organization = organizations?.find((org) => org.id === organizationId)
              const label = organization?.name ?? organizationTournaments[0]?.organization_name ?? 'Società'
              return (
                <section key={organizationId} className="rounded-[1.8rem] border border-white/80 bg-white/70 p-4 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.45)] backdrop-blur">
                  <div className="mb-4 flex items-center gap-3 px-2">
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                      {organization?.logo_url ? (
                        <img src={organization.logo_url} alt={label} className="h-9 w-9 object-contain" />
                      ) : (
                        <span className="text-xs font-black text-slate-600">{label.slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-slate-900">{label}</p>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
                        {organizationTournaments.length} eventi
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {organizationTournaments.map(t => (
                      <TournamentRow
                        key={t.id}
                        tournament={t}
                        onEdit={() => openEdit(t)}
                        onOperations={() => openOperations(t)}
                        onCategories={() => openCategories(t)}
                        canEdit={!isScoreKeeper}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
        </div>
      )}
    </div>
  )
}

function TournamentEditorScreen({ tournament }: { tournament: Tournament | null }) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to="/admin/tornei" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600">
              Tornei
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">
              {tournament ? 'Modifica evento' : 'Nuovo evento'}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Pagina completa per configurare dati base, branding, template, sponsor e impostazione pubblica dell&apos;evento.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/tornei')}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Torna ai tornei
          </button>
        </div>
      </div>

      <TournamentFormDrawer tournament={tournament} onClose={() => navigate('/admin/tornei')} pageMode />
    </div>
  )
}

function TournamentRow({ tournament: t, onEdit, onOperations, onCategories, canEdit }: {
  tournament: Tournament; onEdit: () => void; onOperations: () => void; onCategories: () => void; canEdit: boolean
}) {
  const deleteMutation = useDeleteTournament()
  const updateMutation = useUpdateTournament()
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleDelete() {
    deleteMutation.mutate(t.id)
    setConfirmingDelete(false)
  }

  function togglePublish() {
    updateMutation.mutate({ id: t.id, data: { is_published: !t.is_published } })
  }

  return (
    <div className="rounded-[1.8rem] border border-white/80 bg-white/85 px-6 py-5 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-lg font-bold text-slate-900">{t.name}</p>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
            {EVENT_TYPE_LABELS[t.event_type]}
          </span>
          <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
            t.is_published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {t.is_published ? 'Pubblicato' : 'Bozza'}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
          <span>{t.year}</span>
          {t.start_date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(t.start_date), 'd MMM yyyy', { locale: it })}
            </span>
          )}
          {t.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />{t.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" />{t.slug}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {canEdit && (
          <>
            <button
              onClick={togglePublish}
              title={t.is_published ? 'Nascondi' : 'Pubblica'}
              className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
            >
              {t.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button
              onClick={onEdit}
              className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
      </div>
      {confirmingDelete && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="flex-1 text-sm font-semibold text-red-800">Eliminare «{t.name}»? L&apos;operazione non è reversibile.</p>
          <button onClick={handleDelete} disabled={deleteMutation.isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">Elimina</button>
          <button onClick={() => setConfirmingDelete(false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Annulla</button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {canEdit && (
          <button
            onClick={onCategories}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
          >
            <Sparkles className="h-4 w-4" />
            Categorie
          </button>
        )}
        <button
          onClick={onOperations}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <Calendar className="h-4 w-4" />
          Risultati e ritardi
        </button>
        <Link
          to={`/tornei/${t.slug}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100"
        >
          <ExternalLink className="h-4 w-4" />
          Apri evento
        </Link>
      </div>
    </div>
  )
}

function TournamentOperationsScreen({ tournament }: { tournament: Tournament }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isScoreKeeper = user?.role === 'SCORE_KEEPER'
  const resetTournamentResults = useResetTournamentResults()
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  async function handleResetTournamentResults() {
    setResetMessage('')
    setResetError('')
    const confirmed = window.confirm('Resetto tutti i risultati e tutti i ritardi del torneo? Le partite verranno rigenerate da zero usando la configurazione attuale.')
    if (!confirmed) return

    try {
      const result = await resetTournamentResults.mutateAsync(tournament.id)
      setResetMessage(
        result.reset_age_groups > 0
          ? `Reset completato: ${result.reset_age_groups} categorie riportate allo stato iniziale.`
          : 'Nessuna categoria con programma generato da resettare.'
      )
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setResetError(msg ?? 'Errore durante il reset dei risultati del torneo')
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to="/admin/tornei" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600">
              Tornei
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Risultati</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/admin/tornei/${tournament.id}/programma`}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Programma completo
            </Link>
            {!isScoreKeeper && (
              <div className="flex flex-wrap gap-2">
                <Link
                  to={`/admin/tornei/${tournament.id}/calendario`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                >
                  <Calendar className="h-4 w-4" />
                  Calendario impianti
                </Link>
                <button
                  type="button"
                  onClick={() => void handleResetTournamentResults()}
                  disabled={resetTournamentResults.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  {resetTournamentResults.isPending ? 'Reset in corso...' : 'Reset risultati torneo'}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate('/admin/tornei')}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Torna ai tornei
            </button>
          </div>
        </div>
      </div>

      {(resetMessage || resetError) && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          resetError
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
        }`}>
          {resetError || resetMessage}
        </div>
      )}

      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Operatività</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Risultati per Categoria</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Qui entri in ogni categoria per aggiornare risultati, ritardi e stato delle partite senza perdere il contesto del torneo. Usa questa pagina per aprire velocemente la gestione operativa corretta.
          </p>
        </div>
        <div className="p-6">
          <AgeGroupsOperationsPanel tournament={tournament} />
        </div>
      </section>
    </div>
  )
}

function TournamentCategoriesScreen({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate()
  const [isFullXlsDl, setIsFullXlsDl] = useState(false)
  const [isFullPdfDl, setIsFullPdfDl] = useState(false)
  const [dlError, setDlError] = useState('')

  async function handleFullXls() {
    setIsFullXlsDl(true); setDlError('')
    try { await downloadAdminTournamentFullExcel(tournament.id) }
    catch (err: unknown) {
      const d = (err as { response?: { data?: unknown } })?.response?.data
      let msg: string | undefined
      if (d instanceof Blob) { try { msg = JSON.parse(await d.text())?.detail } catch { /* ignore */ } }
      else msg = (d as { detail?: string } | undefined)?.detail
      setDlError(msg ?? 'Errore download')
    } finally { setIsFullXlsDl(false) }
  }
  async function handleFullPdf() {
    setIsFullPdfDl(true); setDlError('')
    try { await downloadAdminTournamentFullPdf(tournament.id) }
    catch (err: unknown) {
      const d = (err as { response?: { data?: unknown } })?.response?.data
      let msg: string | undefined
      if (d instanceof Blob) { try { msg = JSON.parse(await d.text())?.detail } catch { /* ignore */ } }
      else msg = (d as { detail?: string } | undefined)?.detail
      setDlError(msg ?? 'Errore download')
    } finally { setIsFullPdfDl(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to="/admin/tornei" className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600">
              Tornei
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Categorie</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament.name}</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Aggiungi o rimuovi le categorie dell&apos;evento e accedi alla configurazione (formula, squadre, orari, programma) di ognuna.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleFullXls()}
              disabled={isFullXlsDl}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isFullXlsDl ? 'Download...' : 'Excel tutte le categorie'}
            </button>
            <button
              type="button"
              onClick={() => void handleFullPdf()}
              disabled={isFullPdfDl}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isFullPdfDl ? 'Download...' : 'PDF tutte le categorie'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/admin/tornei')}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Torna ai tornei
            </button>
          </div>
        </div>
        {dlError && <p className="mt-3 text-xs font-medium text-red-600">{dlError}</p>}
      </div>

      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Configurazione</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950">Categorie dell&apos;evento</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Aggiungi o rimuovi le categorie e configura formula, squadre, orari e programma per ognuna.
          </p>
        </div>
        <div className="p-6">
          <AgeGroupsUnifiedPanel tournament={tournament} />
        </div>
      </section>
    </div>
  )
}

function AgeGroupsOperationsPanel({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate()
  const { data: ageGroups, error: ageGroupsError } = useAdminTournamentAgeGroups(tournament.id)

  if (ageGroupsError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Errore nel caricamento delle categorie.
      </div>
    )
  }

  const activeGroups = (ageGroups ?? [])

  if (activeGroups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-8 text-center text-sm text-slate-500">
        Nessuna categoria configurata per questo evento.{' '}
        <button
          type="button"
          onClick={() => navigate(`/admin/tornei/${tournament.id}/categorie`)}
          className="font-semibold text-violet-600 hover:underline"
        >
          Vai a Categorie
        </button>{' '}
        per aggiungerne.
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {AGE_GROUP_OPTIONS.map((option) => {
        const group = activeGroups.find((item) => item.age_group === option.value)
        if (!group) return null
        return (
          <AgeGroupOperationsCard key={option.value} tournament={tournament} group={group} />
        )
      })}
    </div>
  )
}

function AgeGroupOperationsCard({ tournament, group }: { tournament: Tournament; group: AgeGroup }) {
  const navigate = useNavigate()
  const { data: program } = useAdminAgeGroupProgram(group.id)
  const completedMatches = countProgramMatches(program, (match) => match.status === 'COMPLETED')
  const totalMatches = countProgramMatches(program)
  const hasProgram = Boolean(program?.generated)

  return (
    <div className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-black text-slate-900">{group.display_name || group.age_group}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hasProgram ? (
              <StatusPill label={`${completedMatches}/${totalMatches} partite completate`} tone={completedMatches === totalMatches ? 'emerald' : 'fuchsia'} />
            ) : (
              <StatusPill label="Programma non generato" tone="slate" />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/admin/tornei/${tournament.id}/categorie/${group.id}/gestione`)}
          className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          <ClipboardList className="h-4 w-4" />
          Risultati
        </button>
      </div>
    </div>
  )
}

function TournamentFieldScheduleScreen({ tournament }: { tournament: Tournament }) {
  const [isCampoXlsDl, setIsCampoXlsDl] = useState(false)
  const [isCampoPdfDl, setIsCampoPdfDl] = useState(false)
  const [dlError, setDlError] = useState('')

  async function handleCampoXls() {
    setIsCampoXlsDl(true); setDlError('')
    try { await downloadAdminTournamentCampoCalendarExcel(tournament.id) }
    catch (err: unknown) {
      const d = (err as { response?: { data?: unknown } })?.response?.data
      let msg: string | undefined
      if (d instanceof Blob) { try { msg = JSON.parse(await d.text())?.detail } catch { /* ignore */ } }
      else msg = (d as { detail?: string } | undefined)?.detail
      setDlError(msg ?? 'Errore download')
    } finally { setIsCampoXlsDl(false) }
  }
  async function handleCampoPdf() {
    setIsCampoPdfDl(true); setDlError('')
    try { await downloadAdminTournamentCampoCalendarPdf(tournament.id) }
    catch (err: unknown) {
      const d = (err as { response?: { data?: unknown } })?.response?.data
      let msg: string | undefined
      if (d instanceof Blob) { try { msg = JSON.parse(await d.text())?.detail } catch { /* ignore */ } }
      else msg = (d as { detail?: string } | undefined)?.detail
      setDlError(msg ?? 'Errore download')
    } finally { setIsCampoPdfDl(false) }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <Link to={`/admin/tornei/${tournament.id}/gestione`} className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 transition-colors hover:text-slate-600">
              Gestione torneo
            </Link>
            <h1 className="mt-2 text-3xl font-black text-slate-950">Calendario impianti</h1>
            <p className="mt-1 text-sm text-slate-500">{tournament.name}</p>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Pagina dedicata ai campi del torneo: qui controlli il programma completo per impianto e campo, con eventuali sovrapposizioni evidenziate.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleCampoXls()}
              disabled={isCampoXlsDl}
              className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isCampoXlsDl ? 'Download...' : 'Excel calendario impianti'}
            </button>
            <button
              type="button"
              onClick={() => void handleCampoPdf()}
              disabled={isCampoPdfDl}
              className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {isCampoPdfDl ? 'Download...' : 'PDF calendario impianti'}
            </button>
            <Link
              to={`/admin/tornei/${tournament.id}/gestione`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Torna alla gestione
            </Link>
          </div>
        </div>
        {dlError && <p className="mt-3 text-xs font-medium text-red-600">{dlError}</p>}
      </div>

      <TournamentFieldSchedulePanel tournament={tournament} />
    </div>
  )
}

function GroupSeedingControl({
  sourceEntries,
  targetNumGroups,
  targetSlots,
  onChange,
}: {
  sourceEntries: string[]
  targetNumGroups: number
  targetSlots: string[]
  onChange: (slots: string[]) => void
}) {
  const totalTeams = sourceEntries.length
  const numGroups = Math.max(targetNumGroups, 1)

  function computeSerpentina(): string[] {
    const slots: string[] = []
    let groupIndex = 0
    let direction = 1
    const teamsPerGroup = Array.from({ length: numGroups }, () => 0)
    for (let i = 0; i < totalTeams; i++) {
      const groupLetter = String.fromCharCode(65 + groupIndex)
      teamsPerGroup[groupIndex] += 1
      slots.push(`${groupLetter}${teamsPerGroup[groupIndex]}`)
      if (direction === 1 && groupIndex === numGroups - 1) {
        direction = -1
      } else if (direction === -1 && groupIndex === 0) {
        direction = 1
      } else {
        groupIndex += direction
      }
    }
    return slots
  }

  function computeBlocchi(): string[] {
    const slots: string[] = []
    const teamsPerGroup = Math.ceil(totalTeams / numGroups)
    for (let i = 0; i < totalTeams; i++) {
      const groupIndex = Math.min(Math.floor(i / teamsPerGroup), numGroups - 1)
      const posInGroup = (i % teamsPerGroup) + 1
      const groupLetter = String.fromCharCode(65 + groupIndex)
      slots.push(`${groupLetter}${posInGroup}`)
    }
    return slots
  }

  /**
   * "Incrocio gironi" (cross-group mix) for exactly 2 source groups.
   *
   * Pattern: the winner of each group stays in their own numbered group for
   * the next phase; 2nd/3rd place teams cross over to the opposite group.
   *
   * Example — Phase 1 has Group A and Group B, 3 teams each.
   * Phase 2 Group A = {1° A, 2° B, 3° B}
   * Phase 2 Group B = {1° B, 2° A, 3° A}
   *
   * This works because entries arrive ordered: A1, A2, A3, B1, B2, B3.
   * Mapping: rank 1 → same target group; rank 2+ → opposite target group.
   */
  function computeIncrocio(): string[] {
    if (numGroups !== 2) return []
    const teamsPerGroup = Math.ceil(totalTeams / numGroups)
    const slots: string[] = []
    for (let i = 0; i < totalTeams; i++) {
      const srcGroupIdx = Math.floor(i / teamsPerGroup)
      const rankInGroup = (i % teamsPerGroup) + 1
      // Rank 1 (winner) stays in same-lettered target group; rest cross over
      const tgtGroupIdx = rankInGroup === 1 ? srcGroupIdx : numGroups - 1 - srcGroupIdx
      slots.push(`${String.fromCharCode(65 + tgtGroupIdx)}${rankInGroup}`)
    }
    return slots
  }

  const currentSlots = targetSlots.length === totalTeams ? targetSlots : []
  const isAuto       = currentSlots.length === 0
  const isSerpentina = !isAuto && currentSlots.join(',') === computeSerpentina().join(',')
  const isBlocchi    = !isAuto && currentSlots.join(',') === computeBlocchi().join(',')
  const isIncrocio   = numGroups === 2 && !isAuto && currentSlots.join(',') === computeIncrocio().join(',')
  const isCustom     = !isAuto && !isSerpentina && !isBlocchi && !isIncrocio

  const groupLabels = Array.from({ length: numGroups }, (_, i) => String.fromCharCode(65 + i))

  return (
    <div className="mt-3 rounded-[1.1rem] border border-indigo-200 bg-indigo-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">Distribuzione nei gironi di destinazione</p>
      <p className="mt-1 text-xs text-indigo-700">
        Scegli come distribuire le {totalTeams} squadre nei {numGroups} gironi della fase successiva.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${isAuto ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100'}`}
        >
          Auto
        </button>
        {numGroups > 1 && (
          <button
            type="button"
            onClick={() => onChange(computeSerpentina())}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${isSerpentina ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100'}`}
          >
            Serpentina
          </button>
        )}
        {numGroups > 1 && (
          <button
            type="button"
            onClick={() => onChange(computeBlocchi())}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${isBlocchi ? 'bg-indigo-700 text-white' : 'border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100'}`}
          >
            Per blocco
          </button>
        )}
        {numGroups === 2 && (
          <button
            type="button"
            onClick={() => onChange(computeIncrocio())}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${isIncrocio ? 'bg-violet-700 text-white' : 'border border-violet-200 bg-white text-violet-700 hover:bg-violet-100'}`}
          >
            Incrocio gironi
          </button>
        )}
      </div>

      {isIncrocio && (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800">
          <p className="font-bold">Incrocio gironi attivo</p>
          <p className="mt-1">
            I vincitori restano nel girone con la propria lettera; 2° e 3° posto incrociano:
          </p>
          <ul className="mt-1 space-y-0.5 pl-3">
            <li>Girone A (fase 2): 1° A · 2° B · 3° B</li>
            <li>Girone B (fase 2): 1° B · 2° A · 3° A</li>
          </ul>
        </div>
      )}

      {!isAuto && (
        <div className="mt-3 space-y-1.5">
          {sourceEntries.map((entry, i) => {
            const slot = currentSlots[i] ?? ''
            return (
              <div key={`${entry}-${i}`} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-semibold text-slate-700">{entry}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                <select
                  value={slot}
                  onChange={(e) => {
                    const next = [...currentSlots]
                    next[i] = e.target.value
                    onChange(next)
                  }}
                  className="flex-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-900"
                >
                  <option value="">-- scegli --</option>
                  {groupLabels.flatMap((letter) =>
                    Array.from({ length: Math.ceil(totalTeams / numGroups) + 1 }, (_, pos) => {
                      const slotName = `${letter}${pos + 1}`
                      return <option key={slotName} value={slotName}>{`Girone ${letter} · posto ${pos + 1}`}</option>
                    })
                  )}
                </select>
              </div>
            )
          })}
        </div>
      )}
      {isAuto && (
        <p className="mt-2 text-xs text-indigo-600">
          Il sistema distribuirà automaticamente le squadre in ordine progressivo.
        </p>
      )}
      {isCustom && (
        <p className="mt-2 text-xs text-indigo-500">Distribuzione personalizzata.</p>
      )}
    </div>
  )
}

function TournamentFormDrawer({
  tournament,
  onClose,
  pageMode = false,
}: {
  tournament: Tournament | null
  onClose: () => void
  pageMode?: boolean
}) {
  const { data: orgs } = useAdminOrganizations()
  const { data: currentAgeGroups } = useAdminTournamentAgeGroups(tournament?.id ?? '')
  const createOrg = useCreateOrganization()
  const createTournament = useCreateTournament()
  const updateTournament = useUpdateTournament()
  const createAgeGroup = useCreateAgeGroup()
  const updateAgeGroupStructure = useUpdateAgeGroupStructure()
  const createTournamentTemplate = useCreateTournamentTemplate()

  const isEdit = !!tournament

  const singleDay = tournament
    ? (!tournament.end_date || tournament.end_date === tournament.start_date)
    : false

  const [form, setForm] = useState({
    name: tournament?.name ?? '',
    event_type: tournament?.event_type ?? 'TOURNAMENT' as 'TOURNAMENT' | 'GATHERING',
    year: tournament?.year ?? new Date().getFullYear(),
    edition: tournament?.edition ?? '',
    start_date: tournament?.start_date ?? '',
    end_date: tournament?.end_date ?? '',
    location: tournament?.location ?? '',
    description: tournament?.description ?? '',
    is_published: tournament?.is_published ?? false,
    organization_id: tournament?.organization_id ?? '',
    single_day: singleDay,
    logo_url: tournament?.logo_url ?? '',
    venue_map_url: tournament?.venue_map_url ?? '',
    theme_primary_color: tournament?.theme_primary_color ?? '#243748',
    theme_accent_color: tournament?.theme_accent_color ?? '#22c55e',
    sponsor_images: tournament?.sponsor_images ?? [],
  })
  const { data: allStructureTemplates } = useStructureTemplates(undefined, form.organization_id || tournament?.organization_id || undefined)

  const [newOrgName, setNewOrgName] = useState('')
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [error, setError] = useState('')
  const [tournamentTemplateName, setTournamentTemplateName] = useState('')
  const [tournamentTemplateDescription, setTournamentTemplateDescription] = useState('')
  const [selectedTournamentTemplateId, setSelectedTournamentTemplateId] = useState('')
  const [selectedTournamentTemplateName, setSelectedTournamentTemplateName] = useState('')
  const [categoryTemplateSelections, setCategoryTemplateSelections] = useState<Partial<Record<'U6' | 'U8' | 'U10' | 'U12', string>>>({})
  const [pendingTemplateAgeGroups, setPendingTemplateAgeGroups] = useState<Array<{
    age_group: 'U6' | 'U8' | 'U10' | 'U12'
    display_name?: string | null
    structure_template_name?: string | null
    structure_config?: Record<string, unknown> | null
    scoring_rules?: Record<string, unknown>
  }>>([])
  const { data: tournamentTemplates } = useTournamentTemplates(form.organization_id || tournament?.organization_id || undefined)

  const themePalettes = [
    { id: 'livorno-default', name: 'Livorno Default', primary: '#243748', accent: '#22c55e' },
    { id: 'mare-sole', name: 'Mare e sole', primary: '#0f766e', accent: '#f59e0b' },
    { id: 'notte-rossa', name: 'Notte rossa', primary: '#0f172a', accent: '#dc2626' },
    { id: 'stadio-sky', name: 'Stadio sky', primary: '#1d4ed8', accent: '#16a34a' },
    { id: 'grinta-orange', name: 'Grinta orange', primary: '#7c2d12', accent: '#fb923c' },
    { id: 'club-vintage', name: 'Club vintage', primary: '#4c1d95', accent: '#facc15' },
  ] as const

  function set(field: string, value: string | number | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return
    const slug = slugifyTournamentPart(newOrgName)
    const org = await createOrg.mutateAsync({ name: newOrgName.trim(), slug })
    set('organization_id', org.id)
    setNewOrgName('')
    setShowNewOrg(false)
  }

  function upsertPendingAgeGroup(nextGroup: {
    age_group: 'U6' | 'U8' | 'U10' | 'U12'
    display_name?: string | null
    structure_template_name?: string | null
    structure_config?: Record<string, unknown> | null
    scoring_rules?: Record<string, unknown>
  }) {
    setPendingTemplateAgeGroups((current) => {
      const remaining = current.filter((item) => item.age_group !== nextGroup.age_group)
      return [...remaining, nextGroup].sort((left, right) => left.age_group.localeCompare(right.age_group))
    })
  }

  function removePendingAgeGroup(ageGroup: 'U6' | 'U8' | 'U10' | 'U12') {
    setPendingTemplateAgeGroups((current) => current.filter((item) => item.age_group !== ageGroup))
  }

  function applyTournamentTemplate(template: TournamentTemplate) {
    const config = template.config as {
      tournament?: Partial<typeof form> & { organization_id?: string }
      age_groups?: Array<{
        age_group: string
        display_name?: string | null
        structure_template_name?: string | null
        structure_config?: Record<string, unknown> | null
        scoring_rules?: Record<string, unknown>
      }>
    }
    const tournamentConfig = config.tournament ?? {}
    const normalizedAgeGroups = (config.age_groups ?? []).filter((group): group is {
      age_group: 'U6' | 'U8' | 'U10' | 'U12'
      display_name?: string | null
      structure_template_name?: string | null
      structure_config?: Record<string, unknown> | null
      scoring_rules?: Record<string, unknown>
    } => AGE_GROUP_OPTIONS.some((option) => option.value === group.age_group))
    setSelectedTournamentTemplateId(template.id)
    setSelectedTournamentTemplateName(template.name)
    setCategoryTemplateSelections({})
    setPendingTemplateAgeGroups(normalizedAgeGroups)
    setForm((current) => ({
      ...current,
      organization_id: tournamentConfig.organization_id ?? current.organization_id,
      name: typeof tournamentConfig.name === 'string' ? tournamentConfig.name : current.name,
      event_type: tournamentConfig.event_type === 'GATHERING' ? 'GATHERING' : (tournamentConfig.event_type === 'TOURNAMENT' ? 'TOURNAMENT' : current.event_type),
      year: typeof tournamentConfig.year === 'number' ? tournamentConfig.year : current.year,
      edition: typeof tournamentConfig.edition === 'string' ? tournamentConfig.edition : current.edition,
      start_date: typeof tournamentConfig.start_date === 'string' ? tournamentConfig.start_date : current.start_date,
      end_date: typeof tournamentConfig.end_date === 'string' ? tournamentConfig.end_date : current.end_date,
      location: typeof tournamentConfig.location === 'string' ? tournamentConfig.location : current.location,
      description: typeof tournamentConfig.description === 'string' ? tournamentConfig.description : current.description,
      logo_url: typeof tournamentConfig.logo_url === 'string' ? tournamentConfig.logo_url : current.logo_url,
      venue_map_url: typeof tournamentConfig.venue_map_url === 'string' ? tournamentConfig.venue_map_url : current.venue_map_url,
      theme_primary_color: typeof tournamentConfig.theme_primary_color === 'string' ? tournamentConfig.theme_primary_color : current.theme_primary_color,
      theme_accent_color: typeof tournamentConfig.theme_accent_color === 'string' ? tournamentConfig.theme_accent_color : current.theme_accent_color,
      sponsor_images: Array.isArray(tournamentConfig.sponsor_images) ? tournamentConfig.sponsor_images as string[] : current.sponsor_images,
      is_published: typeof tournamentConfig.is_published === 'boolean' ? tournamentConfig.is_published : current.is_published,
    }))
  }

  async function handleSaveTournamentTemplate() {
    if (!tournamentTemplateName.trim()) return
    const ageGroupsForTemplate = (currentAgeGroups ?? []).map((ageGroup) => ({
      age_group: ageGroup.age_group,
      display_name: ageGroup.display_name,
      structure_template_name: ageGroup.structure_template_name,
      structure_config: ageGroup.structure_config,
      scoring_rules: ageGroup.scoring_rules,
    }))
    await createTournamentTemplate.mutateAsync({
      name: tournamentTemplateName.trim(),
      description: tournamentTemplateDescription.trim() || undefined,
      organization_id: form.organization_id || tournament?.organization_id || null,
      config: {
        tournament: {
          organization_id: form.organization_id || tournament?.organization_id || null,
          name: form.name,
          year: Number(form.year),
          edition: form.edition || null,
          start_date: form.start_date || null,
          end_date: form.single_day ? (form.start_date || null) : (form.end_date || null),
          location: form.location || null,
          description: form.description || null,
          logo_url: form.logo_url || null,
          venue_map_url: form.venue_map_url || null,
          theme_primary_color: form.theme_primary_color || null,
          theme_accent_color: form.theme_accent_color || null,
          sponsor_images: form.sponsor_images.filter((item) => item.trim().length > 0),
          is_published: form.is_published,
        },
        age_groups: ageGroupsForTemplate,
      },
    })
    setTournamentTemplateName('')
    setTournamentTemplateDescription('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.organization_id) { setError('Seleziona o crea un\'società'); return }
    const selectedOrganization = orgs?.find((org) => org.id === form.organization_id)
    const computedSlug = buildTournamentSlugPreview({
      organizationSlug: selectedOrganization?.slug,
      name: form.name,
      eventType: form.event_type,
      year: Number(form.year),
      startDate: form.start_date || undefined,
    })

    const payload = {
      ...form,
      year: Number(form.year),
      slug: computedSlug,
      edition: form.edition || undefined,
      start_date: form.start_date || undefined,
      end_date: form.single_day ? (form.start_date || undefined) : (form.end_date || undefined),
      location: form.location || undefined,
      description: form.description || undefined,
      logo_url: form.logo_url || undefined,
      venue_map_url: form.venue_map_url || undefined,
      theme_primary_color: form.theme_primary_color || undefined,
      theme_accent_color: form.theme_accent_color || undefined,
      sponsor_images: form.sponsor_images.filter((item) => item.trim().length > 0),
    }

    try {
      if (isEdit) {
        await updateTournament.mutateAsync({ id: tournament!.id, data: payload })
      } else {
        const createdTournament = await createTournament.mutateAsync(payload)
        if (pendingTemplateAgeGroups.length > 0) {
          for (const ageGroupTemplate of pendingTemplateAgeGroups) {
            const createdAgeGroup = await createAgeGroup.mutateAsync({
              tournament_id: createdTournament.id,
              age_group: ageGroupTemplate.age_group,
              display_name: ageGroupTemplate.display_name ?? undefined,
              scoring_rules: normalizeScoringRules(ageGroupTemplate.scoring_rules),
            })
            if (ageGroupTemplate.structure_config) {
              await updateAgeGroupStructure.mutateAsync({
                id: createdAgeGroup.id,
                tournamentId: createdTournament.id,
                structure_template_name: ageGroupTemplate.structure_template_name ?? null,
                structure_config: ageGroupTemplate.structure_config,
              })
            }
          }
        }
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il salvataggio')
    }
  }

  const isPending = createTournament.isPending || updateTournament.isPending

  const formContent = (
    <>
      <form onSubmit={handleSubmit} className={pageMode ? 'space-y-6 p-6' : 'flex-1 overflow-y-auto px-6 py-5 space-y-5'}>
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Organization */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Società *</label>
            {orgs && orgs.length > 0 ? (
              <select
                value={form.organization_id}
                onChange={e => set('organization_id', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
              >
                <option value="">— seleziona —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : null}
            {!showNewOrg ? (
              <button type="button" onClick={() => setShowNewOrg(true)}
                className="mt-1.5 text-xs text-rugby-green font-medium hover:underline">
                + Crea nuova società
              </button>
            ) : (
              <div className="mt-2 flex gap-2">
                <input
                  value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)}
                  placeholder="Nome società"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
                />
                <button type="button" onClick={handleCreateOrg}
                  className="bg-rugby-green text-white px-3 py-2 rounded-lg text-sm font-medium">
                  Crea
                </button>
                <button type="button" onClick={() => setShowNewOrg(false)}
                  className="px-2 py-2 rounded-lg text-gray-400 hover:bg-gray-100">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <Field label="Nome evento *" required>
            <input value={form.name} onChange={e => set('name', e.target.value)} className={input} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo evento *" required>
              <select value={form.event_type} onChange={e => set('event_type', e.target.value)} className={input}>
                <option value="TOURNAMENT">Torneo</option>
                <option value="GATHERING">Raggruppamento</option>
              </select>
            </Field>
            <Field label="Anno *" required>
              <input type="number" value={form.year} onChange={e => set('year', e.target.value)}
                min={2000} max={2099} className={input} required />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Edizione">
              <input value={form.edition} onChange={e => set('edition', e.target.value)}
                placeholder="es. 1ª edizione" className={input} />
            </Field>
            <Field label={form.event_type === 'GATHERING' ? 'Data per URL' : 'URL pubblico'} hint={form.event_type === 'GATHERING' ? 'Usa la data del raggruppamento' : 'Usa l’anno dell’evento'}>
              <div className="rounded-lg border border-gray-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                /tornei/{buildTournamentSlugPreview({
                  organizationSlug: orgs?.find((org) => org.id === form.organization_id)?.slug,
                  name: form.name,
                  eventType: form.event_type,
                  year: Number(form.year),
                  startDate: form.start_date || undefined,
                })}
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.single_day}
                onChange={e => set('single_day', e.target.checked)}
                className="w-4 h-4 accent-rugby-green"
              />
              <span className="text-sm font-medium text-gray-700">Giorno unico</span>
            </label>
            <div className={`grid gap-3 ${form.single_day ? '' : 'grid-cols-2'}`}>
              <Field label={form.single_day ? 'Data' : 'Data inizio'}>
                <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} className={input} />
              </Field>
              {!form.single_day && (
                <Field label="Data fine">
                  <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} className={input} />
                </Field>
              )}
            </div>
          </div>

          <Field label="Sede / Località">
            <input value={form.location} onChange={e => set('location', e.target.value)}
              placeholder="es. Campo Sportivo Livorno" className={input} />
          </Field>

          <Field label="Descrizione">
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={3} className={input + ' resize-none'} />
          </Field>

          <ImageUpload
            label="Logo torneo"
            value={form.logo_url}
            onChange={v => set('logo_url', v)}
            folder="tournaments"
            maxDim={400}
            placeholder="Carica logo"
          />

          <ImageUpload
            label="Mappa / Piantina sede"
            value={form.venue_map_url}
            onChange={v => set('venue_map_url', v)}
            folder="maps"
            maxDim={2000}
            preview="wide"
            placeholder="Carica piantina"
          />

          {!isEdit && (
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Template evento</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Crea un evento partendo da un template completo</p>
              </div>
              <div className="space-y-3">
                <select
                  value={selectedTournamentTemplateId}
                  onChange={(e) => {
                    const template = tournamentTemplates?.find((item) => item.id === e.target.value)
                    if (template) applyTournamentTemplate(template)
                    else {
                      setSelectedTournamentTemplateId('')
                      setSelectedTournamentTemplateName('')
                      setPendingTemplateAgeGroups([])
                    }
                  }}
                  className={input}
                >
                  <option value="">Nessun template evento</option>
                  {(tournamentTemplates ?? []).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                {selectedTournamentTemplateName && (
                  <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    Template applicato: <span className="font-semibold">{selectedTournamentTemplateName}</span>
                    {pendingTemplateAgeGroups.length > 0 ? ` · ${pendingTemplateAgeGroups.length} categorie incluse` : ''}
                  </div>
                )}
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Composizione categorie</p>
                  <p className="mt-1 text-sm text-slate-600">
                    In alternativa al template completo, puoi comporre l&apos;evento scegliendo una o più categorie-template.
                  </p>
                  <div className="mt-4 space-y-3">
                    {AGE_GROUP_OPTIONS.map((option) => {
                      const availableTemplates = (allStructureTemplates ?? []).filter((template) => template.age_group === option.value)
                      const isSelected = pendingTemplateAgeGroups.some((group) => group.age_group === option.value)
                      return (
                        <div key={option.value} className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                              <p className="text-xs text-slate-500">{isSelected ? 'Categoria inclusa nel nuovo torneo' : 'Categoria non ancora inclusa'}</p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    upsertPendingAgeGroup({
                                      age_group: option.value,
                                      display_name: option.label,
                                    })
                                  } else {
                                    removePendingAgeGroup(option.value)
                                    setCategoryTemplateSelections((current) => {
                                      const next = { ...current }
                                      delete next[option.value]
                                      return next
                                    })
                                  }
                                }}
                                className="h-4 w-4 accent-rugby-green"
                              />
                              Includi
                            </label>
                          </div>
                          <div className="mt-3">
                            <select
                              value={categoryTemplateSelections[option.value] ?? ''}
                              onChange={(e) => {
                                const templateId = e.target.value
                                setCategoryTemplateSelections((current) => ({ ...current, [option.value]: templateId }))
                                const template = availableTemplates.find((item) => item.id === templateId)
                                if (template) {
                                  upsertPendingAgeGroup({
                                    age_group: option.value,
                                    display_name: option.label,
                                    structure_template_name: template.name,
                                    structure_config: template.config,
                                  })
                                } else if (isSelected) {
                                  upsertPendingAgeGroup({
                                    age_group: option.value,
                                    display_name: option.label,
                                  })
                                }
                              }}
                              className={input}
                              disabled={!isSelected}
                            >
                              <option value="">Categoria vuota / configurazione manuale</option>
                              {availableTemplates.map((template) => (
                                <option key={template.id} value={template.id}>{template.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Tema torneo</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Hero pubblico, colori e atmosfera visiva dell&apos;evento</p>
            </div>
            <div className="mb-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Tavolozza rapida</p>
              <div className="grid grid-cols-2 gap-2">
                {themePalettes.map((palette) => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => setForm((current) => ({
                      ...current,
                      theme_primary_color: palette.primary,
                      theme_accent_color: palette.accent,
                    }))}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition-transform hover:-translate-y-0.5"
                  >
                    <div
                      className="h-16"
                      style={{ background: `linear-gradient(135deg, ${palette.primary} 0%, ${palette.primary}dd 45%, ${palette.accent} 100%)` }}
                    />
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{palette.name}</p>
                        <p className="text-[11px] text-slate-500">{palette.primary} · {palette.accent}</p>
                      </div>
                      <Sparkles className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Colore principale">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="color"
                    value={form.theme_primary_color}
                    onChange={e => set('theme_primary_color', e.target.value)}
                    className="h-8 w-10 rounded border-0 bg-transparent p-0"
                  />
                  <input
                    value={form.theme_primary_color}
                    onChange={e => set('theme_primary_color', e.target.value)}
                    className="min-w-0 flex-1 text-sm text-slate-700 focus:outline-none"
                  />
                </div>
              </Field>
              <Field label="Colore accento">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <input
                    type="color"
                    value={form.theme_accent_color}
                    onChange={e => set('theme_accent_color', e.target.value)}
                    className="h-8 w-10 rounded border-0 bg-transparent p-0"
                  />
                  <input
                    value={form.theme_accent_color}
                    onChange={e => set('theme_accent_color', e.target.value)}
                    className="min-w-0 flex-1 text-sm text-slate-700 focus:outline-none"
                  />
                </div>
              </Field>
            </div>
            <div className="mt-4 overflow-hidden rounded-[1.2rem] border border-slate-200 bg-white">
              <div
                className="px-4 py-4"
                style={{ background: `linear-gradient(135deg, ${form.theme_primary_color}18 0%, #ffffff 45%, ${form.theme_accent_color}16 100%)` }}
              >
                <div className="flex items-center gap-3">
                  {form.logo_url ? (
                    <img src={form.logo_url} alt={form.name || 'Torneo'} className="h-12 w-12 rounded-2xl bg-white object-contain p-1 shadow-sm" />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-sm font-black text-slate-700 shadow-sm">
                      {(form.name || 'T').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-950">{form.name || 'Anteprima evento'}</p>
                    <p className="text-xs text-slate-600">
                      {form.start_date ? `Dal ${form.start_date}` : 'Data da definire'}
                      {form.location ? ` · ${form.location}` : ' · Sede da definire'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Categorie</span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Programma</span>
                  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Sponsor</span>
                </div>
              </div>
              <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
                <div className="h-10 w-10 rounded-2xl" style={{ backgroundColor: form.theme_primary_color }} />
                <div className="h-10 w-10 rounded-2xl" style={{ backgroundColor: form.theme_accent_color }} />
                <div className="text-xs text-slate-500">Colori applicati a testata, pulsanti e dettagli categoria</div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Sponsor</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Loghi sponsor dell&apos;evento</p>
              </div>
              <button
                type="button"
                onClick={() => setForm(current => ({ ...current, sponsor_images: [...current.sponsor_images, ''] }))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Aggiungi sponsor
              </button>
            </div>
            <div className="space-y-4">
              {form.sponsor_images.map((image, index) => (
                <div key={`sponsor-${index}`} className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">Sponsor {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => setForm(current => ({
                        ...current,
                        sponsor_images: current.sponsor_images.filter((_, currentIndex) => currentIndex !== index),
                      }))}
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    <ImageUpload
                      value={image}
                      onChange={(value) => setForm(current => ({
                        ...current,
                        sponsor_images: current.sponsor_images.map((entry, currentIndex) => currentIndex === index ? value : entry),
                      }))}
                      folder="sponsors"
                      maxDim={600}
                      placeholder="Carica logo sponsor"
                    />
                    <input
                      value={image}
                      onChange={e => setForm(current => ({
                        ...current,
                        sponsor_images: current.sponsor_images.map((entry, currentIndex) => currentIndex === index ? e.target.value : entry),
                      }))}
                      placeholder="Oppure incolla URL logo sponsor"
                      className={input}
                    />
                  </div>
                </div>
              ))}
              {form.sponsor_images.length === 0 && (
                <div className="rounded-[1.2rem] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                  Nessun sponsor configurato. Puoi aggiungere uno o più loghi da mostrare nella pagina evento.
                </div>
              )}
              {form.sponsor_images.length > 0 && (
                <div className="rounded-[1.2rem] border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Anteprima pubblica</p>
                  <div className="mt-3 overflow-hidden rounded-[1.2rem] border border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] py-4">
                    <div className="px-3 text-center">
                      <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: form.theme_accent_color || '#15803d' }}>Sponsor</p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">Partner dell&apos;evento</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3 px-4">
                    {form.sponsor_images.filter((image) => image.trim().length > 0).map((image, index) => (
                      <div key={`sponsor-preview-${index}`} className="flex h-20 w-40 items-center justify-center rounded-2xl border border-slate-100 bg-slate-50 px-3">
                        <img src={image} alt={`Sponsor ${index + 1}`} className="h-14 w-full object-contain scale-[1.35]" />
                      </div>
                    ))}
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    I loghi compaiono tra hero e categorie nella pagina torneo, e anche nella pagina della singola categoria.
                  </p>
                </div>
              )}
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.is_published}
              onChange={e => set('is_published', e.target.checked)}
              className="w-4 h-4 accent-rugby-green" />
            <span className="text-sm font-medium text-gray-700">Pubblica (visibile al pubblico)</span>
          </label>

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Salva come template evento</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Salva l&apos;evento completo e le categorie già configurate</p>
            </div>
            <div className="space-y-3">
              <input
                value={tournamentTemplateName}
                onChange={e => setTournamentTemplateName(e.target.value)}
                placeholder="Es. Torneo minirugby completo"
                className={input}
              />
              <input
                value={tournamentTemplateDescription}
                onChange={e => setTournamentTemplateDescription(e.target.value)}
                placeholder="Descrizione breve del template"
                className={input}
              />
              <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              {currentAgeGroups && currentAgeGroups.length > 0
                  ? `Categorie incluse se salvi ora: ${currentAgeGroups.length}. Le squadre continueranno a definirsi dentro le singole categorie dell&apos;evento.`
                  : 'Se l’evento non ha ancora categorie, il template salverà per ora solo branding e dati base dell’evento.'}
              </div>
              <button
                type="button"
                onClick={() => void handleSaveTournamentTemplate()}
                disabled={!tournamentTemplateName.trim() || createTournamentTemplate.isPending}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {createTournamentTemplate.isPending ? 'Salvataggio...' : 'Salva template evento'}
              </button>
            </div>
          </div>
        </form>

        <div className={`${pageMode ? 'flex gap-3 border-t border-slate-200 px-6 py-5' : 'px-6 py-4 border-t border-gray-100 flex gap-3'}`}>
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Annulla
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-rugby-green text-white text-sm font-semibold hover:bg-rugby-green-dark transition-colors disabled:opacity-50">
            {isPending ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea evento'}
          </button>
        </div>
    </>
  )

  if (pageMode) {
    return (
      <div className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                {isEdit ? 'Aggiorna evento' : 'Crea evento'}
              </p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">
                {isEdit ? tournament?.name : 'Dati base, branding e template'}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                Configura l&apos;evento in una pagina completa, senza pannelli laterali: dati base, tema, sponsor e template.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Torna ai tornei
            </button>
          </div>
        </div>
        {formContent}
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifica evento' : 'Nuovo evento'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>
        {formContent}
      </div>
    </>
  )
}

const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent'

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
        {hint && <span className="font-normal text-gray-400 ml-1 text-xs">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

// ─── Fields management ────────────────────────────────────────────────────────

const AGE_GROUP_OPTIONS: Array<{
  value: 'U6' | 'U8' | 'U10' | 'U12'
  label: string
  subtitle: string
  className: string
}> = [
  { value: 'U6', label: 'Under 6', subtitle: 'Primi tornei', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'U8', label: 'Under 8', subtitle: 'Minirugby base', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'U10', label: 'Under 10', subtitle: 'Competizione intermedia', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'U12', label: 'Under 12', subtitle: 'Categoria avanzata', className: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
]

type StructurePhase = {
  id: string
  name: string
  phase_type: 'GROUP_STAGE' | 'KNOCKOUT'
  phase_date: string
  start_time: string
  placement_start_rank: number | null
  group_block_size: number | null
  round_trip_mode: 'single' | 'double'
  stagger_groups: boolean
  max_concurrent_matches: number | null
  num_halves: number | null
  half_duration_minutes: number | null
  knockout_progression: 'full_bracket' | 'single_round'
  num_groups: number | null
  group_sizes: string
  group_custom_names: string[]
  qualifiers_per_group: number | null
  best_extra_teams: number | null
  next_phase_type: '' | 'GROUP_STAGE' | 'KNOCKOUT'
  advancement_routes: AdvancementRoute[]
  bracket_mode: 'standard' | 'group_blocks'
  group_field_assignments: Record<string, PlayingFieldConfig[]>
  knockout_field_assignments: PlayingFieldConfig[]
  referee_group_assignments: Record<string, string[]>
  notes: string
}

type AdvancementRoute = {
  id: string
  target_phase_id: string
  source_mode: 'group_rank' | 'best_extra' | 'knockout_winner' | 'knockout_loser'
  source_groups: string[]
  rank_from: number | null
  rank_to: number | null
  extra_count: number | null
  target_slots: string[]
}

type PlayingFieldConfig = {
  id: string
  field_name: string
  category_label?: string
  field_number: number | null
}

type ScheduleConfig = {
  start_time: string
  match_duration_minutes: number | null
  interval_minutes: number | null
  hide_future_phases_until_complete: boolean
  playing_fields: PlayingFieldConfig[]
}

type CategoryWizardStep = 'squadre' | 'impostazioni' | 'fasi' | 'partite'

type StructureConfig = {
  expected_teams: number | null
  schedule: ScheduleConfig
  notes: string
  phases: StructurePhase[]
}

type RankingCriterionKey =
  | 'head_to_head'
  | 'try_diff'
  | 'tries_for'
  | 'distance_from_tournament'

type RankingCriterionOption = {
  key: RankingCriterionKey
  label: string
  description: string
}

const DEFAULT_SCORING_RULES: AgeGroupScoringRules = {
  win_points: 3,
  draw_points: 1,
  loss_points: 0,
  try_bonus: false,
  bonus_threshold: 4,
  ranking_criteria: ['points', 'head_to_head', 'try_diff', 'tries_for', 'distance_from_tournament'],
}

const RANKING_CRITERIA_OPTIONS: RankingCriterionOption[] = [
  {
    key: 'head_to_head',
    label: 'Vittoria scontro diretto',
    description: 'Guarda prima i risultati tra le sole squadre pari punti.',
  },
  {
    key: 'try_diff',
    label: 'Maggiore differenza mete fatte e mete subite',
    description: 'Premia chi ha la migliore differenza mete.',
  },
  {
    key: 'tries_for',
    label: 'Maggior numero di mete fatte',
    description: 'Premia l’attacco con più mete segnate.',
  },
  {
    key: 'distance_from_tournament',
    label: 'La squadra più distante dalla sede del Torneo',
    description: 'Usa la città squadra contro la sede evento per stimare i km.',
  },
]

const BUILTIN_TEMPLATES: Array<{
  name: string
  description: string
  age_group?: string
  config: StructureConfig
}> = [
  {
    name: 'Solo girone unico',
    description: 'Una sola fase a girone per tornei piccoli.',
    config: {
      expected_teams: null,
      schedule: {
        start_time: '09:30',
        match_duration_minutes: 12,
        interval_minutes: 8,
        hide_future_phases_until_complete: false,
        playing_fields: [],
      },
      notes: '',
      phases: [
        {
          id: 'phase-1',
          name: 'Girone unico',
          phase_type: 'GROUP_STAGE',
          phase_date: '',
          start_time: '',
          placement_start_rank: null,
          group_block_size: null,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: 1,
          group_sizes: '',
          group_custom_names: [],
          qualifiers_per_group: null,
          best_extra_teams: null,
          next_phase_type: '',
          advancement_routes: [],
          bracket_mode: 'standard',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: '',
        },
      ],
    },
  },
  {
    name: 'Gironi + finali',
    description: 'Fase a gironi e poi tabellone finale.',
    config: {
      expected_teams: null,
      schedule: {
        start_time: '09:30',
        match_duration_minutes: 12,
        interval_minutes: 8,
        hide_future_phases_until_complete: false,
        playing_fields: [],
      },
      notes: '',
      phases: [
        {
          id: 'phase-1',
          name: 'Fase a gironi',
          phase_type: 'GROUP_STAGE',
          phase_date: '',
          start_time: '',
          placement_start_rank: null,
          group_block_size: null,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: 2,
          group_sizes: '4,4',
          group_custom_names: [],
          qualifiers_per_group: 2,
          best_extra_teams: 0,
          next_phase_type: 'KNOCKOUT',
          advancement_routes: [],
          bracket_mode: 'standard',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: '',
        },
        {
          id: 'phase-2',
          name: 'Finali',
          phase_type: 'KNOCKOUT',
          phase_date: '',
          start_time: '',
          placement_start_rank: 1,
          group_block_size: null,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: null,
          group_sizes: '',
          group_custom_names: [],
          qualifiers_per_group: null,
          best_extra_teams: null,
          next_phase_type: '',
          advancement_routes: [],
          bracket_mode: 'standard',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: 'Semifinali e finali',
        },
      ],
    },
  },
  {
    name: 'Gironi + piazzamenti mini rugby',
    description: 'Prime per il titolo, seconde per il piazzamento, e cosi via.',
    config: {
      expected_teams: null,
      schedule: {
        start_time: '09:30',
        match_duration_minutes: 12,
        interval_minutes: 8,
        hide_future_phases_until_complete: false,
        playing_fields: [],
      },
      notes: '',
      phases: [
        {
          id: 'phase-1',
          name: 'Gironi iniziali',
          phase_type: 'GROUP_STAGE',
          phase_date: '',
          start_time: '',
          placement_start_rank: null,
          group_block_size: null,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: 4,
          group_sizes: '4,4,4,4',
          group_custom_names: [],
          qualifiers_per_group: 1,
          best_extra_teams: 1,
          next_phase_type: 'KNOCKOUT',
          advancement_routes: [],
          bracket_mode: 'group_blocks',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: 'Le prime giocano per 1-4 posto, le seconde per 5-8 posto, ecc.',
        },
        {
          id: 'phase-2',
          name: 'Fase finale e piazzamenti',
          phase_type: 'KNOCKOUT',
          phase_date: '',
          start_time: '',
          placement_start_rank: 1,
          group_block_size: 4,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: null,
          group_sizes: '',
          group_custom_names: [],
          qualifiers_per_group: null,
          best_extra_teams: null,
          next_phase_type: '',
          advancement_routes: [],
          bracket_mode: 'group_blocks',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: 'Bracket principale e bracket di piazzamento',
        },
      ],
    },
  },
  {
    name: '2 gironi + finali per blocchi',
    description: 'Top 4 per il titolo, poi 5-8, 9-12 e cosi via con semifinali e finali dedicate.',
    config: {
      expected_teams: null,
      schedule: {
        start_time: '09:30',
        match_duration_minutes: 12,
        interval_minutes: 8,
        hide_future_phases_until_complete: false,
        playing_fields: [],
      },
      notes: '',
      phases: [
        {
          id: 'phase-1',
          name: 'Gironi iniziali',
          phase_type: 'GROUP_STAGE',
          phase_date: '',
          start_time: '',
          placement_start_rank: null,
          group_block_size: null,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: 2,
          group_sizes: '6,6',
          group_custom_names: [],
          qualifiers_per_group: null,
          best_extra_teams: null,
          next_phase_type: 'KNOCKOUT',
          advancement_routes: [],
          bracket_mode: 'group_blocks',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: 'Le prime quattro giocano per 1-4, le successive per 5-8, 9-12 e cosi via.',
        },
        {
          id: 'phase-2',
          name: 'Semifinali e finali di piazzamento',
          phase_type: 'KNOCKOUT',
          phase_date: '',
          start_time: '',
          placement_start_rank: 1,
          group_block_size: 4,
          round_trip_mode: 'single',
          stagger_groups: false,
          max_concurrent_matches: null,
          num_halves: null,
          half_duration_minutes: null,
          knockout_progression: 'full_bracket',
          num_groups: null,
          group_sizes: '',
          group_custom_names: [],
          qualifiers_per_group: null,
          best_extra_teams: null,
          next_phase_type: '',
          advancement_routes: [],
          bracket_mode: 'group_blocks',
          group_field_assignments: {},
          knockout_field_assignments: [],
          referee_group_assignments: {},
          notes: 'Incrocio tra i due gironi a blocchi di quattro squadre.',
        },
      ],
    },
  },
]

function AgeGroupsUnifiedPanel({ tournament }: { tournament: Tournament }) {
  const navigate = useNavigate()
  const { data: ageGroups, error: ageGroupsError } = useAdminTournamentAgeGroups(tournament.id)
  const createAgeGroup = useCreateAgeGroup()
  const deleteAgeGroup = useDeleteAgeGroup()
  const [actionError, setActionError] = useState('')

  const isPending = createAgeGroup.isPending || deleteAgeGroup.isPending

  async function handleAdd(option: typeof AGE_GROUP_OPTIONS[number]) {
    setActionError('')
    try {
      const created = await createAgeGroup.mutateAsync({
        tournament_id: tournament.id,
        age_group: option.value,
        display_name: option.label,
      })
      navigate(`/admin/tornei/${tournament.id}/categorie/${created.id}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setActionError(msg ?? 'Impossibile aggiungere la categoria')
    }
  }

  async function handleRemove(group: AgeGroup) {
    setActionError('')
    try {
      await deleteAgeGroup.mutateAsync({ id: group.id, tournamentId: tournament.id })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setActionError(msg ?? 'Impossibile rimuovere la categoria')
    }
  }

  return (
    <>
      {(actionError || ageGroupsError) && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError || 'Errore nel caricamento delle categorie. Verifica che il database sia aggiornato.'}
        </div>
      )}
      <div className="grid gap-3">
        {AGE_GROUP_OPTIONS.map((option) => {
          const activeGroup = ageGroups?.find((group) => group.age_group === option.value) ?? null
          if (activeGroup) {
            return (
              <AgeGroupUnifiedCard
                key={option.value}
                tournament={tournament}
                group={activeGroup}
                onRemove={handleRemove}
                isPending={isPending}
              />
            )
          }
          return (
            <div
              key={option.value}
              className="rounded-[1.45rem] border border-slate-200 bg-slate-50 p-4 opacity-60"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-slate-700">{option.label}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{option.subtitle}</p>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void handleAdd(option)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rugby-green px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-rugby-green-dark disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Aggiungi
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

function AgeGroupUnifiedCard({
  tournament,
  group,
  onRemove,
  isPending,
}: {
  tournament: Tournament
  group: AgeGroup
  onRemove: (group: AgeGroup) => void
  isPending: boolean
}) {
  const navigate = useNavigate()
  const { data: program } = useAdminAgeGroupProgram(group.id)
  const structure = normalizeStructureConfig(group.structure_config)
  const hasFormula = structure.phases.length > 0
  const hasScheduleBase = Boolean(structure.schedule.start_time && structure.schedule.playing_fields.length > 0)
  const hasProgram = Boolean(program?.generated)
  const completedMatches = countProgramMatches(program, (match) => match.status === 'COMPLETED')
  const totalMatches = countProgramMatches(program)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [isPdfDl, setIsPdfDl] = useState(false)
  const [isXlsDl, setIsXlsDl] = useState(false)
  const agLabel = group.display_name || group.age_group

  async function handleDlPdf() {
    setIsPdfDl(true)
    try { await downloadAdminAgeGroupProgramPdf(group.id) } finally { setIsPdfDl(false) }
  }
  async function handleDlXls() {
    setIsXlsDl(true)
    try { await downloadAdminAgeGroupProgramExcel(group.id) } finally { setIsXlsDl(false) }
  }

  return (
    <div className="rounded-[1.45rem] border border-slate-200 bg-white p-4 shadow-sm">
      {/* Row 1: title + action buttons */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-base font-black text-slate-900">{agLabel}</p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => navigate(`/admin/tornei/${tournament.id}/categorie/${group.id}`)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            Configura
          </button>
          {hasProgram && (
            <button
              type="button"
              onClick={() => navigate(`/admin/tornei/${tournament.id}/categorie/${group.id}/tabellone`)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-800 transition-colors hover:bg-violet-100"
            >
              Tabellone
            </button>
          )}
          {hasProgram && (
            <>
              <button
                type="button"
                onClick={() => void handleDlXls()}
                disabled={isXlsDl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:opacity-50"
                title={`Scarica Excel · ${agLabel}`}
              >
                <Download className="h-3.5 w-3.5" />
                {isXlsDl ? '...' : 'Excel'}
              </button>
              <button
                type="button"
                onClick={() => void handleDlPdf()}
                disabled={isPdfDl}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                title={`Scarica PDF · ${agLabel}`}
              >
                <Download className="h-3.5 w-3.5" />
                {isPdfDl ? '...' : 'PDF'}
              </button>
            </>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => setConfirmingRemove(true)}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Rimuovi categoria"
            aria-label="Rimuovi categoria"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {/* Row 2: status badges */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <StatusPill label={hasFormula ? 'Formula pronta' : 'Formula da completare'} tone={hasFormula ? 'emerald' : 'amber'} />
        <StatusPill label={hasScheduleBase ? 'Orari e campi impostati' : 'Base calendario incompleta'} tone={hasScheduleBase ? 'sky' : 'amber'} />
        <StatusPill label={hasProgram ? `Programma · ${completedMatches}/${totalMatches}` : 'Programma non generato'} tone={hasProgram ? 'fuchsia' : 'slate'} />
      </div>
      {confirmingRemove && (
        <div role="alertdialog" aria-modal="false" aria-labelledby={`remove-label-${group.id}`} className="mt-3 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" aria-hidden="true" />
          <p id={`remove-label-${group.id}`} className="flex-1 text-sm font-semibold text-red-800">Rimuovere «{group.display_name || group.age_group}»? I dati della categoria verranno persi.</p>
          <button onClick={() => { onRemove(group); setConfirmingRemove(false) }} disabled={isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">Rimuovi</button>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <button autoFocus onClick={() => setConfirmingRemove(false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Annulla</button>
        </div>
      )}
    </div>
  )
}

type FieldScheduleEntry = {
  id: string
  ageGroupId: string
  ageGroupLabel: string
  phaseName: string
  groupName: string | null
  scheduledAt: string
  endsAt: Date
  fieldName: string
  fieldNumber: number | null
  homeLabel: string
  awayLabel: string
  overlap: boolean
}

function TournamentFieldSchedulePanel({ tournament }: { tournament: Tournament }) {
  const { data: ageGroups, isLoading, error } = useAdminTournamentAgeGroups(tournament.id)
  const programQueries = useQueries({
    queries: (ageGroups ?? []).map((ageGroup) => ({
      queryKey: ['admin-age-group-program', ageGroup.id, 'field-schedule'],
      queryFn: async () => {
        const res = await apiClient.get<AgeGroupProgram>(`/api/v1/admin/age-groups/${ageGroup.id}/program`)
        return res.data
      },
      enabled: Boolean(ageGroup.id),
    })),
  })

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Errore nel caricamento del calendario campi.
      </div>
    )
  }

  const isProgramsLoading = programQueries.some((query) => query.isLoading)
  const programs = programQueries.map((query) => query.data).filter((item): item is AgeGroupProgram => Boolean(item))
  const scheduleByField = buildTournamentFieldSchedule(ageGroups ?? [], programs)
  const fieldEntries = Object.entries(scheduleByField)
  const overlapCount = fieldEntries.reduce((total, [, entries]) => total + entries.filter((entry) => entry.overlap).length, 0)

  return (
    <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/90 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="border-b border-slate-200 px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Campi</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950">Calendario per impianto e campo</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Vista unica del torneo per controllare chi gioca su ogni campo in ogni orario ed evidenziare subito eventuali sovrapposizioni.
        </p>
        {overlapCount > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {overlapCount} {overlapCount === 1 ? 'sovrapposizione rilevata' : 'sovrapposizioni rilevate'}
          </div>
        )}
      </div>

      <div className="p-6">
        {isLoading || isProgramsLoading ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Caricamento calendario campi...
          </div>
        ) : fieldEntries.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nessuna partita con campo assegnato nel torneo.
          </div>
        ) : (
          <div className="space-y-4">
            {fieldEntries.map(([fieldKey, entries]) => (
              <div key={fieldKey} className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-[linear-gradient(135deg,_#ffffff_0%,_#f8fafc_100%)] px-5 py-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Impianto e campo</p>
                      <h3 className="mt-1 text-lg font-black text-slate-950">{fieldKey}</h3>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
                      <Clock3 className="h-3.5 w-3.5" />
                      {entries.length} {entries.length === 1 ? 'partita programmata' : 'partite programmate'}
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-slate-100">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`grid gap-3 px-5 py-4 md:grid-cols-[110px_minmax(0,1fr)_200px] md:items-center ${
                        entry.overlap ? 'bg-amber-50/70' : 'bg-white'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-black text-slate-950">{format(new Date(entry.scheduledAt), 'HH:mm', { locale: it })}</p>
                        <p className="mt-1 text-xs text-slate-500">{format(new Date(entry.scheduledAt), 'EEE d MMM', { locale: it })}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{entry.homeLabel} vs {entry.awayLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {entry.ageGroupLabel} · {entry.phaseName}{entry.groupName ? ` · ${entry.groupName}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                          fino alle {format(entry.endsAt, 'HH:mm', { locale: it })}
                        </span>
                        {entry.overlap && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                            sovrapposta
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function StatusPill({
  label,
  tone,
}: {
  label: string
  tone: 'emerald' | 'amber' | 'sky' | 'fuchsia' | 'slate'
}) {
  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    sky: 'border-sky-200 bg-sky-50 text-sky-700',
    fuchsia: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
    slate: 'border-slate-200 bg-white text-slate-600',
  }[tone]

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${toneClass}`}>
      {label}
    </span>
  )
}

function AgeGroupConfigurationScreen({
  tournament,
  ageGroupId,
}: {
  tournament: Tournament
  ageGroupId: string
}) {
  const { data: ageGroups, isLoading } = useAdminTournamentAgeGroups(tournament.id)
  const ageGroup = ageGroups?.find((item) => item.id === ageGroupId) ?? null
  const { data: program } = useAdminAgeGroupProgram(ageGroupId)
  const [activeStep, setActiveStep] = useState<CategoryWizardStep>('squadre')
  const [isPdfDownloading, setIsPdfDownloading] = useState(false)
  const [isXlsxDownloading, setIsXlsxDownloading] = useState(false)
  const [xlsxError, setXlsxError] = useState('')
  const orderedAgeGroups = AGE_GROUP_OPTIONS
    .map((option) => ageGroups?.find((item) => item.age_group === option.value) ?? null)
    .filter((item): item is AgeGroup => Boolean(item))
  const currentAgeGroupIndex = orderedAgeGroups.findIndex((item) => item.id === ageGroupId)
  const previousAgeGroup = currentAgeGroupIndex > 0 ? orderedAgeGroups[currentAgeGroupIndex - 1] : null
  const nextAgeGroup = currentAgeGroupIndex >= 0 && currentAgeGroupIndex < orderedAgeGroups.length - 1 ? orderedAgeGroups[currentAgeGroupIndex + 1] : null

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento categoria...</div>
  }

  if (!ageGroup) {
    return (
      <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
        Categoria non trovata.
      </div>
    )
  }

  const steps: Array<{ id: CategoryWizardStep; label: string; description: string }> = [
    { id: 'squadre', label: 'Squadre', description: 'Definisci quante sono e inseriscile.' },
    { id: 'impostazioni', label: 'Impostazioni', description: 'Durata incontri, campi, classifica e spareggi.' },
    { id: 'fasi', label: 'Fasi', description: 'Gironi, passaggi turno e generazione del programma.' },
    { id: 'partite', label: 'Partite', description: 'Modifica orari e squadre di ogni partita.' },
  ]

  async function handleDownloadPdf() {
    setIsPdfDownloading(true)
    try {
      await downloadAdminAgeGroupProgramPdf(ageGroup!.id)
    } finally {
      setIsPdfDownloading(false)
    }
  }

  async function handleDownloadExcel() {
    setIsXlsxDownloading(true)
    setXlsxError('')
    try {
      await downloadAdminAgeGroupProgramExcel(ageGroup!.id)
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: unknown } })?.response?.data
      let msg: string | undefined
      if (errData instanceof Blob) {
        try { msg = JSON.parse(await errData.text())?.detail } catch { /* ignore */ }
      } else {
        msg = (errData as { detail?: string } | undefined)?.detail
      }
      setXlsxError(msg ?? 'Errore durante il download Excel')
    } finally {
      setIsXlsxDownloading(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Configurazione categoria</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Categoria</p>
                <p className="mt-1 text-base font-bold text-slate-950">{ageGroup.display_name || ageGroup.age_group}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Evento</p>
                <p className="mt-1 text-base font-bold text-slate-950">{tournament.name}</p>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-600">
              Prima definisci le squadre partecipanti, poi costruisci formula, campi e generazione del programma.
            </p>
            {tournament.event_type === 'GATHERING' && (
              <p className="mt-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
                Modalità raggruppamento
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {program?.generated && (
              <>
                <button
                  type="button"
                  onClick={() => void handleDownloadExcel()}
                  disabled={isXlsxDownloading}
                  className="inline-flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {isXlsxDownloading ? 'Download...' : `Excel ${tournament.name} · ${ageGroup!.display_name || ageGroup!.age_group}`}
                </button>
                {xlsxError && (
                  <p className="w-full text-xs font-medium text-red-600">{xlsxError}</p>
                )}
                <button
                  type="button"
                  onClick={() => void handleDownloadPdf()}
                  disabled={isPdfDownloading}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {isPdfDownloading ? 'Download...' : `PDF ${tournament.name} · ${ageGroup!.display_name || ageGroup!.age_group}`}
                </button>
              </>
            )}
            <Link
              to={`/admin/tornei/${tournament.id}/calendario`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Calendario impianti
            </Link>
            <Link
              to={`/admin/tornei/${tournament.id}/modifica`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Esci
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
              className={`min-w-[180px] rounded-xl border px-4 py-3 text-left transition-colors ${
                step.id === 'squadre'
                  ? activeStep === step.id
                    ? 'border-sky-300 bg-sky-50 text-sky-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : step.id === 'impostazioni'
                    ? activeStep === step.id
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  : step.id === 'fasi'
                    ? activeStep === step.id
                      ? 'border-amber-300 bg-amber-50 text-amber-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    : activeStep === step.id
                      ? 'border-violet-300 bg-violet-50 text-violet-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{`Passo ${index + 1}`}</p>
                <p className="mt-1 text-sm font-bold">{step.label}</p>
              </div>
              <p className="mt-1 text-sm text-slate-500">{step.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/admin/tornei/${tournament.id}/categorie`}
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Tutte le categorie
          </Link>
          <Link
            to={`/admin/tornei/${tournament.id}/categorie/${ageGroup.id}/gestione`}
            className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            Vai a Partite
          </Link>
          {previousAgeGroup && (
            <Link
              to={`/admin/tornei/${tournament.id}/categorie/${previousAgeGroup.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              ← {previousAgeGroup.display_name || previousAgeGroup.age_group}
            </Link>
          )}
          {nextAgeGroup && (
            <Link
              to={`/admin/tornei/${tournament.id}/categorie/${nextAgeGroup.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {nextAgeGroup.display_name || nextAgeGroup.age_group} →
            </Link>
          )}
        </div>
      </div>

      <AgeGroupConfigurationPanel
        tournament={tournament}
        ageGroup={ageGroup}
        activeTab={activeStep}
        onStepChange={setActiveStep}
        pageMode
      />
    </div>
  )
}

function AgeGroupOperationsScreen({
  tournament,
  ageGroupId,
}: {
  tournament: Tournament
  ageGroupId: string
}) {
  const { data: ageGroups, isLoading } = useAdminTournamentAgeGroups(tournament.id)
  const ageGroup = ageGroups?.find((item) => item.id === ageGroupId) ?? null
  const orderedAgeGroups = AGE_GROUP_OPTIONS
    .map((option) => ageGroups?.find((item) => item.age_group === option.value) ?? null)
    .filter((item): item is AgeGroup => Boolean(item))
  const currentAgeGroupIndex = orderedAgeGroups.findIndex((item) => item.id === ageGroupId)
  const previousAgeGroup = currentAgeGroupIndex > 0 ? orderedAgeGroups[currentAgeGroupIndex - 1] : null
  const nextAgeGroup = currentAgeGroupIndex >= 0 && currentAgeGroupIndex < orderedAgeGroups.length - 1 ? orderedAgeGroups[currentAgeGroupIndex + 1] : null

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento gestione categoria...</div>
  }

  if (!ageGroup) {
    return (
      <div className="rounded-[1.8rem] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
        Categoria non trovata.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Gestione operativa</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Categoria</p>
                <p className="mt-1 text-base font-bold text-slate-950">{ageGroup.display_name || ageGroup.age_group}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Evento</p>
                <p className="mt-1 text-base font-bold text-slate-950">{tournament.name}</p>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-600">
              Vista operativa per risultati, ritardi e partite, pensata per chi aggiorna il torneo durante la giornata.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/admin/tornei/${tournament.id}/categorie`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Tutte le categorie
            </Link>
            <Link
              to={`/admin/tornei/${tournament.id}/categorie/${ageGroup.id}`}
              className="inline-flex items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100"
            >
              Configura categoria
            </Link>
            <Link
              to={`/admin/tornei/${tournament.id}/calendario`}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Calendario impianti
            </Link>
            {previousAgeGroup && (
              <Link
                to={`/admin/tornei/${tournament.id}/categorie/${previousAgeGroup.id}/gestione`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                ← {previousAgeGroup.display_name || previousAgeGroup.age_group}
              </Link>
            )}
            {nextAgeGroup && (
              <Link
                to={`/admin/tornei/${tournament.id}/categorie/${nextAgeGroup.id}/gestione`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                {nextAgeGroup.display_name || nextAgeGroup.age_group} →
              </Link>
            )}
            <Link
              to="/admin/tornei"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Torna ai tornei
            </Link>
          </div>
        </div>
      </div>

      <AgeGroupOperationsPanel ageGroup={ageGroup} />
    </div>
  )
}

function AgeGroupOperationsPanel({ ageGroup }: { ageGroup: AgeGroup }) {
  const { data: participants } = useAgeGroupParticipants(ageGroup.id)
  const { data: program } = useAdminAgeGroupProgram(ageGroup.id)
  const structure = normalizeStructureConfig(ageGroup.structure_config)
  const totalMatches = program ? countProgramMatches(program) : 0

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
        <p className="text-sm text-slate-600">
          Apri solo le partite da aggiornare. Filtri, risultati e ritardi sono raccolti qui per lavorare velocemente sul campo.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <InfoField label="Squadre" value={`${participants?.length ?? 0}`} />
          <InfoField label="Partite" value={program ? `${totalMatches}` : '0'} />
          <InfoField label="Fasi" value={`${structure.phases.length}`} />
          <InfoField label="Durata" value={structure.schedule.match_duration_minutes ? `${structure.schedule.match_duration_minutes} min` : 'Da definire'} />
        </div>
      </div>

      <div className="p-5">
        {participants && participants.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Aggiungi prima le squadre partecipanti, poi genera gironi e partite.
          </div>
        ) : program ? (
          <AgeGroupProgramView
            program={program}
            mode="admin"
            variant="operations"
            playingFields={structure.schedule.playing_fields}
            participants={participants ?? []}
            matchDurationMinutes={structure.schedule.match_duration_minutes ?? 12}
            intervalMinutes={structure.schedule.interval_minutes ?? 8}
          />
        ) : (
          <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
            Nessun programma generato per questa categoria.
          </div>
        )}
      </div>
    </section>
  )
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 text-base font-bold text-slate-950">{value}</p>
    </div>
  )
}

function AgeGroupConfigurationPanel({
  tournament,
  ageGroup,
  activeTab,
  onStepChange,
  pageMode = false,
}: {
  tournament: Tournament
  ageGroup: AgeGroup
  activeTab?: CategoryWizardStep
  onStepChange?: (step: CategoryWizardStep) => void
  pageMode?: boolean
}) {
  const { data: participants } = useAgeGroupParticipants(ageGroup.id)
  const { data: program } = useAdminAgeGroupProgram(ageGroup.id)
  const { data: teams } = useAdminTeams(tournament.organization_id, tournament.id)
  const { data: organizations } = useAdminOrganizations()
  const { data: facilities } = useOrganizationFields(tournament.organization_id)
  const { data: templates } = useStructureTemplates(ageGroup.age_group, tournament.organization_id)
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()
  const enrollTeam = useEnrollTournamentTeam()
  const unenrollTeam = useUnenrollTournamentTeam()
  const updateStructure = useUpdateAgeGroupStructure()
  const updateAgeGroup = useUpdateAgeGroup()
  const createTemplate = useCreateStructureTemplate()
  const generateProgram = useGenerateAgeGroupProgram()
  const deleteProgram = useDeleteAgeGroupProgram()

  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('')
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamShortName, setNewTeamShortName] = useState('')
  const [editingTeamId, setEditingTeamId] = useState('')
  const [editingTeamName, setEditingTeamName] = useState('')
  const [editingTeamShortName, setEditingTeamShortName] = useState('')
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')
  const [selectedTemplateName, setSelectedTemplateName] = useState(ageGroup.structure_template_name ?? '')
  const [structure, setStructure] = useState<StructureConfig>(() => applyDefaultPhaseDates(normalizeStructureConfig(ageGroup.structure_config), tournament.start_date))
  const [scoringRules, setScoringRules] = useState<AgeGroupScoringRules>(() => normalizeScoringRules(ageGroup.scoring_rules))
  const [fieldMapUrl, setFieldMapUrl] = useState(ageGroup.field_map_url ?? '')
  const [saveError, setSaveError] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [teamError, setTeamError] = useState('')
  const [teamMessage, setTeamMessage] = useState('')
  const [confirmingParticipantId, setConfirmingParticipantId] = useState<string | null>(null)
  const [rankingControlsOpen, setRankingControlsOpen] = useState(false)
  const [activePhaseId, setActivePhaseId] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => {
    setSelectedTemplateName(ageGroup.structure_template_name ?? '')
    setStructure(applyDefaultPhaseDates(normalizeStructureConfig(ageGroup.structure_config), tournament.start_date))
    setScoringRules(normalizeScoringRules(ageGroup.scoring_rules))
    setFieldMapUrl(ageGroup.field_map_url ?? '')
    setSaveError('')
    setSaveMessage('')
    setTeamError('')
    setTeamMessage('')
  }, [ageGroup.id, ageGroup.structure_template_name, ageGroup.structure_config, ageGroup.scoring_rules, tournament.start_date])

  useEffect(() => {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase) => {
        if (phase.phase_type !== 'GROUP_STAGE') {
          return {
            ...phase,
            knockout_field_assignments: filterAssignmentsToPlayingFields(phase.knockout_field_assignments, current.schedule.playing_fields),
          }
        }
        return {
          ...phase,
          group_field_assignments: buildAutoGroupFieldAssignments(phase, current.schedule.playing_fields),
          knockout_field_assignments: filterAssignmentsToPlayingFields(phase.knockout_field_assignments, current.schedule.playing_fields),
          referee_group_assignments: buildAutoRefereeAssignments(phase),
        }
      }),
    }))
  }, [
    structure.schedule.playing_fields.map((field) => `${field.field_name}:${field.field_number ?? ''}`).join('|'),
    structure.phases.map((phase) => `${phase.id}:${phase.num_groups ?? ''}:${phase.group_sizes}`).join('|'),
  ])

  const allTemplates = [
    ...BUILTIN_TEMPLATES.filter((template) => !template.age_group || template.age_group === ageGroup.age_group),
    ...(templates ?? []),
  ]

  const selectedTeamIds = new Set(participants?.map((participant) => participant.team_id) ?? [])
  const availableTeams = (teams ?? []).filter((team) => !selectedTeamIds.has(team.id))
  const availableOrganizations = organizations ?? []
  const availableFacilities = (facilities ?? []).filter((facility) => !facility.age_group || facility.age_group === ageGroup.age_group)
  const remainingSlots = structure.expected_teams !== null
    ? Math.max(structure.expected_teams - (participants?.length ?? 0), 0)
    : null
  const validationErrors = validateStructureConfig(structure)
  const isGathering = tournament.event_type === 'GATHERING'
  const isStructureDirty = serializeStructureForComparison(normalizeStructureConfig(ageGroup.structure_config)) !== serializeStructureForComparison(structure)
    || (ageGroup.structure_template_name ?? '') !== selectedTemplateName
  const isScoringDirty = serializeScoringRules(normalizeScoringRules(ageGroup.scoring_rules)) !== serializeScoringRules(scoringRules)
  const isFieldMapDirty = (ageGroup.field_map_url ?? '') !== fieldMapUrl.trim()
  const readiness = buildGenerationReadiness(structure, participants?.length ?? 0, validationErrors, isStructureDirty || isScoringDirty || isFieldMapDirty)
  const hasRecordedResults = hasProgramRecordedResults(program)

  useEffect(() => {
    const organization = availableOrganizations.find((item) => item.id === selectedOrganizationId)
    if (!organization) return
    setNewTeamName((current) => current.trim().length === 0 ? `${organization.name} ` : current)
  }, [availableOrganizations, selectedOrganizationId])

  useEffect(() => {
    if (structure.phases.length === 0) {
      setActivePhaseId('')
      return
    }
    if (!structure.phases.some((phase) => phase.id === activePhaseId)) {
      setActivePhaseId(structure.phases[0]?.id ?? '')
    }
  }, [structure.phases, activePhaseId])

  async function handleAddTeam() {
    if (!selectedTeamId) return
    setTeamError('')
    setTeamMessage('')
    try {
      await enrollTeam.mutateAsync({
        tournament_age_group_id: ageGroup.id,
        team_id: selectedTeamId,
      })
      setSelectedTeamId('')
      setTeamMessage('Squadra aggiunta correttamente alla categoria')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTeamError(msg ?? 'Errore durante l’aggiunta della squadra')
    }
  }

  async function handleCreateTeamFromOrganization() {
    if (!selectedOrganizationId || !newTeamName.trim()) return
    setTeamError('')
    setTeamMessage('')
    const organization = organizations?.find((item) => item.id === selectedOrganizationId)
    if (!organization) return
    try {
      const createdTeam = await createTeam.mutateAsync({
        organization_id: organization.id,
        tournament_id: tournament.id,
        name: newTeamName.trim(),
        short_name: newTeamShortName.trim() || undefined,
      })
      await enrollTeam.mutateAsync({
        tournament_age_group_id: ageGroup.id,
        team_id: createdTeam.id,
      })
      setSelectedOrganizationId('')
      setNewTeamName('')
      setNewTeamShortName('')
      setTeamMessage('Squadra creata e aggiunta correttamente')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTeamError(msg ?? 'Errore durante la creazione della squadra')
    }
  }

  async function handleUpdateParticipantTeam(teamId: string) {
    if (!editingTeamName.trim()) return
    setTeamError('')
    setTeamMessage('')
    try {
      await updateTeam.mutateAsync({
        id: teamId,
        data: {
          name: editingTeamName.trim(),
          short_name: editingTeamShortName.trim() || undefined,
        },
      })
      setEditingTeamId('')
      setEditingTeamName('')
      setEditingTeamShortName('')
      setTeamMessage('Squadra aggiornata correttamente')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTeamError(msg ?? 'Errore durante l’aggiornamento della squadra')
    }
  }

  async function handleRemoveParticipant(participant: TournamentParticipant) {
    setConfirmingParticipantId(null)
    setTeamError('')
    setTeamMessage('')
    try {
      await unenrollTeam.mutateAsync({ id: participant.id, ageGroupId: ageGroup.id })
      setTeamMessage('Squadra cancellata correttamente dalla categoria')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setTeamError(msg ?? 'Errore durante la cancellazione della squadra')
    }
  }

  async function handleApplyTemplate(template: StructureTemplate | typeof BUILTIN_TEMPLATES[number]) {
    const config = 'config' in template ? template.config : {}
    setSelectedTemplateName(template.name)
    setStructure(applyDefaultPhaseDates(normalizeStructureConfig(config), tournament.start_date))
  }

  function updateRankingCriterionOrder(index: number, direction: -1 | 1) {
    setScoringRules((current) => {
      const tieBreakers = getTieBreakerCriteria(current)
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= tieBreakers.length) return current
      const next = [...tieBreakers]
      const [item] = next.splice(index, 1)
      next.splice(targetIndex, 0, item)
      return {
        ...current,
        ranking_criteria: ['points', ...next],
      }
    })
  }

  async function persistConfiguration(showSuccessMessage = true) {
    setSaveError('')
    try {
      if (isStructureDirty) {
        await updateStructure.mutateAsync({
          id: ageGroup.id,
          tournamentId: tournament.id,
          structure_template_name: selectedTemplateName || null,
          structure_config: structure as unknown as Record<string, unknown>,
        })
      }
      if (isScoringDirty || isFieldMapDirty) {
        await updateAgeGroup.mutateAsync({
          id: ageGroup.id,
          tournamentId: tournament.id,
          field_map_url: fieldMapUrl.trim() || null,
          scoring_rules: scoringRules,
        })
      }
      if (showSuccessMessage) {
        setSaveMessage(
          validationErrors.length > 0
            ? `Bozza salvata. Mancano ancora ${validationErrors.length} elementi per generare il programma.`
            : 'Configurazione salvata correttamente'
        )
      }
      return true
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg ?? 'Errore durante il salvataggio della configurazione')
      return false
    }
  }

  async function handleSaveStructure() {
    setSaveMessage('')
    await persistConfiguration(true)
  }

  async function handleGenerateProgram() {
    setSaveError('')
    setSaveMessage('')

    if (!readiness.isReady) {
      setSaveError(readiness.blockers[0] ?? 'Completa la configurazione prima di generare le partite')
      return
    }

    const saved = await persistConfiguration(false)
    if (!saved) return

    try {
      const program = await generateProgram.mutateAsync(ageGroup.id)
      const totalMatches = countProgramMatches(program)
      setSaveMessage(`Programma generato correttamente${totalMatches > 0 ? ` · ${totalMatches} partite create` : ''}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg ?? 'Errore durante la generazione del programma')
    }
  }

  async function handleDeleteProgram() {
    setSaveError('')
    setSaveMessage('')

    try {
      await deleteProgram.mutateAsync(ageGroup.id)
      setSaveMessage('Tutte le partite della categoria sono state cancellate')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setSaveError(msg ?? 'Errore durante la cancellazione del programma')
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return
    await createTemplate.mutateAsync({
      name: templateName.trim(),
      description: templateDescription.trim() || undefined,
      organization_id: tournament.organization_id,
      age_group: ageGroup.age_group,
      config: structure as unknown as Record<string, unknown>,
    })
    setTemplateName('')
    setTemplateDescription('')
  }

  function setPhase(index: number, patch: Partial<StructurePhase>) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, phaseIndex) => phaseIndex === index ? { ...phase, ...patch } : phase),
    }))
  }

  function addAdvancementRoute(phaseIndex: number) {
    setStructure((current) => {
      const sourcePhase = current.phases[phaseIndex]
      const routeNumber = (sourcePhase?.advancement_routes.length ?? 0) + 1
      const participantCount = participants?.length ?? 0
      const suggestedStart = estimateSuggestedPhaseStart(current, phaseIndex, participantCount)
      const linkedPhase = {
        ...makeEmptyPhase(current.phases.length + 1, tournament.start_date),
        name: buildLinkedPhaseName(phaseIndex, routeNumber),
        phase_date: suggestedStart?.date ?? (tournament.start_date ?? ''),
        start_time: suggestedStart?.time ?? '',
      }
      const insertIndex = Math.min(phaseIndex + routeNumber, current.phases.length)
      return {
        ...current,
        phases: [
          ...current.phases.slice(0, phaseIndex),
          {
            ...sourcePhase,
            advancement_routes: [
              ...(sourcePhase?.advancement_routes ?? []),
              makeAdvancementRoute({
                targetPhaseId: linkedPhase.id,
                sourceMode: sourcePhase?.phase_type === 'KNOCKOUT' ? 'knockout_winner' : 'group_rank',
              }),
            ],
          },
          ...current.phases.slice(phaseIndex + 1, insertIndex),
          linkedPhase,
          ...current.phases.slice(insertIndex),
        ],
      }
    })
  }

  function setAdvancementRoute(phaseIndex: number, routeId: string, patch: Partial<AdvancementRoute>) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) return phase
        return {
          ...phase,
          advancement_routes: phase.advancement_routes.map((route) => {
            if (route.id !== routeId) return route
            const nextRoute = { ...route, ...patch }
            if (patch.source_mode === 'best_extra') {
              nextRoute.rank_from = null
              nextRoute.rank_to = null
              nextRoute.extra_count = nextRoute.extra_count ?? 1
            }
            if (patch.source_mode === 'group_rank') {
              nextRoute.rank_from = nextRoute.rank_from ?? 1
              nextRoute.rank_to = nextRoute.rank_to ?? nextRoute.rank_from ?? 1
              nextRoute.extra_count = null
            }
            if (patch.source_mode === 'knockout_winner' || patch.source_mode === 'knockout_loser') {
              nextRoute.rank_from = null
              nextRoute.rank_to = null
              nextRoute.extra_count = null
              nextRoute.source_groups = []
            }
            return nextRoute
          }),
        }
      }),
    }))
  }

  function removeAdvancementRoute(phaseIndex: number, routeId: string) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => (
        currentPhaseIndex === phaseIndex
          ? { ...phase, advancement_routes: phase.advancement_routes.filter((route) => route.id !== routeId) }
          : phase
      )),
    }))
  }

  function addAdvancementRouteToExisting(phaseIndex: number, targetPhaseId: string) {
    setStructure((current) => {
      const sourcePhase = current.phases[phaseIndex]
      return {
        ...current,
        phases: current.phases.map((phase, i) => (
          i !== phaseIndex ? phase : {
            ...phase,
            advancement_routes: [
              ...(phase.advancement_routes ?? []),
              makeAdvancementRoute({
                targetPhaseId,
                sourceMode: sourcePhase?.phase_type === 'KNOCKOUT' ? 'knockout_winner' : 'group_rank',
              }),
            ],
          }
        )),
      }
    })
  }

  function toggleAdvancementRouteGroup(phaseIndex: number, routeId: string, groupName: string) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) return phase
        return {
          ...phase,
          advancement_routes: phase.advancement_routes.map((route) => {
            if (route.id !== routeId) return route
            const selected = route.source_groups.includes(groupName)
            return {
              ...route,
              source_groups: selected
                ? route.source_groups.filter((item) => item !== groupName)
                : [...route.source_groups, groupName],
            }
          }),
        }
      }),
    }))
  }

  function toggleGroupPlayingField(phaseIndex: number, groupName: string, playingField: PlayingFieldConfig) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) return phase
        const currentAssignments = phase.group_field_assignments[groupName] ?? []
        const exists = currentAssignments.some((assignment) => (
          assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number
        ))
        const nextAssignments = exists
          ? currentAssignments.filter((assignment) => !(assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number))
          : [...currentAssignments, playingField]
        return {
          ...phase,
          group_field_assignments: {
            ...phase.group_field_assignments,
            [groupName]: nextAssignments,
          },
        }
      }),
    }))
  }

  function toggleRefereeSourceGroup(phaseIndex: number, groupName: string, sourceGroupName: string) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) return phase
        const currentAssignments = phase.referee_group_assignments[groupName] ?? []
        const exists = currentAssignments.includes(sourceGroupName)
        const nextAssignments = exists
          ? currentAssignments.filter((item) => item !== sourceGroupName)
          : [...currentAssignments, sourceGroupName]
        return {
          ...phase,
          referee_group_assignments: {
            ...phase.referee_group_assignments,
            [groupName]: nextAssignments,
          },
        }
      }),
    }))
  }

  function toggleKnockoutPlayingField(phaseIndex: number, playingField: PlayingFieldConfig) {
    setStructure((current) => ({
      ...current,
      phases: current.phases.map((phase, currentPhaseIndex) => {
        if (currentPhaseIndex !== phaseIndex) return phase
        const exists = phase.knockout_field_assignments.some((assignment) => (
          assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number
        ))
        const nextAssignments = exists
          ? phase.knockout_field_assignments.filter((assignment) => !(assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number))
          : [...phase.knockout_field_assignments, playingField]
        return {
          ...phase,
          knockout_field_assignments: nextAssignments,
        }
      }),
    }))
  }

  function addPhase() {
    const newPhase = makeEmptyPhase(structure.phases.length + 1, tournament.start_date)
    setStructure((current) => ({
      ...current,
      phases: [...current.phases, newPhase],
    }))
    setActivePhaseId(newPhase.id)
  }

  function removePhase(index: number) {
    const removedPhaseId = structure.phases[index]?.id ?? ''
    const fallbackPhaseId = structure.phases[index + 1]?.id || structure.phases[index - 1]?.id || ''
    setStructure((current) => {
      const removedPhase = current.phases[index]
      return {
        ...current,
        phases: current.phases
          .filter((_, phaseIndex) => phaseIndex !== index)
          .map((phase) => ({
            ...phase,
            advancement_routes: phase.advancement_routes.filter((route) => route.target_phase_id !== removedPhase?.id),
          })),
      }
    })
    if (removedPhaseId === activePhaseId) {
      setActivePhaseId(fallbackPhaseId)
    }
  }

  function addPlayingField() {
    setStructure((current) => ({
      ...current,
      schedule: {
        ...current.schedule,
        playing_fields: [...current.schedule.playing_fields, makeEmptyPlayingField(current.schedule.playing_fields.length + 1)],
      },
    }))
  }

  function updatePlayingField(index: number, patch: Partial<PlayingFieldConfig>) {
    setStructure((current) => {
      const currentField = current.schedule.playing_fields[index]
      if (!currentField) return current

      const nextField = { ...currentField, ...patch }
      const matchesField = (field: PlayingFieldConfig) => (
        field.field_name === currentField.field_name && field.field_number === currentField.field_number
      )
      const syncAssignedField = (field: PlayingFieldConfig) => (matchesField(field) ? nextField : field)

      return {
        ...current,
        schedule: {
          ...current.schedule,
          playing_fields: current.schedule.playing_fields.map((playingField, playingFieldIndex) => (
            playingFieldIndex === index ? nextField : playingField
          )),
        },
        phases: current.phases.map((phase) => ({
          ...phase,
          group_field_assignments: Object.fromEntries(
            Object.entries(phase.group_field_assignments).map(([groupName, assignments]) => [
              groupName,
              assignments.map(syncAssignedField),
            ]),
          ),
          knockout_field_assignments: phase.knockout_field_assignments.map(syncAssignedField),
        })),
      }
    })
  }

  function removePlayingField(index: number) {
    setStructure((current) => {
      const removedField = current.schedule.playing_fields[index]
      if (!removedField) return current
      const isRemovedField = (field: PlayingFieldConfig) => (
        field.field_name === removedField.field_name && field.field_number === removedField.field_number
      )

      return {
        ...current,
        schedule: {
          ...current.schedule,
          playing_fields: current.schedule.playing_fields.filter((_, playingFieldIndex) => playingFieldIndex !== index),
        },
        phases: current.phases.map((phase) => ({
          ...phase,
          group_field_assignments: Object.fromEntries(
            Object.entries(phase.group_field_assignments).map(([groupName, assignments]) => [
              groupName,
              assignments.filter((field) => !isRemovedField(field)),
            ]),
          ),
          knockout_field_assignments: phase.knockout_field_assignments.filter((field) => !isRemovedField(field)),
        })),
      }
    })
  }

  const currentTab = activeTab ?? 'squadre'
  const isSettingsStep = currentTab === 'impostazioni'
  const isPhasesStep = currentTab === 'fasi'
  const activePhaseIndex = structure.phases.findIndex((phase) => phase.id === activePhaseId)
  const activePhase = activePhaseIndex >= 0 ? structure.phases[activePhaseIndex] : null
  const phase = activePhase ?? makeEmptyPhase(1, tournament.start_date)
  const index = activePhaseIndex >= 0 ? activePhaseIndex : 0

  return (
    <div className="space-y-5">
      <div className={pageMode ? 'space-y-5' : 'grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]'}>
        <div className="space-y-5">
          {(isSettingsStep || isPhasesStep) && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{isSettingsStep ? 'Passo 2' : 'Passo 3'}</p>
                  <p className="mt-1 text-lg font-black text-slate-950">{isSettingsStep ? 'Durata incontri, campi e classifica' : 'Fasi e generazione programma'}</p>
                  <p className="mt-1 text-sm text-slate-600">{isSettingsStep ? 'Qui imposti la base comune del torneo. Questo vale soprattutto per la parte a gironi.' : 'Qui definisci gironi, eliminazioni, passaggi turno e generazione del programma.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onStepChange?.(isSettingsStep ? 'squadre' : 'impostazioni')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Indietro
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveStructure()}
                    disabled={updateStructure.isPending || updateAgeGroup.isPending}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                  >
                    <Save className="h-4 w-4" />
                    {updateStructure.isPending || updateAgeGroup.isPending ? 'Salvataggio...' : 'Salva bozza'}
                  </button>
                  {isSettingsStep && (
                    <button
                      type="button"
                      onClick={() => onStepChange?.('fasi')}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                  {isPhasesStep && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleGenerateProgram()}
                        disabled={generateProgram.isPending || deleteProgram.isPending || updateAgeGroup.isPending || !readiness.isReady}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Sparkles className="h-4 w-4" />
                        {generateProgram.isPending ? 'Rigenerazione...' : program?.generated ? 'Rigenera' : 'Genera'}
                      </button>
                      {program?.generated && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteProgram()}
                          disabled={generateProgram.isPending || deleteProgram.isPending || updateAgeGroup.isPending}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                          {deleteProgram.isPending ? 'Cancellazione...' : 'Cancella programma'}
                        </button>
                      )}
                      {program?.generated && (
                        <Link
                          to={`/admin/tornei/${tournament.id}/categorie/${ageGroup.id}/gestione`}
                          className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 transition-colors hover:bg-sky-100"
                        >
                          Vai alle partite
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <InfoField label="Squadre inserite" value={`${participants?.length ?? 0}`} />
                <InfoField label="Squadre attese" value={`${structure.expected_teams ?? '?'}`} />
                <InfoField label="Da inserire" value={`${remainingSlots ?? '?'}`} />
                <InfoField label="Fasi" value={`${structure.phases.length}`} />
              </div>
            </div>

            <div className="px-5 py-5">
              {isPhasesStep && (
              <div className={`mb-5 rounded-xl border px-4 py-4 ${
                readiness.isReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${readiness.isReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                      Stato configurazione
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {readiness.isReady ? 'Configurazione pronta per generare o rigenerare il programma.' : 'Ci sono ancora elementi da completare prima della generazione.'}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${
                    readiness.isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {readiness.isReady ? 'Pronto' : `${readiness.blockers.length} bloccanti`}
                  </span>
                </div>

                {hasRecordedResults && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-100/60 px-4 py-3 text-sm text-amber-900">
                    Hai già inserito almeno un risultato. Il sistema manterrà intatte le partite già salvate e aggiornerà solo orari e campi delle partite future.
                  </div>
                )}

                {program?.generated && (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    `Cancella programma` svuota la categoria. `Rigenera` ricrea le partite usando la formula attuale.
                  </div>
                )}

                {(readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Bloccanti</p>
                      <div className="mt-2 space-y-1 text-sm text-amber-900">
                        {readiness.blockers.length > 0 ? readiness.blockers.map((error) => (
                          <p key={error}>• {error}</p>
                        )) : <p>Nessuno.</p>}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Avvisi</p>
                      <div className="mt-2 space-y-1 text-sm text-slate-700">
                        {readiness.warnings.length > 0 ? readiness.warnings.map((warning) => (
                          <p key={warning}>• {warning}</p>
                        )) : <p>Nessuno.</p>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}
              
              {false && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Template formula</p>
                <p className="mt-1 text-sm text-slate-600">Se vuoi, parti da una struttura già esistente. Altrimenti definisci le fasi da zero qui sotto.</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  {allTemplates.map((template) => (
                    <button
                      key={template.name}
                      type="button"
                      onClick={() => void handleApplyTemplate(template)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        selectedTemplateName === template.name
                          ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-900">{template.name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">{template.description}</p>
                      <VisualTemplateMini config={normalizeStructureConfig(template.config)} />
                    </button>
                  ))}
                </div>
              </div>}

                {isSettingsStep && (
                <div className="space-y-5">
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Base calendario</p>
                    <p className="mt-1 text-base font-black text-slate-950">Durata incontri e campi disponibili</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Qui definisci solo la durata, l&apos;intervallo e i campi disponibili. Data e ora di partenza si impostano dentro ogni fase.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addPlayingField}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                  >
                    <Plus className="h-4 w-4" />
                    Aggiungi campo
                  </button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <FormField label="Durata incontro" hint="Minuti">
                    <input
                      type="number"
                      value={structure.schedule.match_duration_minutes ?? ''}
                      onChange={(e) => setStructure((current) => ({ ...current, schedule: { ...current.schedule, match_duration_minutes: e.target.value ? Number(e.target.value) : null } }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    />
                  </FormField>
                  <FormField label="Intervallo tra incontri" hint="Minuti">
                    <input
                      type="number"
                      value={structure.schedule.interval_minutes ?? ''}
                      onChange={(e) => setStructure((current) => ({ ...current, schedule: { ...current.schedule, interval_minutes: e.target.value ? Number(e.target.value) : null } }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    />
                  </FormField>
                </div>

                <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
                  <ImageUpload
                    label="Mappa dedicata categoria"
                    value={fieldMapUrl}
                    onChange={(v) => setFieldMapUrl(v)}
                    folder="maps"
                    maxDim={2000}
                    preview="wide"
                    placeholder="Carica immagine mappa o incolla link"
                  />
                  <p className="mt-3 text-sm text-slate-600">
                    Questa immagine comparirà nella pagina pubblica accanto a <span className="font-semibold text-slate-900">Impianti della categoria</span>.
                  </p>
                </div>

                <div className="mt-4 rounded-[1.25rem] border border-slate-200 bg-white p-4">
                  <label className="inline-flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={structure.schedule.hide_future_phases_until_complete}
                      onChange={(e) => setStructure((current) => ({
                        ...current,
                        schedule: { ...current.schedule, hide_future_phases_until_complete: e.target.checked },
                      }))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">Mostra la fase successiva solo a fase precedente completata</span>
                      <span className="mt-1 block text-sm text-slate-600">Nella parte pubblica le fasi future restano nascoste finché tutte le partite della fase precedente non sono finali.</span>
                    </span>
                  </label>
                </div>

                <div className="mt-4 space-y-3">
                  {structure.schedule.playing_fields.map((playingField, index) => (
                    <div key={playingField.id} className="grid gap-3 rounded-[1.25rem] border border-slate-200 bg-white p-4 md:grid-cols-[minmax(0,1.2fr)_180px_140px_auto] md:items-end">
                      <FormField label={`Impianto ${index + 1}`}>
                        <input
                          list={`facilities-list-${ageGroup.id}`}
                          value={playingField.field_name}
                          onChange={(e) => updatePlayingField(index, { field_name: e.target.value })}
                          placeholder="Es. Stadio Carlo Montano"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </FormField>
                      <FormField label="Categoria campo" hint="Opzionale">
                        <input
                          value={playingField.category_label ?? ''}
                          onChange={(e) => updatePlayingField(index, { category_label: e.target.value })}
                          placeholder="Es. U8"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </FormField>
                      <FormField label="Campo" hint="Numero">
                        <input
                          type="number"
                          value={playingField.field_number ?? ''}
                          onChange={(e) => updatePlayingField(index, { field_number: e.target.value ? Number(e.target.value) : null })}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => removePlayingField(index)}
                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {structure.schedule.playing_fields.length === 0 && (
                    <div className="rounded-[1.25rem] border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                      Esempio: Impianto "Esempio" con Campi 1, 2 e 3 per giocare tre partite in contemporanea.
                    </div>
                  )}
                  <datalist id={`facilities-list-${ageGroup.id}`}>
                    {availableFacilities.map((facility) => (
                      <option key={facility.id} value={facility.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="mb-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Classifica e spareggi</p>
                    <p className="mt-1 text-base font-black text-slate-950">Punteggi e criteri in caso di parità</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Questo vale per i gironi. Qui imposti i controlli che regolano punti classifica e spareggi in caso di parità.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                      Ordine attuale: {formatTieBreakerSummary(scoringRules)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setRankingControlsOpen((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {rankingControlsOpen ? 'Nascondi controlli' : 'Mostra controlli'}
                    </button>
                  </div>
                </div>

                {rankingControlsOpen && (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                  <FormField label="Punti vittoria">
                    <input
                      type="number"
                      value={scoringRules.win_points}
                      onChange={(e) => setScoringRules((current) => ({ ...current, win_points: Number(e.target.value || 0) }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    />
                  </FormField>
                  <FormField label="Punti pareggio">
                    <input
                      type="number"
                      value={scoringRules.draw_points}
                      onChange={(e) => setScoringRules((current) => ({ ...current, draw_points: Number(e.target.value || 0) }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    />
                  </FormField>
                  <FormField label="Punti sconfitta">
                    <input
                      type="number"
                      value={scoringRules.loss_points}
                      onChange={(e) => setScoringRules((current) => ({ ...current, loss_points: Number(e.target.value || 0) }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                    />
                  </FormField>
                </div>

                    <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Ordine spareggi</p>
                      <p className="mt-1 text-sm text-slate-600">I punti restano sempre il primo criterio. Qui ordini solo gli spareggi successivi.</p>
                      <div className="mt-4 space-y-3">
                        {getTieBreakerCriteria(scoringRules).map((criterion, index) => {
                          const option = RANKING_CRITERIA_OPTIONS.find((item) => item.key === criterion)
                          if (!option) return null
                          return (
                            <div key={criterion} className="flex flex-col gap-3 rounded-[1.15rem] border border-slate-200 bg-slate-50 p-3 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-sm font-bold text-slate-900">{index + 1}. {option.label}</p>
                                <p className="mt-1 text-sm text-slate-600">{option.description}</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateRankingCriterionOrder(index, -1)}
                                  disabled={index === 0}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Su
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateRankingCriterionOrder(index, 1)}
                                  disabled={index === getTieBreakerCriteria(scoringRules).length - 1}
                                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Giù
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-4 rounded-[1.1rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Il criterio “squadra più distante” usa la città della squadra e la sede del torneo per stimare i km. Se una città non è riconosciuta, quel criterio viene ignorato per quella parità.
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </div>
              )}
              {saveError && (
                <div className="mt-4 rounded-[1.3rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {saveError}
                </div>
              )}

              {saveMessage && (
                <div className="mt-4 rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {saveMessage}
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="mt-4 rounded-[1.4rem] border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Per generare il programma manca ancora questo</p>
                  <div className="mt-2 space-y-1 text-sm text-amber-800">
                    {validationErrors.map((error) => (
                      <p key={error}>• {error}</p>
                    ))}
                  </div>
                </div>
              )}

              {isGathering && structure.phases.some((phase) => phase.phase_type === 'KNOCKOUT') && (
                <div className="mt-4 rounded-[1.4rem] border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900">
                  Hai inserito una fase a eliminazione in un raggruppamento. È consentito, ma di solito i raggruppamenti si fermano ai gironi.
                </div>
              )}

              {isPhasesStep && (
              <>
              <div className="mt-5">
                <StructurePreviewCard
                  structure={structure}
                  participantCount={participants?.length ?? 0}
                  isOpen={previewOpen}
                  onToggle={() => setPreviewOpen((current) => !current)}
                />
              </div>

              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-3 rounded-[1.3rem] border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Fasi e schema</p>
                    <p className="mt-1 text-sm text-slate-600">Qui definisci gironi, andata/ritorno, passaggi turno e tabelloni finali.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addPhase}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    <Plus className="h-4 w-4" />
                    Aggiungi fase
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {structure.phases.map((phase, index) => (
                    <button
                      key={phase.id}
                      type="button"
                      onClick={() => setActivePhaseId(phase.id)}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                        activePhaseId === phase.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span>{phase.name || `Fase ${index + 1}`}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                            activePhaseId === phase.id
                              ? 'bg-white/15 text-white'
                              : phase.phase_type === 'GROUP_STAGE'
                                ? 'bg-sky-100 text-sky-700'
                                : 'bg-rose-100 text-rose-700'
                          }`}>
                            {phase.phase_type === 'GROUP_STAGE' ? 'Gironi' : 'Eliminazione'}
                          </span>
                          {isConclusivePhase(structure, phase.id) && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                              activePhaseId === phase.id ? 'bg-amber-200/20 text-amber-100' : 'bg-amber-100 text-amber-700'
                            }`}>
                              Conclusiva
                            </span>
                          )}
                        </div>
                        <p className={`mt-1 text-xs font-medium ${
                          activePhaseId === phase.id ? 'text-slate-200' : 'text-slate-500'
                        }`}>
                          {phase.phase_date || 'Data da definire'} · {phase.start_time || 'Ora da definire'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {activePhase && (
                  <div key={activePhase.id} className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
                    <div className={`flex items-center justify-between gap-3 border-b px-4 py-3 ${
                      activePhase.phase_type === 'GROUP_STAGE'
                        ? 'border-sky-200 bg-sky-50'
                        : activePhase.bracket_mode === 'group_blocks'
                            ? 'border-violet-200 bg-violet-50'
                            : 'border-rose-200 bg-rose-50'
                    }`}>
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Fase {activePhaseIndex + 1}</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">{activePhase.name || `Fase ${activePhaseIndex + 1}`}</p>
                      </div>
                      {structure.phases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePhase(activePhaseIndex)}
                          className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="grid gap-4 p-4 lg:grid-cols-4">
                      <FormField label="Nome fase">
                        <input
                          value={activePhase.name}
                          onChange={(e) => setPhase(activePhaseIndex, { name: e.target.value })}
                          placeholder="es. Gironi iniziali"
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                        />
                      </FormField>
                      <FormField label="Tipo fase">
                        <select
                          value={activePhase.phase_type}
                          onChange={(e) => setPhase(activePhaseIndex, { phase_type: e.target.value as StructurePhase['phase_type'] })}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                        >
                          <option value="GROUP_STAGE">Gironi</option>
                          <option value="KNOCKOUT">Eliminazione</option>
                        </select>
                      </FormField>
                      <FormField label="Data inizio fase">
                        <input
                          type="date"
                          value={activePhase.phase_date}
                          onChange={(e) => setPhase(activePhaseIndex, { phase_date: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                        />
                      </FormField>
                      <FormField label="Ora inizio fase">
                        <input
                          type="time"
                          value={activePhase.start_time}
                          onChange={(e) => setPhase(activePhaseIndex, { start_time: e.target.value })}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                        />
                      </FormField>
                    </div>

                    <div className="grid gap-4 px-4 pb-4 lg:grid-cols-4">
                      <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Fine fase stimata</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {estimatePhaseEndTime(structure, activePhaseIndex, participants?.length ?? 0) ?? 'Da definire'}
                        </p>
                      </div>
                    </div>

                    <div className="px-4 pb-4">
                      {activePhase.phase_type === 'GROUP_STAGE' ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField label="Numero gironi">
                            <input
                              type="number"
                              value={phase.num_groups ?? ''}
                              onChange={(e) => setPhase(index, { num_groups: e.target.value ? Number(e.target.value) : null })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            />
                          </FormField>
                          <FormField label="Formato partite">
                            <select
                              value={phase.round_trip_mode}
                              onChange={(e) => setPhase(index, { round_trip_mode: e.target.value as StructurePhase['round_trip_mode'] })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            >
                              <option value="single">Solo andata</option>
                              <option value="double">Andata e ritorno</option>
                            </select>
                          </FormField>
                          <FormField label="Sfalza gironi" hint="I gironi giocano in sequenza: finito il turno A, gioca B — le squadre libere possono arbitrare">
                            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={phase.stagger_groups}
                                onChange={(e) => setPhase(index, { stagger_groups: e.target.checked })}
                                className="h-4 w-4 rounded border-slate-300 accent-rugby-green"
                              />
                              <span className="text-sm text-slate-700">Attiva sfalzamento gironi</span>
                            </label>
                          </FormField>
                          <FormField label="Max partite simultanee" hint="Limita quante partite possono giocarsi nello stesso momento (1 = mai in contemporanea, 2 = al massimo 2, vuoto = nessun limite)">
                            <select
                              value={phase.max_concurrent_matches ?? ''}
                              onChange={(e) => setPhase(index, { max_concurrent_matches: e.target.value ? Number(e.target.value) : null })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            >
                              <option value="">Nessun limite</option>
                              <option value="1">1 — mai in contemporanea</option>
                              <option value="2">2 — al massimo 2 in contemporanea</option>
                              <option value="3">3 — al massimo 3 in contemporanea</option>
                            </select>
                          </FormField>
                          <FormField label="Squadre per girone" hint="Es. 4,4,5">
                            <input
                              value={phase.group_sizes}
                              onChange={(e) => setPhase(index, { group_sizes: e.target.value })}
                              placeholder="4,4,5"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            />
                          </FormField>
                          <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Partite stimate</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">
                              {estimateGroupStageMatches(phase) ?? 0} incontri
                            </p>
                          </div>
                          {(phase.num_groups ?? 0) > 0 && (
                            <div className="sm:col-span-2">
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Nomi gironi (opzionale)</p>
                              <p className="mt-1 mb-3 text-xs text-slate-500">Lascia vuoto per usare Girone A, B, C… — I nomi personalizzati sostituiscono le etichette predefinite.</p>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {buildGroupNames(phase).map((defaultName, gi) => (
                                  <FormField key={gi} label={defaultName}>
                                    <input
                                      value={phase.group_custom_names?.[gi] ?? ''}
                                      onChange={(e) => {
                                        const names = [...(phase.group_custom_names ?? [])]
                                        while (names.length <= gi) names.push('')
                                        names[gi] = e.target.value
                                        setPhase(index, { group_custom_names: names })
                                      }}
                                      placeholder={defaultName}
                                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                                    />
                                  </FormField>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField label="Tipo eliminazione">
                            <select
                              value={phase.bracket_mode}
                              onChange={(e) => setPhase(index, { bracket_mode: e.target.value as StructurePhase['bracket_mode'] })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            >
                              <option value="standard">Diretta incrociata</option>
                              <option value="group_blocks">Blocchi di piazzamento</option>
                            </select>
                          </FormField>
                          <FormField label="Sviluppo fase">
                            <select
                              value={phase.knockout_progression}
                              onChange={(e) => setPhase(index, { knockout_progression: e.target.value as StructurePhase['knockout_progression'] })}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            >
                              <option value="full_bracket">La fase si chiude qui</option>
                              <option value="single_round">Solo un turno, poi nuove fasi</option>
                            </select>
                          </FormField>
                          <FormField label="Classifica assegnata da">
                            <input
                              type="number"
                              min="1"
                              value={phase.placement_start_rank ?? ''}
                              onChange={(e) => setPhase(index, { placement_start_rank: e.target.value ? Number(e.target.value) : null })}
                              placeholder="Es. 1 oppure 5"
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                            />
                          </FormField>
                          {phase.bracket_mode === 'group_blocks' && (
                            <FormField label="Dimensione blocco">
                              <select
                                value={phase.group_block_size ?? 4}
                                onChange={(e) => setPhase(index, { group_block_size: Number(e.target.value) })}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                              >
                                <option value={2}>Blocchi da 2 (solo finali)</option>
                                <option value={4}>Blocchi da 4</option>
                                <option value={8}>Blocchi da 8</option>
                                <option value={16}>Blocchi da 16</option>
                              </select>
                            </FormField>
                          )}
                          {phase.placement_start_rank && (
                            <div className="rounded-[1.2rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:col-span-2">
                              Questa fase parte dal {phase.placement_start_rank}° posto. Esempio: con 4 squadre assegnerà {phase.placement_start_rank}°-{phase.placement_start_rank + 3}°.
                            </div>
                          )}
                          {phase.bracket_mode === 'group_blocks' && (
                            <div className="rounded-[1.2rem] border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 sm:col-span-2">
                              Con 2 gironi crea blocchi da {phase.group_block_size ?? 4}: 1-4, 5-8, 9-12 e così via. Le ultime due partite dell'intera fase restano sempre finale 3/4 e finale 1/2 del blocco principale.
                            </div>
                          )}
                          {phase.knockout_progression === 'single_round' && (
                            <div className="rounded-[1.2rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:col-span-2">
                              Questa fase genera un solo turno. Poi puoi mandare vincenti e perdenti verso nuove fasi: semifinali, finale 1-2, finale 3-4, piazzamenti, altri gironi.
                            </div>
                          )}
                          {phase.knockout_progression === 'full_bracket' && (() => {
                            const linkedGroupStages = structure.phases.slice(0, index).filter((p) => p.phase_type === 'GROUP_STAGE' && p.advancement_routes.some((r) => r.target_phase_id === phase.id))
                            const totalSourceGroups = linkedGroupStages.reduce((total, p) => total + Math.max(p.num_groups ?? buildGroupNames(p).length, 0), 0)
                            const description = totalSourceGroups >= 2
                              ? `Le qualificate vengono incrociate tra coppie di gironi: 1° di un girone contro l'ultima dell'altro, 2° contro penultima, e così via. Con 2 squadre viene generata una finale secca.`
                              : `Le qualificate vengono abbinate per classifica: 1° contro ultima, 2° contro penultima. Con 4 squadre: semifinali (1°-4° e 2°-3°), finale 3°/4° e finale. Con 2 squadre: finale secca.`
                            return (
                              <div className="rounded-[1.2rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 sm:col-span-2">
                                {description}
                              </div>
                            )
                          })()}
                        </div>
                      )}

                      {/* Special duration override for the 1-2 final generated by this knockout phase */}
                      {activePhase.phase_type === 'KNOCKOUT' && (
                        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Durata speciale finale 1-2</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Lascia vuoto per usare la durata globale ({structure.schedule.match_duration_minutes ?? 12} min). Questo override si applica solo alla finale per il 1°-2° posto, non a semifinali, 3°-4° o altre partite.
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            <FormField label="N° tempi" hint="Es. 2">
                              <input
                                type="number"
                                min="1"
                                max="10"
                                value={activePhase.num_halves ?? ''}
                                onChange={(e) => setPhase(activePhaseIndex, { num_halves: e.target.value ? Number(e.target.value) : null })}
                                placeholder="–"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                              />
                            </FormField>
                            <FormField label="Durata per tempo" hint="Minuti">
                              <input
                                type="number"
                                min="1"
                                value={activePhase.half_duration_minutes ?? ''}
                                onChange={(e) => setPhase(activePhaseIndex, { half_duration_minutes: e.target.value ? Number(e.target.value) : null })}
                                placeholder="–"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                              />
                            </FormField>
                            <div className="flex flex-col justify-end">
                              {activePhase.num_halves && activePhase.half_duration_minutes ? (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">
                                  Totale: {activePhase.num_halves * activePhase.half_duration_minutes} min
                                </div>
                              ) : (
                                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-400">
                                  Totale: –
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {phase.phase_type === 'GROUP_STAGE' && structure.schedule.playing_fields.length > 0 && (
                        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Campi per girone</p>
                          <p className="mt-1 text-sm text-slate-600">Ogni girone giocherà sempre sui campi che selezioni qui.</p>
                          <div className="mt-4 space-y-3">
                            {buildGroupNames(phase).map((groupName) => {
                              const assignments = phase.group_field_assignments[groupName] ?? []
                              return (
                                <div key={`${phase.id}-${groupName}`} className="rounded-[1.15rem] border border-white bg-white p-3">
                                  <p className="text-sm font-bold text-slate-900">{groupName}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {structure.schedule.playing_fields.map((playingField) => {
                                      const selected = assignments.some((assignment) => (
                                        assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number
                                      ))
                                      return (
                                        <button
                                          key={`${groupName}-${playingField.field_name}-${playingField.field_number ?? 'x'}`}
                                          type="button"
                                          onClick={() => toggleGroupPlayingField(index, groupName, playingField)}
                                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                            selected
                                              ? 'bg-sky-700 text-white'
                                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                          }`}
                                        >
                                          {formatPlayingFieldLabel(playingField)}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {phase.phase_type === 'GROUP_STAGE' && !structure.phases.slice(0, index).some((p) => p.advancement_routes.some((r) => r.target_phase_id === phase.id)) && (
                        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Arbitraggio per girone</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Scegli da quali gironi arrivano gli arbitri. &ldquo;Stesso girone&rdquo; usa le squadre a riposo del girone stesso come arbitri principali.
                          </p>
                          <div className="mt-4 space-y-3">
                            {buildGroupNames(phase).map((groupName) => {
                              const selectedSources = phase.referee_group_assignments[groupName] ?? []
                              const otherGroupOptions = buildGroupNames(phase).filter((item) => item !== groupName)
                              const sameGroupSelected = selectedSources.includes(groupName)
                              return (
                                <div key={`${phase.id}-ref-${groupName}`} className="rounded-[1.15rem] border border-white bg-white p-3">
                                  <p className="text-sm font-bold text-slate-900">{groupName}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => toggleRefereeSourceGroup(index, groupName, groupName)}
                                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                        sameGroupSelected
                                          ? 'bg-amber-600 text-white'
                                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                      }`}
                                    >
                                      Stesso girone
                                    </button>
                                    {otherGroupOptions.map((sourceGroupName) => {
                                      const selected = selectedSources.includes(sourceGroupName)
                                      return (
                                        <button
                                          key={`${groupName}-${sourceGroupName}`}
                                          type="button"
                                          onClick={() => toggleRefereeSourceGroup(index, groupName, sourceGroupName)}
                                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                            selected
                                              ? 'bg-emerald-700 text-white'
                                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                          }`}
                                        >
                                          {sourceGroupName}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {phase.phase_type === 'GROUP_STAGE' && (
                        <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Fasi successive</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Qui scegli solo quali squadre passano. La fase collegata la configuri dopo.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => addAdvancementRoute(index)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                              >
                                <Plus className="h-4 w-4" />
                                Nuova fase
                              </button>
                              {(() => {
                                const existingTargets = structure.phases.filter(
                                  (p, pi) => pi > index && !phase.advancement_routes.some((r) => r.target_phase_id === p.id)
                                )
                                if (existingTargets.length === 0) return null
                                return (
                                  <select
                                    defaultValue=""
                                    onChange={(e) => { if (e.target.value) addAdvancementRouteToExisting(index, e.target.value) }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                  >
                                    <option value="" disabled>Collega a fase esistente…</option>
                                    {existingTargets.map((p) => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                            </div>
                          </div>

                          {phase.advancement_routes.length === 0 ? (
                            <div className="mt-4 rounded-[1.1rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                              Questa fase può chiudersi qui: nessuna squadra va avanti finché non aggiungi un instradamento.
                            </div>
                          ) : (
                          <div className="mt-4 space-y-3">
                              {phase.advancement_routes.map((route) => {
                                const targetPhase = structure.phases.find((candidate) => candidate.id === route.target_phase_id)
                                const sourceOrderPreview = describeRouteSourceEntries(phase, route)
                                return (
                                  <div key={route.id} className="rounded-[1.15rem] border border-slate-200 bg-slate-50 p-3">
                                    <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto] lg:items-end">
                                      <FormField label="Origine">
                                        <select
                                          value={route.source_mode}
                                          onChange={(e) => setAdvancementRoute(index, route.id, { source_mode: e.target.value as AdvancementRoute['source_mode'] })}
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                                        >
                                          <option value="group_rank">Piazzamenti dei gironi</option>
                                          <option value="best_extra">Migliori extra</option>
                                        </select>
                                      </FormField>
                                      <div className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Fase collegata</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{targetPhase?.name || 'Fase da creare'}</p>
                                        {targetPhase && (
                                          <button
                                            type="button"
                                            onClick={() => setActivePhaseId(targetPhase.id)}
                                            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                          >
                                            Apri fase
                                          </button>
                                        )}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeAdvancementRoute(index, route.id)}
                                        className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>

                                    {route.source_mode === 'group_rank' ? (
                                      <>
                                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                                          <FormField label="Dal piazzamento">
                                            <input
                                              type="number"
                                              value={route.rank_from ?? ''}
                                              onChange={(e) => setAdvancementRoute(index, route.id, { rank_from: e.target.value ? Number(e.target.value) : null })}
                                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                                            />
                                          </FormField>
                                          <FormField label="Al piazzamento">
                                            <input
                                              type="number"
                                              value={route.rank_to ?? ''}
                                              onChange={(e) => setAdvancementRoute(index, route.id, { rank_to: e.target.value ? Number(e.target.value) : null })}
                                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                                            />
                                          </FormField>
                                        </div>
                                        <div className="mt-3">
                                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Gironi sorgente</p>
                                          <p className="mt-1 text-sm text-slate-600">Se non selezioni nulla, il sistema prende tutti i gironi.</p>
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            {buildGroupNames(phase).map((groupName) => {
                                              const selected = route.source_groups.includes(groupName)
                                              return (
                                                <button
                                                  key={`${route.id}-${groupName}`}
                                                  type="button"
                                                  onClick={() => toggleAdvancementRouteGroup(index, route.id, groupName)}
                                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                    selected
                                                      ? 'bg-slate-900 text-white'
                                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                                  }`}
                                                >
                                                  {groupName}
                                                </button>
                                              )
                                            })}
                                          </div>
                                        </div>
                                        <div className="mt-3 rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                          Ordine posizionamenti generato: {sourceOrderPreview.length > 0 ? sourceOrderPreview.join(' → ') : 'da definire'}
                                        </div>
                                        {targetPhase?.phase_type === 'GROUP_STAGE' && sourceOrderPreview.length > 0 && (
                                          <GroupSeedingControl
                                            sourceEntries={sourceOrderPreview}
                                            targetNumGroups={targetPhase.num_groups ?? 1}
                                            targetSlots={route.target_slots}
                                            onChange={(slots) => setAdvancementRoute(index, route.id, { target_slots: slots })}
                                          />
                                        )}
                                      </>
                                    ) : (
                                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                                        <FormField label="Numero migliori extra">
                                          <input
                                            type="number"
                                            value={route.extra_count ?? ''}
                                            onChange={(e) => setAdvancementRoute(index, route.id, { extra_count: e.target.value ? Number(e.target.value) : null })}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                                          />
                                        </FormField>
                                      </div>
                                    )}
                                    <div className="mt-3 rounded-[1.1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                                      Più fasi possono convergere sulla stessa fase finale: collega anche un&apos;altra fase a questa stessa destinazione per creare una finale unica con ingressi multipli.
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {phase.phase_type === 'KNOCKOUT' && structure.schedule.playing_fields.length > 0 && (
                        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Campi della fase finale</p>
                          <p className="mt-1 text-sm text-slate-600">Puoi assegnare campi diversi rispetto ai gironi. Se non selezioni nulla, la fase userà tutti i campi disponibili.</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {structure.schedule.playing_fields.map((playingField) => {
                              const selected = phase.knockout_field_assignments.some((assignment) => (
                                assignment.field_name === playingField.field_name && assignment.field_number === playingField.field_number
                              ))
                              return (
                                <button
                                  key={`${phase.id}-ko-${playingField.field_name}-${playingField.field_number ?? 'x'}`}
                                  type="button"
                                  onClick={() => toggleKnockoutPlayingField(index, playingField)}
                                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    selected
                                      ? 'bg-violet-700 text-white'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {formatPlayingFieldLabel(playingField)}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {phase.phase_type === 'KNOCKOUT' && phase.knockout_progression === 'single_round' && (
                        <div className="mt-4 rounded-[1.3rem] border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Instradamento dopo il turno</p>
                              <p className="mt-1 text-sm text-slate-600">
                                Decidi dove vanno le vincenti e le perdenti di questo turno singolo.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => addAdvancementRoute(index)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                              >
                                <Plus className="h-4 w-4" />
                                Nuova fase
                              </button>
                              {(() => {
                                const existingTargets = structure.phases.filter(
                                  (p, pi) => pi > index && !phase.advancement_routes.some((r) => r.target_phase_id === p.id)
                                )
                                if (existingTargets.length === 0) return null
                                return (
                                  <select
                                    defaultValue=""
                                    onChange={(e) => { if (e.target.value) addAdvancementRouteToExisting(index, e.target.value) }}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                  >
                                    <option value="" disabled>Collega a fase esistente…</option>
                                    {existingTargets.map((p) => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                            </div>
                          </div>

                          {phase.advancement_routes.length === 0 ? (
                            <div className="mt-4 rounded-[1.1rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                              Se lasci vuoto, il turno si chiude qui.
                            </div>
                          ) : (
                            <div className="mt-4 space-y-3">
                              {phase.advancement_routes.map((route) => {
                                const targetPhase = structure.phases.find((candidate) => candidate.id === route.target_phase_id)
                                return (
                                  <div key={route.id} className="rounded-[1.15rem] border border-slate-200 bg-white p-3">
                                    <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_auto] lg:items-end">
                                      <FormField label="Chi va avanti">
                                        <select
                                          value={route.source_mode}
                                          onChange={(e) => setAdvancementRoute(index, route.id, { source_mode: e.target.value as AdvancementRoute['source_mode'] })}
                                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                                        >
                                          <option value="knockout_winner">Vincenti del turno</option>
                                          <option value="knockout_loser">Perdenti del turno</option>
                                        </select>
                                      </FormField>
                                      <div className="rounded-[1.1rem] border border-slate-200 bg-slate-50 px-4 py-3">
                                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Fase collegata</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-900">{targetPhase?.name || 'Fase da creare'}</p>
                                        {targetPhase && (
                                          <button
                                            type="button"
                                            onClick={() => setActivePhaseId(targetPhase.id)}
                                            className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                                          >
                                            Apri fase
                                          </button>
                                        )}
                                      </div>
                                    <button
                                      type="button"
                                      onClick={() => removeAdvancementRoute(index, route.id)}
                                      className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                    </div>
                                    <div className="mt-3 rounded-[1.1rem] border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                                      Se vuoi una finale unica dopo due semifinali o due fasi distinte, instrada entrambe verso la stessa fase successiva.
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4">
                        <FormField label="Note fase" hint="Seeding, piazzamenti, eccezioni">
                          <textarea
                            value={phase.notes}
                            onChange={(e) => setPhase(index, { notes: e.target.value })}
                            rows={2}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                          />
                        </FormField>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <FormField label="Note generali formula">
                  <textarea
                    value={structure.notes}
                    onChange={(e) => setStructure((current) => ({ ...current, notes: e.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                  />
                </FormField>
              </div>
              </>
              )}

              {false && <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-base font-black text-slate-950">Salva come template</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">Riutilizza questa formula su altri tornei e altre categorie, senza squadre ma con struttura e passaggi.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <FormField label="Nome template">
                    <input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Es. Girone unico 4 squadre andata/ritorno"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                    />
                  </FormField>
                  <FormField label="Descrizione breve">
                    <input
                      value={templateDescription}
                      onChange={(e) => setTemplateDescription(e.target.value)}
                      placeholder="Template di prova"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                    />
                  </FormField>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveAsTemplate()}
                  disabled={!templateName.trim() || createTemplate.isPending}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-white disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  Salva template
                </button>
              </div>}

            </div>
          </section>
          )}

          {currentTab === 'squadre' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Passo 1</p>
                    <p className="mt-1 text-lg font-black text-slate-950">Squadre partecipanti</p>
                  </div>
                </div>
                <div className="w-full max-w-sm">
                  <FormField label="Quante squadre partecipano?" hint="Numero esatto da raggiungere prima di passare alla formula">
                    <input
                      type="number"
                      value={structure.expected_teams ?? ''}
                      onChange={(e) => setStructure((current) => ({ ...current, expected_teams: e.target.value ? Number(e.target.value) : null }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                    />
                  </FormField>
                </div>
              </div>
            </div>

            <div className="px-5 py-5">
              <div className={`flex flex-col gap-3 rounded-xl border px-4 py-4 lg:flex-row lg:items-center lg:justify-between ${
                remainingSlots === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
              }`}>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Stato inserimento</p>
                  <p className={`mt-1 text-sm font-semibold ${remainingSlots === 0 ? 'text-emerald-900' : 'text-amber-900'}`}>
                    {remainingSlots === 0 ? 'Il numero squadre coincide. Puoi passare alla formula.' : 'Completa prima l’elenco squadre della categoria.'}
                  </p>
                  <p className={`mt-1 text-sm ${remainingSlots === 0 ? 'text-emerald-800' : 'text-amber-800'}`}>
                    Attese {structure.expected_teams ?? '?'} / inserite {participants?.length ?? 0}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onStepChange?.('impostazioni')}
                  disabled={remainingSlots !== 0}
                  className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {teamError && (
                <div className="mt-4 rounded-[1.3rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {teamError}
                </div>
              )}

              {teamMessage && (
                <div className="mt-4 rounded-[1.3rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {teamMessage}
                </div>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-900">Aggiungi squadra esistente</p>
                  <p className="mt-1 text-sm text-slate-500">Usa una squadra già creata per questo torneo.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <FormField label="Squadra disponibile">
                      <select
                        value={selectedTeamId}
                        onChange={(e) => setSelectedTeamId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                      >
                        <option value="">Seleziona squadra</option>
                        {availableTeams.map((team) => (
                          <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <button
                      type="button"
                      onClick={() => void handleAddTeam()}
                      disabled={!selectedTeamId || enrollTeam.isPending}
                      className="self-end rounded-xl bg-rugby-green px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rugby-green-dark disabled:opacity-50"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-900">Crea nuova squadra</p>
                  <p className="mt-1 text-sm text-slate-500">Per esempio Rugby Livorno 1, Rugby Livorno 2, Verdi o Bianchi.</p>
                  <div className="mt-4 grid gap-3">
                    <FormField label="Società">
                      <select
                        value={selectedOrganizationId}
                        onChange={(e) => setSelectedOrganizationId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                      >
                        <option value="">Seleziona società</option>
                        {availableOrganizations.map((organization) => (
                          <option key={organization.id} value={organization.id}>{organization.name}</option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="Nome squadra" hint="Es. Rugby Livorno 1">
                      <input
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        placeholder="Rugby Livorno 1"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                      />
                    </FormField>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                      <FormField label="Nome breve" hint="Opzionale, es. RL1">
                        <input
                          value={newTeamShortName}
                          onChange={(e) => setNewTeamShortName(e.target.value)}
                          placeholder="RL1"
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-rugby-green"
                        />
                      </FormField>
                      <button
                        type="button"
                        onClick={() => void handleCreateTeamFromOrganization()}
                        disabled={!selectedOrganizationId || !newTeamName.trim() || createTeam.isPending || enrollTeam.isPending}
                        className="self-end rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
                      >
                        {createTeam.isPending || enrollTeam.isPending ? 'Creazione...' : 'Crea e aggiungi'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {participants && participants.length > 0 ? participants.map((participant) => (
                  <div key={participant.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        {editingTeamId === participant.team_id ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <input
                              value={editingTeamName}
                              onChange={(e) => setEditingTeamName(e.target.value)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                            />
                            <input
                              value={editingTeamShortName}
                              onChange={(e) => setEditingTeamShortName(e.target.value)}
                              placeholder="Nome breve"
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{participant.team_name}</p>
                              {participant.team_short_name && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                  {participant.team_short_name}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                              <span>{participant.organization_name || 'Società'}</span>
                              {participant.city && <span>· {participant.city}</span>}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editingTeamId !== participant.team_id && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTeamId(participant.team_id)
                              setEditingTeamName(participant.team_name)
                              setEditingTeamShortName(participant.team_short_name ?? '')
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                          >
                            <Pencil className="h-4 w-4" />
                            Modifica
                          </button>
                        )}
                        {editingTeamId === participant.team_id && (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleUpdateParticipantTeam(participant.team_id)}
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
                            >
                              <Save className="h-4 w-4" />
                              Salva
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeamId('')
                                setEditingTeamName('')
                                setEditingTeamShortName('')
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                            >
                              Annulla
                            </button>
                          </>
                        )}
                        {confirmingParticipantId === participant.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleRemoveParticipant(participant)}
                              disabled={unenrollTeam.isPending}
                              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Conferma rimozione
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmingParticipantId(null)}
                              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              Annulla
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmingParticipantId(participant.id)}
                            disabled={unenrollTeam.isPending}
                            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
                          >
                            <Trash2 className="h-4 w-4" />
                            Cancella squadra
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Nessuna squadra assegnata alla categoria.
                  </div>
                )}
              </div>
            </div>
          </section>
          )}

          {currentTab === 'partite' && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Passo 4</p>
              <p className="mt-1 text-lg font-black text-slate-950">Modifica partite</p>
              <p className="mt-1 text-sm text-slate-600">Modifica orario e squadre di ogni singola partita generata.</p>
            </div>
            <div className="p-5">
              {program ? (
                <AdminAllMatchesEditorView
                  program={program}
                  playingFields={structure.schedule.playing_fields}
                  participants={participants ?? []}
                  matchDurationMinutes={structure.schedule.match_duration_minutes ?? 12}
                  intervalMinutes={structure.schedule.interval_minutes ?? 8}
                />
              ) : (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                  Genera prima il programma dalla tab Fasi.
                </div>
              )}
            </div>
          </section>
          )}

        </div>
      </div>
    </div>
  )
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      {hint && <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span>}
      <div className="mt-2">{children}</div>
    </label>
  )
}

function VisualTemplateMini({ config }: { config: StructureConfig }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {config.phases.map((phase, index) => (
        <div key={phase.id} className="flex items-center gap-2">
          <div className={`min-w-[118px] rounded-2xl border px-3 py-2 ${
            phase.phase_type === 'GROUP_STAGE'
              ? 'border-sky-200 bg-sky-50'
              : phase.bracket_mode === 'group_blocks'
                  ? 'border-violet-200 bg-violet-50'
                : 'border-rose-200 bg-rose-50'
          }`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {phase.phase_type === 'GROUP_STAGE' ? 'Gironi' : phase.bracket_mode === 'group_blocks' ? 'Blocchi' : 'Diretta'}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{phase.name}</p>
          </div>
          {index < config.phases.length - 1 && (
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" />
          )}
        </div>
      ))}
      </div>
      <div className="space-y-2">
        {config.phases.map((phase, index) => {
          const labels = describePhaseRoutes(config, phase)
          if (labels.length === 0) return null
          return (
            <div key={`${phase.id}-routes`} className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{`Fase ${index + 1}`}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {labels.map((label) => (
                  <span key={label} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function parseGroupSizes(input: string): number[] {
  return input
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function buildGroupNames(phase: StructurePhase): string[] {
  const sizes = parseGroupSizes(phase.group_sizes)
  const groupsCount = Math.max(phase.num_groups ?? sizes.length, sizes.length, 1)
  return Array.from({ length: groupsCount }, (_, index) => {
    const custom = phase.group_custom_names?.[index]?.trim()
    return custom || `Girone ${String.fromCharCode(65 + index)}`
  })
}

function buildAutoGroupFieldAssignments(
  phase: StructurePhase,
  playingFields: PlayingFieldConfig[],
): Record<string, PlayingFieldConfig[]> {
  const groupNames = buildGroupNames(phase)
  if (groupNames.length === 0 || playingFields.length === 0) return phase.group_field_assignments

  const fieldsPerGroup = Math.max(Math.floor(playingFields.length / groupNames.length), 1)
  const nextAssignments: Record<string, PlayingFieldConfig[]> = { ...phase.group_field_assignments }
  const allowedFieldKeys = new Set(
    playingFields.map((field) => `${field.field_name}::${field.field_number ?? ''}`),
  )

  groupNames.forEach((groupName, groupIndex) => {
    const existingAssignments = (nextAssignments[groupName] ?? []).filter((assignment) => (
      allowedFieldKeys.has(`${assignment.field_name}::${assignment.field_number ?? ''}`)
    ))
    if (existingAssignments.length > 0) {
      nextAssignments[groupName] = existingAssignments
      return
    }

    const start = groupIndex * fieldsPerGroup
    const end = start + fieldsPerGroup
    const assignedFields = playingFields.slice(start, end)
    nextAssignments[groupName] = assignedFields.length > 0
      ? assignedFields
      : [playingFields[Math.min(groupIndex, playingFields.length - 1)]]
  })

  return nextAssignments
}

function filterAssignmentsToPlayingFields(
  assignments: PlayingFieldConfig[],
  playingFields: PlayingFieldConfig[],
): PlayingFieldConfig[] {
  const allowedFieldKeys = new Set(
    playingFields.map((field) => `${field.field_name}::${field.field_number ?? ''}`),
  )
  return assignments.filter((assignment) => (
    allowedFieldKeys.has(`${assignment.field_name}::${assignment.field_number ?? ''}`)
  ))
}

function formatPlayingFieldLabel(field: Pick<PlayingFieldConfig, 'field_name' | 'field_number' | 'category_label'>) {
  const parts = [field.field_name]
  if (field.category_label?.trim()) parts.push(field.category_label.trim())
  if (field.field_number) parts.push(`Campo ${field.field_number}`)
  return parts.filter(Boolean).join(' · ')
}

function estimatePhaseMatches(phase: StructurePhase): number {
  if (phase.phase_type === 'GROUP_STAGE') return estimateGroupStageMatches(phase) ?? 0
  return estimateKnockoutMatches(phase)
}

function estimateKnockoutMatches(phase: StructurePhase): number {
  if (phase.phase_type !== 'KNOCKOUT') return 0
  if (phase.bracket_mode === 'group_blocks') {
    const sizes = parseGroupSizes(phase.group_sizes)
    return sizes.reduce((total, size) => total + (size >= 4 ? 4 : size === 2 ? 1 : 0), 0)
  }
  if (phase.knockout_progression === 'single_round') {
    const entrants = Math.max(parseGroupSizes(phase.group_sizes).reduce((sum, value) => sum + value, 0), 0)
    return entrants > 1 ? Math.ceil(_nextPowerOfTwoUi(entrants) / 2) : 0
  }
  return 0
}

function _nextPowerOfTwoUi(value: number): number {
  if (value <= 1) return 1
  return 2 ** Math.ceil(Math.log2(value))
}

function _isPowerOfTwoUi(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0
}

function estimateSuggestedPhaseStart(
  structure: StructureConfig,
  phaseIndex: number,
  participantCount: number,
): { date: string; time: string } | null {
  const slotMinutes = Math.max((structure.schedule.match_duration_minutes ?? 0), 1) + Math.max((structure.schedule.interval_minutes ?? 0), 0)
  const sourcePhase = structure.phases[phaseIndex]
  if (!sourcePhase) return null

  const sourceDate = sourcePhase.phase_date || ''
  const sourceEndTime = estimatePhaseEndTime(structure, phaseIndex, participantCount)
  if (!sourceDate || !sourceEndTime) return null

  const siblingOffset = Math.max((sourcePhase.advancement_routes.length ?? 0), 0) * slotMinutes
  const [hours, minutes] = sourceEndTime.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  const totalMinutes = (hours * 60) + minutes + siblingOffset
  const normalizedHours = Math.floor(totalMinutes / 60)
  const normalizedMinutes = totalMinutes % 60
  return {
    date: sourceDate,
    time: `${String(normalizedHours).padStart(2, '0')}:${String(normalizedMinutes).padStart(2, '0')}`,
  }
}

function estimatePhaseEndTime(structure: StructureConfig, phaseIndex: number, participantCount: number): string | null {
  const phase = structure.phases[phaseIndex]
  if (!phase) return null
  const slotMinutes = Math.max((structure.schedule.match_duration_minutes ?? 0), 1) + Math.max((structure.schedule.interval_minutes ?? 0), 0)
  if (slotMinutes <= 0) return null
  const predecessorIndexes = structure.phases
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidate }) => candidate.advancement_routes.some((route) => route.target_phase_id === phase.id))
    .map(({ candidateIndex }) => candidateIndex)

  const fallbackStart = predecessorIndexes.length > 0
    ? predecessorIndexes
      .map((predecessorIndex) => estimatePhaseEndTime(structure, predecessorIndex, participantCount))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right))
      .slice(-1)[0] ?? structure.schedule.start_time
    : phaseIndex === 0
      ? structure.schedule.start_time
      : (estimatePhaseEndTime(structure, phaseIndex - 1, participantCount) ?? structure.schedule.start_time)
  const startTime = phase.start_time || fallbackStart
  if (!startTime) return null
  const [hours, minutes] = startTime.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  const totalParticipants = phase.phase_type === 'GROUP_STAGE'
    ? participantCount
    : estimateKnockoutParticipants(structure, phase, participantCount)
  const estimatedMatches = phase.phase_type === 'KNOCKOUT' && phase.bracket_mode !== 'group_blocks'
    ? Math.max(totalParticipants > 1 ? totalParticipants - 1 : 0, 0)
    : estimatePhaseMatches(phase)
  const lanes = phase.phase_type === 'KNOCKOUT'
    ? Math.max(phase.knockout_field_assignments.length || structure.schedule.playing_fields.length, 1)
    : Math.max(getPhaseLaneCount(phase, structure.schedule.playing_fields.length), 1)
  const slotCount = estimatedMatches > 0 ? Math.ceil(estimatedMatches / lanes) : 0
  const endMinutes = (hours * 60) + minutes + (slotCount * slotMinutes)
  const normalizedHours = Math.floor(endMinutes / 60)
  const normalizedMinutes = endMinutes % 60
  return `${String(normalizedHours).padStart(2, '0')}:${String(normalizedMinutes).padStart(2, '0')}`
}

function estimateKnockoutParticipants(
  structure: StructureConfig,
  phase: StructurePhase,
  fallbackParticipantCount: number,
): number {
  // Iterate by source phase so we can fall back to that phase's num_groups when
  // source_groups has not yet been configured on the route.
  const targetSlots = structure.phases.reduce((total, sourcePhase) => {
    const routes = sourcePhase.advancement_routes.filter((route) => route.target_phase_id === phase.id)
    return routes.reduce((subtotal, route) => {
      const explicitSlots = route.target_slots.filter((slot) => slot.trim().length > 0).length
      if (explicitSlots > 0) return subtotal + explicitSlots
      if (route.source_mode === 'best_extra') return subtotal + Math.max(route.extra_count ?? 0, 0)
      if (route.source_mode === 'group_rank') {
        const rankFrom = route.rank_from ?? 0
        const rankTo = route.rank_to ?? 0
        if (rankFrom <= 0 || rankTo < rankFrom) return subtotal
        // When no specific source groups are selected, use all groups from the source phase.
        const groupCount = route.source_groups.length > 0
          ? route.source_groups.length
          : Math.max(sourcePhase.num_groups ?? 0, parseGroupSizes(sourcePhase.group_sizes).length, 0)
        if (groupCount <= 0) return subtotal
        return subtotal + (groupCount * ((rankTo - rankFrom) + 1))
      }
      return subtotal
    }, total)
  }, 0)

  if (targetSlots > 0) return targetSlots

  const configuredGroupSize = Math.max(parseGroupSizes(phase.group_sizes).reduce((sum, value) => sum + value, 0), 0)
  return configuredGroupSize > 0 ? configuredGroupSize : fallbackParticipantCount
}

function getPhaseLaneCount(phase: StructurePhase, fallbackLaneCount: number): number {
  if (phase.phase_type === 'KNOCKOUT') return phase.knockout_field_assignments.length || fallbackLaneCount
  const assignedLaneKeys = new Set(
    Object.values(phase.group_field_assignments)
      .flat()
      .map((assignment) => `${assignment.field_name}:${assignment.field_number ?? ''}`),
  )
  return assignedLaneKeys.size || fallbackLaneCount
}

function buildAutoRefereeAssignments(
  phase: StructurePhase,
): Record<string, string[]> {
  const groupNames = buildGroupNames(phase)
  if (groupNames.length === 0) return phase.referee_group_assignments

  const nextAssignments: Record<string, string[]> = { ...phase.referee_group_assignments }
  groupNames.forEach((groupName) => {
    const existingAssignments = nextAssignments[groupName] ?? []
    if (existingAssignments.length > 0) return
    nextAssignments[groupName] = groupNames.filter((item) => item !== groupName)
  })
  return nextAssignments
}

function estimateGroupStageMatches(phase: StructurePhase): number | null {
  if (phase.phase_type !== 'GROUP_STAGE') return null
  const sizes = parseGroupSizes(phase.group_sizes)
  const inferredGroupCount = Math.max(phase.num_groups ?? sizes.length, sizes.length, 0)
  if (inferredGroupCount === 0) return null

  const normalizedSizes = sizes.length > 0
    ? sizes
    : Array.from({ length: inferredGroupCount }, () => 0)

  const baseMatches = normalizedSizes.reduce((total, size) => total + ((size * (size - 1)) / 2), 0)
  return phase.round_trip_mode === 'double' ? baseMatches * 2 : baseMatches
}

function buildGenerationReadiness(
  structure: StructureConfig,
  participantCount: number,
  validationErrors: string[],
  isDirty: boolean,
) {
  const blockers = [...validationErrors]
  const warnings: string[] = []

  if (isDirty) {
    blockers.unshift('Salva la configurazione prima di generare le partite.')
  }

  if (participantCount < 2) {
    blockers.push('Servono almeno 2 squadre partecipanti nella categoria.')
  }

  if (structure.expected_teams !== null && participantCount !== structure.expected_teams) {
    blockers.push(`Hai ${participantCount} squadre inserite ma ne hai previste ${structure.expected_teams}.`)
  }

  const hasFormula = structure.phases.length > 0
  if (!hasFormula) {
    blockers.push('Definisci almeno una fase della formula.')
  }

  return {
    blockers,
    warnings,
    isReady: blockers.length === 0,
  }
}

function serializeStructureForComparison(structure: StructureConfig) {
  return JSON.stringify({
    expected_teams: structure.expected_teams,
    notes: structure.notes,
    schedule: {
      start_time: structure.schedule.start_time,
      match_duration_minutes: structure.schedule.match_duration_minutes,
      interval_minutes: structure.schedule.interval_minutes,
      hide_future_phases_until_complete: structure.schedule.hide_future_phases_until_complete,
      playing_fields: structure.schedule.playing_fields.map((field) => ({
        field_name: field.field_name,
        category_label: field.category_label ?? '',
        field_number: field.field_number,
      })),
    },
    phases: structure.phases.map((phase) => ({
      name: phase.name,
      phase_type: phase.phase_type,
      phase_date: phase.phase_date,
      start_time: phase.start_time,
      placement_start_rank: phase.placement_start_rank,
      group_block_size: phase.group_block_size,
      round_trip_mode: phase.round_trip_mode,
      stagger_groups: phase.stagger_groups,
      max_concurrent_matches: phase.max_concurrent_matches,
      num_halves: phase.num_halves,
      half_duration_minutes: phase.half_duration_minutes,
      knockout_progression: phase.knockout_progression,
      num_groups: phase.num_groups,
      group_sizes: phase.group_sizes,
      group_custom_names: phase.group_custom_names,
      qualifiers_per_group: phase.qualifiers_per_group,
      best_extra_teams: phase.best_extra_teams,
      next_phase_type: phase.next_phase_type,
      advancement_routes: phase.advancement_routes.map((route) => ({
        target_phase_id: route.target_phase_id,
        source_mode: route.source_mode,
        source_groups: route.source_groups,
        rank_from: route.rank_from,
        rank_to: route.rank_to,
        extra_count: route.extra_count,
        target_slots: route.target_slots,
      })),
      bracket_mode: phase.bracket_mode,
      notes: phase.notes,
      group_field_assignments: phase.group_field_assignments,
      knockout_field_assignments: phase.knockout_field_assignments.map((field) => ({
        field_name: field.field_name,
        category_label: field.category_label ?? '',
        field_number: field.field_number,
      })),
      referee_group_assignments: phase.referee_group_assignments,
    })),
  })
}

function normalizeScoringRules(value: unknown): AgeGroupScoringRules {
  const input = (value && typeof value === 'object') ? value as Partial<AgeGroupScoringRules> : {}
  return {
    win_points: typeof input.win_points === 'number' ? input.win_points : DEFAULT_SCORING_RULES.win_points,
    draw_points: typeof input.draw_points === 'number' ? input.draw_points : DEFAULT_SCORING_RULES.draw_points,
    loss_points: typeof input.loss_points === 'number' ? input.loss_points : DEFAULT_SCORING_RULES.loss_points,
    try_bonus: typeof input.try_bonus === 'boolean' ? input.try_bonus : DEFAULT_SCORING_RULES.try_bonus,
    bonus_threshold: typeof input.bonus_threshold === 'number' ? input.bonus_threshold : DEFAULT_SCORING_RULES.bonus_threshold,
    ranking_criteria: normalizeRankingCriteria(input.ranking_criteria),
  }
}

function normalizeRankingCriteria(value: unknown): string[] {
  const tieBreakers = Array.isArray(value)
    ? value.filter((criterion): criterion is RankingCriterionKey => (
      typeof criterion === 'string'
      && criterion !== 'points'
      && RANKING_CRITERIA_OPTIONS.some((option) => option.key === criterion)
    ))
    : []
  const ordered = tieBreakers.length > 0
    ? tieBreakers
    : DEFAULT_SCORING_RULES.ranking_criteria.filter((criterion) => criterion !== 'points') as RankingCriterionKey[]
  return ['points', ...ordered]
}

function getTieBreakerCriteria(scoringRules: AgeGroupScoringRules): RankingCriterionKey[] {
  return scoringRules.ranking_criteria
    .filter((criterion): criterion is RankingCriterionKey => criterion !== 'points' && RANKING_CRITERIA_OPTIONS.some((option) => option.key === criterion))
}

function serializeScoringRules(scoringRules: AgeGroupScoringRules) {
  return JSON.stringify({
    win_points: scoringRules.win_points,
    draw_points: scoringRules.draw_points,
    loss_points: scoringRules.loss_points,
    ranking_criteria: normalizeRankingCriteria(scoringRules.ranking_criteria),
  })
}

function formatTieBreakerSummary(scoringRules: AgeGroupScoringRules): string {
  return getTieBreakerCriteria(scoringRules)
    .map((criterion) => RANKING_CRITERIA_OPTIONS.find((option) => option.key === criterion)?.label ?? criterion)
    .join(' → ')
}

function validateStructureConfig(structure: StructureConfig): string[] {
  const errors: string[] = []

  if (structure.expected_teams === null) {
    errors.push('Indica quante squadre partecipano alla categoria.')
  }

  if (structure.expected_teams !== null && structure.expected_teams <= 0) {
    errors.push('Il numero squadre atteso deve essere maggiore di zero.')
  }

  if ((structure.schedule.match_duration_minutes ?? 0) <= 0) {
    errors.push('La durata incontro deve essere maggiore di zero.')
  }

  if ((structure.schedule.interval_minutes ?? -1) < 0) {
    errors.push('L’intervallo tra incontri non può essere negativo.')
  }

  if (structure.schedule.playing_fields.length === 0) {
    errors.push('Definisci almeno un campo di gioco per la categoria.')
  }

  const duplicateFieldKeys = new Set<string>()
  for (const playingField of structure.schedule.playing_fields) {
    if (!playingField.field_name.trim()) {
      errors.push('Ogni campo di gioco deve avere un impianto selezionato.')
      continue
    }
    if (!playingField.field_number || playingField.field_number <= 0) {
      errors.push('Ogni campo di gioco deve avere un numero campo valido.')
      continue
    }
    const key = `${playingField.field_name}::${playingField.field_number}`
    if (duplicateFieldKeys.has(key)) {
      errors.push(`Il campo ${playingField.field_name} ${playingField.field_number} è duplicato.`)
    }
    duplicateFieldKeys.add(key)
  }

  structure.phases.forEach((phase, index) => {
    const phaseLabel = `Fase ${index + 1}`
    if (!phase.name.trim()) {
      errors.push(`${phaseLabel}: inserisci un nome fase.`)
    }

    if (!phase.phase_date) {
      errors.push(`${phaseLabel}: inserisci la data di inizio fase.`)
    }

    if (!phase.start_time) {
      errors.push(`${phaseLabel}: inserisci l’orario di inizio fase.`)
    }

    if (phase.phase_type === 'GROUP_STAGE') {
      const groupSizes = parseGroupSizes(phase.group_sizes)
      const totalTeamsInGroups = groupSizes.reduce((sum, size) => sum + size, 0)
      const expectedIncomingTeams = estimateIncomingTeamsForPhase(structure, index)
      const laterPhases = structure.phases.slice(index + 1)
      const hasExplicitGroupSizes = phase.group_sizes.trim().length > 0
      const hasValidGroupSizesCount = !hasExplicitGroupSizes || !phase.num_groups || groupSizes.length === phase.num_groups

      if (!phase.num_groups || phase.num_groups <= 0) {
        errors.push(`${phaseLabel}: il numero gironi deve essere maggiore di zero.`)
      }

      if (!phase.round_trip_mode) {
        errors.push(`${phaseLabel}: scegli se giocare solo andata o andata e ritorno.`)
      }

      if (hasExplicitGroupSizes && phase.num_groups && groupSizes.length !== phase.num_groups) {
        errors.push(`${phaseLabel}: il numero di valori in "squadre per girone" deve coincidere con i gironi.`)
      }

      if (
        hasValidGroupSizesCount
        && expectedIncomingTeams !== null
        && totalTeamsInGroups > 0
        && totalTeamsInGroups !== expectedIncomingTeams
      ) {
        errors.push(`${phaseLabel}: la somma delle squadre per girone deve essere ${expectedIncomingTeams}.`)
      }

      const groupNames = buildGroupNames(phase)
      const receivesFromPreviousPhase = structure.phases.slice(0, index).some((p) => p.advancement_routes.some((r) => r.target_phase_id === phase.id))
      for (const groupName of groupNames) {
        const refereeAssignments = phase.referee_group_assignments[groupName] ?? []
        const hasAnyRefereeSource = refereeAssignments.length > 0
        if (!receivesFromPreviousPhase && groupNames.length > 1 && !hasAnyRefereeSource) {
          errors.push(`${phaseLabel}: assegna almeno una fonte arbitri a ${groupName} (stesso girone o un altro girone).`)
        }
      }

      const usedTargetPhases = new Set<string>()
      for (const route of phase.advancement_routes) {
        const targetPhase = laterPhases.find((candidate) => candidate.id === route.target_phase_id)
        if (!targetPhase) {
          errors.push(`${phaseLabel}: ogni instradamento deve puntare a una fase successiva.`)
          continue
        }
        if (route.source_mode === 'group_rank') {
          if (!route.rank_from || !route.rank_to || route.rank_from <= 0 || route.rank_to < route.rank_from) {
            errors.push(`${phaseLabel}: ogni instradamento per piazzamento deve avere un intervallo valido.`)
          }
          if (groupSizes.length > 0 && route.rank_to && route.rank_to > Math.max(...groupSizes)) {
            errors.push(`${phaseLabel}: un instradamento supera il numero di squadre presenti nei gironi.`)
          }
        }
        if (route.source_mode === 'best_extra' && (!route.extra_count || route.extra_count <= 0)) {
          errors.push(`${phaseLabel}: indica quante migliori extra vuoi instradare.`)
        }
        if (usedTargetPhases.has(targetPhase.id)) {
          errors.push(`${phaseLabel}: ogni instradamento deve creare una fase distinta.`)
        } else {
          usedTargetPhases.add(targetPhase.id)
        }
      }
    }
    if (phase.phase_type === 'KNOCKOUT' && phase.bracket_mode === 'group_blocks') {
      const linkedGroupStage = structure.phases
        .slice(0, index)
        .find((candidate) => candidate.phase_type === 'GROUP_STAGE' && candidate.advancement_routes.some((route) => route.target_phase_id === phase.id))
      if (!linkedGroupStage) {
        errors.push(`${phaseLabel}: i blocchi 1-4, 5-8 richiedono almeno una fase a gironi che instradi qui le squadre.`)
      } else if ((linkedGroupStage.num_groups ?? 0) !== 2) {
        errors.push(`${phaseLabel}: i blocchi 1-4, 5-8 funzionano solo con una fase sorgente a 2 gironi.`)
      }
      if (phase.group_block_size !== null && (phase.group_block_size < 2 || (phase.group_block_size !== 2 && !_isPowerOfTwoUi(phase.group_block_size)))) {
        errors.push(`${phaseLabel}: la dimensione blocco deve essere 2, 4, 8, 16...`)
      }
    }
    if (phase.phase_type === 'KNOCKOUT' && phase.bracket_mode === 'standard') {
      const expectedIncomingTeams = estimateIncomingTeamsForPhase(structure, index)
      const linkedGroupStages = structure.phases
        .slice(0, index)
        .filter((candidate) => candidate.phase_type === 'GROUP_STAGE' && candidate.advancement_routes.some((route) => route.target_phase_id === phase.id))
      if (expectedIncomingTeams !== null && expectedIncomingTeams > 2 && !_isPowerOfTwoUi(expectedIncomingTeams)) {
        errors.push(`${phaseLabel}: l'eliminazione diretta richiede 4, 8, 16 squadre qualificate oppure 2 per la finale secca.`)
      }
      if (linkedGroupStages.length > 0) {
        const totalSourceGroups = linkedGroupStages.reduce((total, candidate) => total + Math.max(candidate.num_groups ?? buildGroupNames(candidate).length, 0), 0)
        if (totalSourceGroups >= 2 && totalSourceGroups % 2 !== 0) {
          errors.push(`${phaseLabel}: l'eliminazione diretta incrociata richiede un numero pari di gironi sorgente.`)
        }
      }
    }
    if (phase.phase_type === 'KNOCKOUT' && phase.placement_start_rank !== null && phase.placement_start_rank <= 0) {
      errors.push(`${phaseLabel}: la classifica assegnata deve partire da un numero maggiore di zero.`)
    }
    if (phase.phase_type === 'KNOCKOUT' && phase.knockout_field_assignments.length === 0) {
      errors.push(`${phaseLabel}: assegna almeno un campo alla fase a eliminazione.`)
    }
    if (phase.phase_type === 'KNOCKOUT' && phase.knockout_progression === 'single_round') {
      const usedTargetPhases = new Set<string>()
      for (const route of phase.advancement_routes) {
        const targetPhase = structure.phases.slice(index + 1).find((candidate) => candidate.id === route.target_phase_id)
        if (!targetPhase) {
          errors.push(`${phaseLabel}: ogni instradamento KO deve puntare a una fase successiva.`)
          continue
        }
        if (route.source_mode !== 'knockout_winner' && route.source_mode !== 'knockout_loser') {
          errors.push(`${phaseLabel}: nel turno singolo puoi instradare solo vincenti o perdenti.`)
        }
        if (usedTargetPhases.has(targetPhase.id)) {
          errors.push(`${phaseLabel}: ogni instradamento deve creare una fase distinta.`)
        } else {
          usedTargetPhases.add(targetPhase.id)
        }
      }
    }
  })

  return errors
}

function estimateIncomingTeamsForPhase(structure: StructureConfig, phaseIndex: number): number | null {
  if (phaseIndex === 0) return structure.expected_teams

  const phase = structure.phases[phaseIndex]
  if (!phase) return null

  const incomingRoutes = structure.phases
    .slice(0, phaseIndex)
    .flatMap((sourcePhase) => (
      sourcePhase.advancement_routes
        .filter((route) => route.target_phase_id === phase.id)
        .map((route) => ({ sourcePhase, route }))
    ))

  if (incomingRoutes.length === 0) return null

  return incomingRoutes.reduce((total, { sourcePhase, route }) => total + estimateRouteOutputCount(sourcePhase, route), 0)
}

function estimateRouteOutputCount(sourcePhase: StructurePhase, route: AdvancementRoute): number {
  if (sourcePhase.phase_type === 'GROUP_STAGE') {
    if (route.source_mode === 'best_extra') {
      return Math.max(route.extra_count ?? 0, 0)
    }

    const sourceGroupCount = route.source_groups.length > 0
      ? route.source_groups.length
      : buildGroupNames(sourcePhase).length
    const rankFrom = route.rank_from ?? 0
    const rankTo = route.rank_to ?? 0
    if (rankFrom <= 0 || rankTo < rankFrom) return 0
    return sourceGroupCount * ((rankTo - rankFrom) + 1)
  }

  const entrants = Math.max(parseGroupSizes(sourcePhase.group_sizes).reduce((sum, value) => sum + value, 0), 0)
  if (entrants <= 1) return 0

  if (sourcePhase.knockout_progression === 'single_round') {
    const firstRoundMatches = Math.ceil(_nextPowerOfTwoUi(entrants) / 2)
    return route.source_mode === 'knockout_loser' ? firstRoundMatches : firstRoundMatches
  }

  return 0
}

function countProgramMatches(
  program: AgeGroupProgram | undefined,
  predicate?: (match: ProgramMatch) => boolean,
) {
  if (!program) return 0

  return program.days.reduce((dayTotal, day) => (
    dayTotal + day.phases.reduce((phaseTotal, phase) => {
      const allMatches: ProgramMatch[] = [
        ...phase.groups.flatMap((group) => group.matches),
        ...phase.knockout_matches,
      ]
      return phaseTotal + (predicate ? allMatches.filter(predicate).length : allMatches.length)
    }, 0)
  ), 0)
}

function hasProgramRecordedResults(program: AgeGroupProgram | undefined) {
  if (!program) return false
  return countProgramMatches(program, (match) => (
    match.home_score !== null
    || match.away_score !== null
    || match.home_tries !== null
    || match.away_tries !== null
    || match.status === 'COMPLETED'
  )) > 0
}

function buildTournamentFieldSchedule(ageGroups: AgeGroup[], programs: AgeGroupProgram[]) {
  const ageGroupMap = new Map(ageGroups.map((ageGroup) => [ageGroup.id, ageGroup] as const))
  const grouped = new Map<string, FieldScheduleEntry[]>()

  for (const program of programs) {
    const ageGroup = ageGroupMap.get(program.age_group_id)
    const structure = normalizeStructureConfig(ageGroup?.structure_config)
    const durationMinutes = structure.schedule.match_duration_minutes ?? 12
    const ageGroupLabel = ageGroup?.display_name || ageGroup?.age_group || program.display_name || program.age_group

    for (const day of program.days) {
      for (const phase of day.phases) {
        const allMatches = [
          ...phase.groups.flatMap((group) => group.matches.map((match) => ({ ...match, group_name: group.name }))),
          ...phase.knockout_matches,
        ]
        for (const match of allMatches) {
          if (!match.scheduled_at || !match.field_name) continue
          const startsAt = new Date(match.scheduled_at)
          const matchDurationMinutes = match.match_duration_minutes ?? durationMinutes
          const endsAt = new Date(startsAt.getTime() + (matchDurationMinutes * 60_000))
          const fieldKey = `${match.field_name}${match.field_number ? ` · Campo ${match.field_number}` : ''}`
          const entries = grouped.get(fieldKey) ?? []
          entries.push({
            id: match.id,
            ageGroupId: program.age_group_id,
            ageGroupLabel,
            phaseName: phase.name,
            groupName: match.group_name,
            scheduledAt: match.scheduled_at,
            endsAt,
            fieldName: match.field_name,
            fieldNumber: match.field_number,
            homeLabel: match.home_label,
            awayLabel: match.away_label,
            overlap: false,
          })
          grouped.set(fieldKey, entries)
        }
      }
    }
  }

  return Object.fromEntries(
    [...grouped.entries()]
      .map(([fieldKey, entries]): [string, FieldScheduleEntry[]] => {
        const sortedEntries = [...entries].sort((left, right) => (
          new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
        ))
        let lastEndTime: number | null = null
        const withOverlap = sortedEntries.map((entry) => {
          const startTime = new Date(entry.scheduledAt).getTime()
          const overlap = lastEndTime !== null && startTime < lastEndTime
          lastEndTime = Math.max(lastEndTime ?? 0, entry.endsAt.getTime())
          return { ...entry, overlap }
        })
        return [fieldKey, withOverlap]
      })
      .sort((left, right) => left[0].localeCompare(right[0])),
  ) as Record<string, FieldScheduleEntry[]>
}

function normalizeStructureConfig(value: unknown): StructureConfig {
  const input = (value && typeof value === 'object') ? value as Partial<StructureConfig> : {}
  const basePhases = Array.isArray(input.phases) && input.phases.length > 0
    ? input.phases.map((phase, index) => normalizePhase(phase, index + 1))
    : [makeEmptyPhase(1)]
  const phases = basePhases.map((phase, index, phaseList) => {
    if (phase.advancement_routes.length > 0) return phase
    const nextPhase = phaseList[index + 1]
    if (!nextPhase) return phase

    const legacyRoutes: AdvancementRoute[] = []
    if (nextPhase.phase_type === 'KNOCKOUT' && nextPhase.bracket_mode === 'group_blocks') {
      legacyRoutes.push(makeAdvancementRoute({
        targetPhaseId: nextPhase.id,
        rankFrom: 1,
        rankTo: 99,
      }))
    }
    if ((phase.qualifiers_per_group ?? 0) > 0) {
      legacyRoutes.push(makeAdvancementRoute({
        targetPhaseId: nextPhase.id,
        rankFrom: 1,
        rankTo: phase.qualifiers_per_group ?? undefined,
      }))
    }
    if ((phase.best_extra_teams ?? 0) > 0) {
      legacyRoutes.push(makeAdvancementRoute({
        targetPhaseId: nextPhase.id,
        sourceMode: 'best_extra',
        extraCount: phase.best_extra_teams ?? undefined,
      }))
    }
    return legacyRoutes.length > 0 ? { ...phase, advancement_routes: legacyRoutes } : phase
  })

  return {
    expected_teams: typeof input.expected_teams === 'number' ? input.expected_teams : null,
    schedule: normalizeScheduleConfig(input.schedule),
    notes: typeof input.notes === 'string' ? input.notes : '',
    phases,
  }
}

function applyDefaultPhaseDates(structure: StructureConfig, tournamentStartDate?: string | null): StructureConfig {
  if (!tournamentStartDate) return structure
  return {
    ...structure,
    phases: structure.phases.map((phase) => (
      phase.phase_date
        ? phase
        : { ...phase, phase_date: tournamentStartDate }
    )),
  }
}

function normalizeScheduleConfig(value: unknown): ScheduleConfig {
  const input = (value && typeof value === 'object') ? value as Partial<ScheduleConfig> : {}
  const rawFields = Array.isArray(input.playing_fields) ? input.playing_fields : []
  return {
    start_time: typeof input.start_time === 'string' && input.start_time ? input.start_time : '09:30',
    match_duration_minutes: typeof input.match_duration_minutes === 'number' ? input.match_duration_minutes : 12,
    interval_minutes: typeof input.interval_minutes === 'number' ? input.interval_minutes : 8,
    hide_future_phases_until_complete: typeof input.hide_future_phases_until_complete === 'boolean' ? input.hide_future_phases_until_complete : false,
    playing_fields: rawFields.map((field, index) => normalizePlayingFieldConfig(field, index)),
  }
}

function normalizePlayingFieldConfig(value: unknown, index: number): PlayingFieldConfig {
  const input = (value && typeof value === 'object') ? value as Partial<PlayingFieldConfig & { facility_name?: string }> : {}
  return {
    id: typeof input.id === 'string' ? input.id : `playing-field-${index}-${Date.now()}`,
    field_name: typeof input.field_name === 'string'
      ? input.field_name
      : (typeof input.facility_name === 'string' ? input.facility_name : ''),
    category_label: typeof input.category_label === 'string' ? input.category_label : '',
    field_number: typeof input.field_number === 'number' ? input.field_number : null,
  }
}

function normalizePhase(value: unknown, index: number): StructurePhase {
  const input = (value && typeof value === 'object') ? value as Partial<StructurePhase> : {}
  const rawBracketMode = (input as { bracket_mode?: unknown }).bracket_mode
  return {
    id: typeof input.id === 'string' ? input.id : `phase-${index}`,
    name: typeof input.name === 'string' && input.name ? input.name : `Fase ${index}`,
    phase_type: input.phase_type === 'KNOCKOUT' ? 'KNOCKOUT' : 'GROUP_STAGE',
    phase_date: typeof (input as { phase_date?: unknown }).phase_date === 'string' ? ((input as { phase_date?: string }).phase_date ?? '') : '',
    start_time: typeof (input as { start_time?: unknown }).start_time === 'string' ? ((input as { start_time?: string }).start_time ?? '') : '',
    placement_start_rank: typeof (input as { placement_start_rank?: unknown }).placement_start_rank === 'number'
      ? ((input as { placement_start_rank?: number }).placement_start_rank ?? null)
      : null,
    group_block_size: typeof (input as { group_block_size?: unknown }).group_block_size === 'number'
      ? ((input as { group_block_size?: number }).group_block_size ?? null)
      : null,
    round_trip_mode: input.round_trip_mode === 'double' ? 'double' : 'single',
    stagger_groups: (input as { stagger_groups?: unknown }).stagger_groups === true,
    max_concurrent_matches: typeof (input as { max_concurrent_matches?: unknown }).max_concurrent_matches === 'number'
      ? ((input as { max_concurrent_matches?: number }).max_concurrent_matches ?? null)
      : null,
    num_halves: typeof (input as { num_halves?: unknown }).num_halves === 'number'
      ? ((input as { num_halves?: number }).num_halves ?? null)
      : null,
    half_duration_minutes: typeof (input as { half_duration_minutes?: unknown }).half_duration_minutes === 'number'
      ? ((input as { half_duration_minutes?: number }).half_duration_minutes ?? null)
      : null,
    knockout_progression: input.knockout_progression === 'single_round' ? 'single_round' : 'full_bracket',
    num_groups: typeof input.num_groups === 'number' ? input.num_groups : null,
    group_sizes: typeof input.group_sizes === 'string' ? input.group_sizes : '',
    group_custom_names: Array.isArray((input as { group_custom_names?: unknown }).group_custom_names)
      ? ((input as { group_custom_names?: unknown[] }).group_custom_names ?? []).map((v) => typeof v === 'string' ? v : '')
      : [],
    qualifiers_per_group: typeof input.qualifiers_per_group === 'number' ? input.qualifiers_per_group : null,
    best_extra_teams: typeof input.best_extra_teams === 'number' ? input.best_extra_teams : null,
    next_phase_type: input.next_phase_type === 'GROUP_STAGE' || input.next_phase_type === 'KNOCKOUT' ? input.next_phase_type : '',
    advancement_routes: normalizeAdvancementRoutes((input as { advancement_routes?: unknown }).advancement_routes),
    bracket_mode: rawBracketMode === 'group_blocks' || rawBracketMode === 'placement'
      ? 'group_blocks'
      : 'standard',
    group_field_assignments: normalizeGroupFieldAssignments((input as { group_field_assignments?: unknown }).group_field_assignments),
    knockout_field_assignments: normalizePlayingFieldAssignments((input as { knockout_field_assignments?: unknown }).knockout_field_assignments),
    referee_group_assignments: normalizeRefereeGroupAssignments((input as { referee_group_assignments?: unknown }).referee_group_assignments),
    notes: typeof input.notes === 'string' ? input.notes : '',
  }
}

function normalizePlayingFieldAssignments(value: unknown): PlayingFieldConfig[] {
  if (!Array.isArray(value)) return []
  return value
    .map((assignment, index) => normalizePlayingFieldConfig(assignment, index))
    .filter((assignment) => assignment.field_name)
}

function normalizeGroupFieldAssignments(value: unknown): Record<string, PlayingFieldConfig[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([groupName, rawAssignments], groupIndex) => {
      const assignments = Array.isArray(rawAssignments) ? rawAssignments.map((assignment, assignmentIndex) => (
        normalizePlayingFieldConfig(assignment, groupIndex * 10 + assignmentIndex)
      )).filter((assignment) => assignment.field_name) : []
      return [groupName, assignments]
    }),
  )
}

function normalizeAdvancementRoutes(value: unknown): AdvancementRoute[] {
  if (!Array.isArray(value)) return []
  return value
    .map((route, index) => {
      const input = (route && typeof route === 'object') ? route as Partial<AdvancementRoute> : {}
      return {
        id: typeof input.id === 'string' ? input.id : `adv-route-${index}-${Date.now()}`,
        target_phase_id: typeof input.target_phase_id === 'string' ? input.target_phase_id : '',
        source_mode: input.source_mode === 'best_extra'
          ? 'best_extra'
          : input.source_mode === 'knockout_winner'
            ? 'knockout_winner'
            : input.source_mode === 'knockout_loser'
              ? 'knockout_loser'
              : 'group_rank',
        source_groups: Array.isArray(input.source_groups)
          ? input.source_groups.filter((item): item is string => typeof item === 'string' && item.length > 0)
          : [],
        rank_from: typeof input.rank_from === 'number' ? input.rank_from : null,
        rank_to: typeof input.rank_to === 'number' ? input.rank_to : null,
        extra_count: typeof input.extra_count === 'number' ? input.extra_count : null,
        target_slots: Array.isArray((input as { target_slots?: unknown }).target_slots)
          ? ((input as { target_slots?: unknown }).target_slots as unknown[]).filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
          : [],
      }
    })
}

function normalizeRefereeGroupAssignments(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).map(([groupName, rawAssignments]) => {
      const assignments = Array.isArray(rawAssignments)
        ? rawAssignments.filter((assignment): assignment is string => typeof assignment === 'string' && assignment.length > 0)
        : []
      return [groupName, assignments]
    }),
  )
}

function makeEmptyPhase(index: number, tournamentStartDate?: string | null): StructurePhase {
  return {
    id: `phase-${index}-${Date.now()}`,
    name: `Fase ${index}`,
    phase_type: 'GROUP_STAGE',
    phase_date: tournamentStartDate ?? '',
    start_time: '',
    placement_start_rank: null,
    group_block_size: null,
    round_trip_mode: 'single',
    stagger_groups: false,
    max_concurrent_matches: null,
    num_halves: null,
    half_duration_minutes: null,
    knockout_progression: 'full_bracket',
    num_groups: null,
    group_sizes: '',
    group_custom_names: [],
    qualifiers_per_group: null,
    best_extra_teams: null,
    next_phase_type: '',
    advancement_routes: [],
    bracket_mode: 'standard',
    group_field_assignments: {},
    knockout_field_assignments: [],
    referee_group_assignments: {},
    notes: '',
  }
}

function buildLinkedPhaseName(sourcePhaseIndex: number, routeNumber: number) {
  return `Fase ${sourcePhaseIndex + 2} - ${routeNumber}`
}

function makeAdvancementRoute({
  targetPhaseId = '',
  sourceMode = 'group_rank',
  rankFrom = 1,
  rankTo = 1,
  extraCount = 1,
}: {
  targetPhaseId?: string
  sourceMode?: AdvancementRoute['source_mode']
  rankFrom?: number
  rankTo?: number
  extraCount?: number
} = {}): AdvancementRoute {
  return {
    id: `adv-route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target_phase_id: targetPhaseId,
    source_mode: sourceMode,
    source_groups: [],
    rank_from: sourceMode === 'group_rank' ? rankFrom : null,
    rank_to: sourceMode === 'group_rank' ? rankTo : null,
    extra_count: sourceMode === 'best_extra' ? extraCount : null,
    target_slots: [],
  }
}

function makeEmptyPlayingField(index: number): PlayingFieldConfig {
  return {
    id: `playing-field-${index}-${Date.now()}`,
    field_name: '',
    category_label: '',
    field_number: index,
  }
}

function StructurePreviewCard({
  structure,
  participantCount,
  isOpen,
  onToggle,
}: {
  structure: StructureConfig
  participantCount: number
  isOpen: boolean
  onToggle: () => void
}) {
  const incomingCount = new Map<string, number>()
  structure.phases.forEach((phase) => incomingCount.set(phase.id, 0))
  structure.phases.forEach((phase) => {
    phase.advancement_routes.forEach((route) => {
      if (!route.target_phase_id) return
      incomingCount.set(route.target_phase_id, (incomingCount.get(route.target_phase_id) ?? 0) + 1)
    })
  })
  const rootPhases = structure.phases.filter((phase) => (incomingCount.get(phase.id) ?? 0) === 0)
  const orderedRoots = rootPhases.length > 0 ? rootPhases : structure.phases.slice(0, 1)
  const orphanPhases = structure.phases.filter((phase) => !orderedRoots.some((root) => root.id === phase.id) && (incomingCount.get(phase.id) ?? 0) === 0)

  return (
    <div className="rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Anteprima grafica</p>
          <h4 className="mt-1 text-base font-black text-slate-900">Schema dell&apos;evento</h4>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {participantCount} squadre inserite
          </div>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            {isOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isOpen ? 'Nascondi schema' : 'Mostra schema'}
          </button>
        </div>
      </div>

      {isOpen && (
        <>
      <div className="mt-4 space-y-3 overflow-x-auto">
        {orderedRoots.map((phase) => (
          <StructureFlowBranch key={phase.id} phase={phase} structure={structure} participantCount={participantCount} visited={new Set<string>()} />
        ))}
        {orphanPhases.length > 0 && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            {orphanPhases.map((phase) => (
              <StructureFlowBranch key={`${phase.id}-orphan`} phase={phase} structure={structure} participantCount={participantCount} visited={new Set<string>()} />
            ))}
          </div>
        )}
      </div>

      {structure.notes && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {structure.notes}
        </div>
      )}
        </>
      )}
    </div>
  )
}

function StructureFlowBranch({
  phase,
  structure,
  participantCount,
  visited,
}: {
  phase: StructurePhase
  structure: StructureConfig
  participantCount: number
  visited: Set<string>
}) {
  if (visited.has(phase.id)) return null

  const nextVisited = new Set(visited)
  nextVisited.add(phase.id)
  const children = phase.advancement_routes
    .map((route) => ({
      route,
      targetPhase: structure.phases.find((candidate) => candidate.id === route.target_phase_id) ?? null,
    }))
    .filter((item) => item.targetPhase && !nextVisited.has(item.targetPhase.id))

  return (
    <div className="min-w-[280px] rounded-[1.4rem] border border-slate-200 bg-white/90 p-3">
      <div className="flex items-start gap-3">
        <StructurePhaseMiniCard phase={phase} structure={structure} participantCount={participantCount} />
        {children.length > 0 ? (
          <>
            <div className="flex min-h-[3.75rem] items-center text-slate-300">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div className="min-w-[240px] space-y-2">
              {children.map(({ route, targetPhase }) => (
                <div key={route.id} className="space-y-2">
                  <div className="rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Instradamento</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{describeRouteLabelForPreview(route, phase)}</p>
                  </div>
                  {targetPhase && (
                    <StructureFlowBranch phase={targetPhase} structure={structure} participantCount={participantCount} visited={nextVisited} />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-[3.75rem] min-w-[180px] items-center">
            <div className="rounded-[1rem] border border-dashed border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              Fase conclusiva
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StructurePhaseMiniCard({
  phase,
  structure,
  participantCount,
}: {
  phase: StructurePhase
  structure: StructureConfig
  participantCount: number
}) {
  const badgeClass = phase.phase_type === 'GROUP_STAGE' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
  const metaLabel = phase.phase_type === 'GROUP_STAGE'
    ? `${Math.max(phase.num_groups ?? 0, parseGroupSizes(phase.group_sizes).length, 1)} gironi`
    : phase.bracket_mode === 'group_blocks'
      ? 'Blocchi classifica'
      : phase.knockout_progression === 'single_round'
        ? 'Turno singolo'
        : 'Tabellone'
  const phaseIndex = structure.phases.findIndex((item) => item.id === phase.id)
  const estimatedEnd = phaseIndex >= 0 ? estimatePhaseEndTime(structure, phaseIndex, participantCount) : null

  return (
    <div className="min-w-[220px] rounded-[1.1rem] border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{phase.name || 'Fase'}</p>
          <p className="mt-1 text-xs text-slate-500">{phase.phase_date || 'Data da definire'} · {phase.start_time || 'Ora da definire'}</p>
          <p className="mt-1 text-xs text-slate-500">Fine stimata {estimatedEnd ?? 'da definire'}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${badgeClass}`}>
          {phase.phase_type === 'GROUP_STAGE' ? 'Gironi' : 'Eliminazione'}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {metaLabel}
        </span>
        {phase.phase_type === 'GROUP_STAGE' && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            {phase.round_trip_mode === 'double' ? 'Andata/ritorno' : 'Solo andata'}
          </span>
        )}
      </div>
    </div>
  )
}

function describePhaseRoutes(structure: StructureConfig, phase: StructurePhase): string[] {
  if (phase.phase_type === 'GROUP_STAGE') {
    return phase.advancement_routes.map((route) => {
      const targetPhase = structure.phases.find((candidate) => candidate.id === route.target_phase_id)
      const targetLabel = targetPhase?.name || 'fase da definire'
      if (route.source_mode === 'best_extra') {
        return `${route.extra_count ?? '?'} migliori extra -> ${targetLabel}`
      }
      const groupsLabel = route.source_groups.length > 0 ? route.source_groups.join(', ') : 'tutti i gironi'
      return `${route.rank_from ?? '?'}-${route.rank_to ?? '?'} ${groupsLabel} -> ${targetLabel}`
    })
  }

  if (phase.knockout_progression === 'single_round') {
    return phase.advancement_routes.map((route) => {
      const targetPhase = structure.phases.find((candidate) => candidate.id === route.target_phase_id)
      const targetLabel = targetPhase?.name || 'fase da definire'
      return `${route.source_mode === 'knockout_loser' ? 'Perdenti' : 'Vincenti'} -> ${targetLabel}`
    })
  }

  return []
}

function isConclusivePhase(structure: StructureConfig, phaseId: string) {
  const phase = structure.phases.find((item) => item.id === phaseId)
  if (!phase) return false
  return phase.advancement_routes.length === 0
}

function describeRouteLabelForPreview(route: AdvancementRoute, sourcePhase: StructurePhase) {
  if (sourcePhase.phase_type === 'GROUP_STAGE') {
    if (route.source_mode === 'best_extra') {
      return `${route.extra_count ?? '?'} migliori extra`
    }
    const groupsLabel = route.source_groups.length > 0 ? route.source_groups.join(', ') : 'tutti i gironi'
    return `${route.rank_from ?? '?'}-${route.rank_to ?? '?'} ${groupsLabel}`
  }

  return route.source_mode === 'knockout_loser' ? 'Perdenti del turno' : 'Vincenti del turno'
}

function describeRouteSourceEntries(phase: StructurePhase, route: AdvancementRoute): string[] {
  if (phase.phase_type === 'GROUP_STAGE') {
    if (route.source_mode === 'best_extra') {
      return Array.from({ length: route.extra_count ?? 0 }, (_, index) => `Migliore extra ${index + 1}`)
    }
    const groupNames = route.source_groups.length > 0 ? route.source_groups : buildGroupNames(phase)
    const rankFrom = route.rank_from ?? 0
    const rankTo = route.rank_to ?? 0
    if (rankFrom <= 0 || rankTo < rankFrom) return []
    const entries: string[] = []
    for (const groupName of groupNames) {
      for (let rank = rankFrom; rank <= rankTo; rank += 1) {
        entries.push(`${rank}${groupName.replace('Girone ', '')}`)
      }
    }
    return entries
  }

  return route.source_mode === 'knockout_loser' ? ['Perdente 1', 'Perdente 2', 'Perdente 3', '...'] : ['Vincente 1', 'Vincente 2', 'Vincente 3', '...']
}

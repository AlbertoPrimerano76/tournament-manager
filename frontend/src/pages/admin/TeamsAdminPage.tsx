import { useState } from 'react'
import { useAdminTeams, useCreateTeam, useUpdateTeam, Team } from '@/api/teams'
import { useAdminOrganizations, useCreateOrganization } from '@/api/organizations'
import { MapPin, Pencil, Plus, X, Users } from 'lucide-react'

export default function TeamsAdminPage() {
  const { data: orgs } = useAdminOrganizations()
  const [filterOrgId, setFilterOrgId] = useState('')
  const { data: teams, isLoading } = useAdminTeams(filterOrgId || undefined)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)

  function openCreate() { setEditing(null); setShowForm(true) }
  function openEdit(t: Team) { setEditing(t); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Anagrafica squadre</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Squadre</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Organizza le squadre per società, mantieni nomi brevi, città e identità visiva in modo ordinato.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-2xl bg-rugby-green px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-rugby-green-dark"
        >
          <Plus className="h-4 w-4" /> Nuova squadra
        </button>
      </div>

      {/* Filter by org */}
      {orgs && orgs.length > 1 && (
        <div className="mb-4">
          <select
            value={filterOrgId}
            onChange={e => setFilterOrgId(e.target.value)}
            className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
          >
            <option value="">Tutte le società</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Caricamento...</div>}

      {!isLoading && (!teams || teams.length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nessuna squadra registrata</p>
          <p className="text-sm mt-1">Clicca "Nuova squadra" per iniziare</p>
        </div>
      )}

      {teams && teams.length > 0 && (
        <div className="grid gap-3">
          {teams.map(t => (
            <TeamRow key={t.id} team={t} orgs={orgs ?? []} onEdit={() => openEdit(t)} />
          ))}
        </div>
      )}

      {showForm && (
        <TeamFormDrawer team={editing} onClose={closeForm} />
      )}
    </div>
  )
}

function TeamRow({
  team: t,
  orgs,
  onEdit,
}: {
  team: Team
  orgs: { id: string; name: string; logo_url?: string | null }[]
  onEdit: () => void
}) {
  const organization = orgs.find(o => o.id === t.organization_id)
  const orgName = organization?.name
  const effectiveLogoUrl = t.logo_url || organization?.logo_url || null

  return (
    <div className="flex items-center gap-4 rounded-[1.7rem] border border-white/80 bg-white/85 px-6 py-5 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.5)] backdrop-blur">
      {/* Logo or initials */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-bold text-gray-500">
        {effectiveLogoUrl
          ? <img src={effectiveLogoUrl} alt={t.name} className="w-full h-full object-contain" />
          : (t.short_name ?? t.name.slice(0, 2)).toUpperCase()
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-lg font-bold text-slate-900">{t.name}</p>
          {t.short_name && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{t.short_name}</span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-400">
          {orgName && <span>{orgName}</span>}
          {t.city && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />{t.city}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={onEdit}
        className="shrink-0 rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  )
}

function TeamFormDrawer({ team, onClose }: { team: Team | null; onClose: () => void }) {
  const { data: orgs } = useAdminOrganizations()
  const createOrg = useCreateOrganization()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()

  const isEdit = !!team

  const [form, setForm] = useState({
    organization_id: team?.organization_id ?? '',
    name: team?.name ?? '',
    short_name: team?.short_name ?? '',
    city: team?.city ?? '',
    logo_url: team?.logo_url ?? '',
  })

  const [newOrgName, setNewOrgName] = useState('')
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function autoSlug(name: string) {
    return name.toLowerCase()
      .replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìí]/g, 'i')
      .replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreateOrg() {
    if (!newOrgName.trim()) return
    const org = await createOrg.mutateAsync({ name: newOrgName.trim(), slug: autoSlug(newOrgName) })
    set('organization_id', org.id)
    setNewOrgName('')
    setShowNewOrg(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.organization_id && !isEdit) { setError('Seleziona o crea un\'società'); return }

    try {
      if (isEdit) {
        await updateTeam.mutateAsync({
          id: team!.id,
          data: {
            name: form.name || undefined,
            short_name: form.short_name || undefined,
            city: form.city || undefined,
            logo_url: form.logo_url || undefined,
          },
        })
      } else {
        await createTeam.mutateAsync({
          organization_id: form.organization_id,
          name: form.name,
          short_name: form.short_name || undefined,
          city: form.city || undefined,
          logo_url: form.logo_url || undefined,
        })
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il salvataggio')
    }
  }

  const isPending = createTeam.isPending || updateTeam.isPending

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifica squadra' : 'Nuova squadra'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Organization — only for create */}
          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Società *</label>
              {orgs && orgs.length > 0 && (
                <select
                  value={form.organization_id}
                  onChange={e => set('organization_id', e.target.value)}
                  className={input}
                >
                  <option value="">— seleziona —</option>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
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
          )}

          <Field label="Nome squadra *">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={input} required />
          </Field>

          <Field label="Nome breve" hint="es. RLI, CUS">
            <input value={form.short_name} onChange={e => set('short_name', e.target.value)}
              maxLength={10} className={input} placeholder="Max 10 caratteri" />
          </Field>

          <Field label="Città">
            <input value={form.city} onChange={e => set('city', e.target.value)}
              className={input} />
          </Field>

          <Field label="URL logo" hint="Link immagine">
            <input value={form.logo_url} onChange={e => set('logo_url', e.target.value)}
              type="url" className={input} placeholder="https://..." />
          </Field>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Annulla
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-rugby-green text-white text-sm font-semibold hover:bg-rugby-green-dark transition-colors disabled:opacity-50">
            {isPending ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea squadra'}
          </button>
        </div>
      </div>
    </>
  )
}

const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent'

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {hint && <span className="font-normal text-gray-400 ml-1 text-xs">({hint})</span>}
      </label>
      {children}
    </div>
  )
}

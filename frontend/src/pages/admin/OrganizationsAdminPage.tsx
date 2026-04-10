import { useMemo, useState } from 'react'
import { useAdminOrganizations, useCreateOrganization, useUpdateOrganization, useDeleteOrganization, Organization } from '@/api/organizations'
import { useOrganizationFields, useCreateField, useUpdateField, useDeleteField, type Field as Facility } from '@/api/fields'
import ImageUpload from '@/components/shared/ImageUpload'
import { Globe, Pencil, Plus, X, Building2, Trash2, Link as LinkIcon, MapPin, MapPinned, Palette, Search, Undo2, AlertTriangle } from 'lucide-react'

export default function OrganizationsAdminPage() {
  const { data: orgs, isLoading } = useAdminOrganizations()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Organization | null>(null)
  const [facilityTarget, setFacilityTarget] = useState<Organization | null>(null)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('all')

  function openCreate() { setEditing(null); setShowForm(true) }
  function openEdit(o: Organization) { setEditing(o); setShowForm(true) }
  function closeForm() { setShowForm(false); setEditing(null) }

  const filteredOrgs = useMemo(() => {
    const items = orgs ?? []
    return items
      .filter((org) => {
        const text = search.trim().toLowerCase()
        const matchesSearch = !text
          || org.name.toLowerCase().includes(text)
          || org.slug.toLowerCase().includes(text)
          || (org.city ?? '').toLowerCase().includes(text)
        const matchesCity = cityFilter === 'all' || (org.city ?? 'Senza città') === cityFilter
        return matchesSearch && matchesCity
      })
      .sort((left, right) => {
        const leftCity = left.city ?? 'ZZZ'
        const rightCity = right.city ?? 'ZZZ'
        if (leftCity !== rightCity) return leftCity.localeCompare(rightCity)
        return left.name.localeCompare(right.name)
      })
  }, [orgs, search, cityFilter])

  const uniqueCities = Array.from(new Set((orgs ?? []).map((org) => org.city ?? 'Senza città'))).sort()

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Anagrafica società</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Società</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Qui definisci i dati base del club e i suoi impianti. Il branding resta opzionale e secondario rispetto al flusso operativo.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-2xl bg-rugby-green px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-rugby-green-dark"
        >
          <Plus className="h-4 w-4" /> Nuova società
        </button>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Società totali" value={String(orgs?.length ?? 0)} />
        <StatCard label="Città presenti" value={String(uniqueCities.filter((city) => city !== 'Senza città').length)} />
        <StatCard label="Con sito web" value={String((orgs ?? []).filter((org) => !!org.website).length)} />
      </div>

      <div className="mb-5 grid gap-3 rounded-[1.8rem] border border-white/80 bg-white/75 p-4 shadow-[0_20px_60px_-50px_rgba(15,23,42,0.4)] backdrop-blur md:grid-cols-[1.4fr_0.8fr]">
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca società, città o slug"
            className="w-full bg-transparent text-sm text-slate-900 outline-none"
          />
        </label>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
        >
          <option value="all">Tutte le città</option>
          {uniqueCities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Caricamento...</div>}

      {!isLoading && (!orgs || orgs.length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="font-medium">Nessuna società creata</p>
          <p className="text-sm mt-1">Clicca "Nuova società" per iniziare</p>
        </div>
      )}

      {!isLoading && filteredOrgs.length === 0 && orgs && orgs.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <p className="font-medium">Nessuna società trovata</p>
          <p className="text-sm mt-1">Prova a cambiare ricerca o città.</p>
        </div>
      )}

      {filteredOrgs.length > 0 && (
        <div className="grid gap-3">
          {filteredOrgs.map(o => (
            <OrgRow key={o.id} org={o} onEdit={() => openEdit(o)} onFacilities={() => setFacilityTarget(o)} />
          ))}
        </div>
      )}

      {showForm && <OrgFormDrawer org={editing} onClose={closeForm} />}
      {facilityTarget && <OrganizationFacilitiesDrawer org={facilityTarget} onClose={() => setFacilityTarget(null)} />}
    </div>
  )
}

function OrgRow({ org: o, onEdit, onFacilities }: { org: Organization; onEdit: () => void; onFacilities: () => void }) {
  const deleteMutation = useDeleteOrganization()
  const [deleteError, setDeleteError] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const publicUrl = `${window.location.origin}/${o.slug}`

  async function handleDelete() {
    setConfirmingDelete(false)
    setDeleteError('')
    try {
      await deleteMutation.mutateAsync(o.id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setDeleteError(msg ?? 'Errore durante l\'eliminazione')
    }
  }

  return (
    <div className="rounded-[1.7rem] border border-white/80 bg-white/85 px-6 py-5 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.5)] backdrop-blur">
      <div className="flex items-center gap-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500"
          style={{ backgroundColor: o.primary_color + '22', border: `2px solid ${o.primary_color}33` }}>
          {o.logo_url
            ? <img src={o.logo_url} alt={o.name} className="w-full h-full object-contain p-1" />
            : <span style={{ color: o.primary_color }}>{o.name.slice(0, 2).toUpperCase()}</span>
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-slate-900">{o.name}</p>
            {o.city && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">
                {o.city}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-mono text-rugby-green transition-colors hover:underline"
              onClick={e => e.stopPropagation()}
            >
              <LinkIcon className="h-3 w-3" />/{o.slug}
            </a>
            {o.website && (
              <a
                href={o.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-rugby-green transition-colors"
                onClick={e => e.stopPropagation()}
              >
                <Globe className="h-3 w-3" />{o.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Palette className="h-3 w-3" />
              Tema società
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onFacilities}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50"
            title="Gestisci impianti"
          >
            <span className="inline-flex items-center gap-2"><MapPinned className="h-4 w-4" /> Impianti</span>
          </button>
          <button
            onClick={onEdit}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={deleteMutation.isPending}
            className="rounded-xl p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {confirmingDelete && (
        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="flex-1 text-sm font-semibold text-red-800">Eliminare «{o.name}»? L&apos;operazione non è reversibile.</p>
          <button onClick={handleDelete} disabled={deleteMutation.isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50">Elimina</button>
          <button onClick={() => setConfirmingDelete(false)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Annulla</button>
        </div>
      )}
      {deleteError && (
        <p className="mt-2 text-xs text-red-500 pl-14">{deleteError}</p>
      )}
    </div>
  )
}

function OrgFormDrawer({ org, onClose }: { org: Organization | null; onClose: () => void }) {
  const createOrg = useCreateOrganization()
  const updateOrg = useUpdateOrganization()
  const isEdit = !!org

  const [form, setForm] = useState({
    name: org?.name ?? '',
    slug: org?.slug ?? '',
    city: org?.city ?? '',
    website: org?.website ?? '',
    logo_url: org?.logo_url ?? '',
    primary_color: org?.primary_color ?? '#1a1a2e',
    accent_color: org?.accent_color ?? '#c0392b',
  })
  const [error, setError] = useState('')
  const [showAppearance, setShowAppearance] = useState(Boolean(org?.primary_color || org?.accent_color || org?.logo_url))

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function autoSlug(name: string) {
    return name.toLowerCase()
      .replace(/[àáâ]/g, 'a').replace(/[èéê]/g, 'e').replace(/[ìí]/g, 'i')
      .replace(/[òó]/g, 'o').replace(/[ùú]/g, 'u')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (isEdit) {
        await updateOrg.mutateAsync({
          id: org!.id,
          data: {
            name: form.name || undefined,
            logo_url: form.logo_url || undefined,
            city: form.city || undefined,
            website: form.website || undefined,
            primary_color: form.primary_color,
            accent_color: form.accent_color,
          },
        })
      } else {
        if (!form.slug) { setError('Lo slug è obbligatorio'); return }
        await createOrg.mutateAsync({
          name: form.name,
          slug: form.slug,
          city: form.city || undefined,
          website: form.website || undefined,
          primary_color: form.primary_color,
          accent_color: form.accent_color,
        })
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il salvataggio')
    }
  }

  const isPending = createOrg.isPending || updateOrg.isPending

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifica società' : 'Nuova società'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>
          )}

          <Field label="Nome *">
            <input
              value={form.name}
              onChange={e => {
                set('name', e.target.value)
                if (!isEdit) set('slug', autoSlug(e.target.value))
              }}
              className={inputCls} required
            />
          </Field>

          {!isEdit && (
            <Field label="Slug *" hint="Usato negli URL, non modificabile dopo la creazione">
              <input
                value={form.slug}
                onChange={e => set('slug', e.target.value)}
                className={inputCls} required pattern="[a-z0-9-]+"
                placeholder="es. rugby-livorno"
              />
            </Field>
          )}

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Dati base</p>
            <div className="mt-4 space-y-4">
              <Field label="Sito web">
                <input
                  value={form.website}
                  onChange={e => set('website', e.target.value)}
                  type="url" className={inputCls} placeholder="https://..."
                />
              </Field>

              <Field label="Città">
                <input
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                  className={inputCls}
                  placeholder="Es. Livorno"
                />
              </Field>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setShowAppearance((current) => !current)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">Aspetto pagina società</p>
                <p className="mt-1 text-xs text-slate-500">Opzionale. Utile per dare un tema al club e precompilare gli eventi.</p>
              </div>
              <Palette className="h-4 w-4 text-slate-400" />
            </button>

            {showAppearance && (
              <div className="border-t border-slate-200 px-4 py-4 space-y-4">
                <ImageUpload
                  label="Logo"
                  value={form.logo_url}
                  onChange={v => set('logo_url', v)}
                  folder="logos"
                  maxDim={400}
                  placeholder="Carica logo"
                />

                <div className="grid grid-cols-2 gap-4">
                  <Field label="Colore principale" hint="Usato come base visiva">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.primary_color}
                        onChange={e => set('primary_color', e.target.value)}
                        className="h-9 w-14 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <input
                        value={form.primary_color}
                        onChange={e => set('primary_color', e.target.value)}
                        className={inputCls + ' font-mono text-xs'}
                        placeholder="#1a1a2e"
                      />
                    </div>
                  </Field>
                  <Field label="Colore accento" hint="Usato per badge e dettagli">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form.accent_color}
                        onChange={e => set('accent_color', e.target.value)}
                        className="h-9 w-14 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                      />
                      <input
                        value={form.accent_color}
                        onChange={e => set('accent_color', e.target.value)}
                        className={inputCls + ' font-mono text-xs'}
                        placeholder="#c0392b"
                      />
                    </div>
                  </Field>
                </div>

                <div
                  className="rounded-xl overflow-hidden h-24 flex items-center justify-center gap-3 relative"
                  style={{ background: `linear-gradient(135deg, ${form.primary_color} 0%, #0d0d1a 100%)` }}
                >
                  {form.logo_url && <img src={form.logo_url} alt="" className="h-10 w-auto object-contain drop-shadow" />}
                  <span className="text-white font-bold text-sm">{form.name || 'Nome società'}</span>
                  <div
                    className="absolute top-2 right-2 w-6 h-6 rounded-full opacity-40"
                    style={{ backgroundColor: form.accent_color }}
                  />
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
            Annulla
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending}
            className="flex-1 px-4 py-2.5 rounded-lg bg-rugby-green text-white text-sm font-semibold hover:bg-rugby-green-dark transition-colors disabled:opacity-50">
            {isPending ? 'Salvataggio...' : isEdit ? 'Salva modifiche' : 'Crea società'}
          </button>
        </div>
      </div>
    </>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/80 bg-white/80 p-4 shadow-[0_20px_50px_-42px_rgba(15,23,42,0.35)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent'
const FIELD_AGE_GROUP_OPTIONS = ['U6', 'U8', 'U10', 'U12'] as const

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

function OrganizationFacilitiesDrawer({ org, onClose }: { org: Organization; onClose: () => void }) {
  const { data: facilities, isLoading } = useOrganizationFields(org.id)
  const deleteFacility = useDeleteField()
  const [editingFacility, setEditingFacility] = useState<Facility | null | 'new'>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ facility: Facility; timerId: ReturnType<typeof setTimeout> } | null>(null)

  function handleDeleteClick(facility: Facility) {
    setConfirmDeleteId(facility.id)
  }

  function handleConfirmDelete(facility: Facility) {
    setConfirmDeleteId(null)
    const timerId = setTimeout(() => {
      deleteFacility.mutate({ id: facility.id, organizationId: org.id })
      setUndoToast(null)
    }, 5000)
    setUndoToast({ facility, timerId })
  }

  function handleUndo() {
    if (undoToast) {
      clearTimeout(undoToast.timerId)
      setUndoToast(null)
    }
  }

  const hiddenId = undoToast?.facility.id

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Impianti della società</h2>
            <p className="mt-0.5 text-xs text-gray-400">{org.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 rounded-[1.4rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Gli impianti appartengono alla società. I tornei useranno automaticamente questi impianti per definire i campi di gioco nelle categorie.
          </div>

          {isLoading && <p className="py-4 text-center text-sm text-gray-400">Caricamento...</p>}

          {!isLoading && (facilities?.filter((f) => f.id !== hiddenId).length ?? 0) === 0 && !editingFacility && !undoToast && (
            <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Nessun impianto configurato.
            </div>
          )}

          <div className="space-y-3">
            {facilities?.filter((f) => f.id !== hiddenId).map((facility) => (
              <div key={facility.id} className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
                {facility.photo_url && (
                  <img src={facility.photo_url} alt={facility.name} className="h-36 w-full object-cover" />
                )}
                {confirmDeleteId === facility.id ? (
                  <div className="p-4">
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-red-800">Eliminare «{facility.name}»?</p>
                        <p className="mt-0.5 text-xs text-red-600">Avrai 5 secondi per annullare l'operazione.</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleConfirmDelete(facility)}
                        className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700"
                      >
                        Elimina
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{facility.name}</p>
                      {facility.age_group && <p className="mt-1 text-xs font-semibold text-emerald-700">Categoria {facility.age_group}</p>}
                      {facility.address && <p className="mt-1 text-xs text-slate-500">{facility.address}</p>}
                      {facility.maps_url && (
                        <a
                          href={facility.maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          <MapPin className="h-3 w-3" />
                          Apri Google Maps
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingFacility(facility)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(facility)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {undoToast && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-[1.3rem] border border-slate-200 bg-slate-900 px-4 py-3 text-white shadow-lg">
              <p className="text-sm font-medium">«{undoToast.facility.name}» eliminato</p>
              <button
                type="button"
                onClick={handleUndo}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-bold hover:bg-white/25"
              >
                <Undo2 className="h-3.5 w-3.5" />
                Annulla
              </button>
            </div>
          )}

          {editingFacility && (
            <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">
                {editingFacility === 'new' ? 'Nuovo impianto' : `Modifica ${editingFacility.name}`}
              </p>
              <OrganizationFacilityForm
                orgId={org.id}
                facility={editingFacility === 'new' ? null : editingFacility}
                onDone={() => setEditingFacility(null)}
                onCancel={() => setEditingFacility(null)}
              />
            </div>
          )}
        </div>

        {!editingFacility && (
          <div className="border-t border-gray-100 px-6 py-4">
            <button
              type="button"
              onClick={() => setEditingFacility('new')}
              className="w-full rounded-xl bg-rugby-green px-4 py-3 text-sm font-semibold text-white hover:bg-rugby-green-dark"
            >
              Aggiungi impianto
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function OrganizationFacilityForm({
  orgId,
  facility,
  onDone,
  onCancel,
}: {
  orgId: string
  facility: Facility | null
  onDone: () => void
  onCancel: () => void
}) {
  const createField = useCreateField()
  const updateField = useUpdateField()
  const [form, setForm] = useState({
    name: facility?.name ?? '',
    age_group: facility?.age_group ?? '',
    address: facility?.address ?? '',
    maps_url: facility?.maps_url ?? '',
    photo_url: facility?.photo_url ?? '',
    notes: facility?.notes ?? '',
  })
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Il nome impianto è obbligatorio')
      return
    }
    try {
      if (facility) {
        await updateField.mutateAsync({
          id: facility.id,
          organizationId: orgId,
          data: {
            name: form.name,
            age_group: form.age_group || null,
            address: form.address || null,
            maps_url: form.maps_url || null,
            photo_url: form.photo_url || null,
            notes: form.notes || null,
          },
        })
      } else {
        await createField.mutateAsync({
          organization_id: orgId,
          tournament_id: null,
          name: form.name,
          age_group: form.age_group || null,
          address: form.address || null,
          maps_url: form.maps_url || null,
          photo_url: form.photo_url || null,
          notes: form.notes || null,
        })
      }
      onDone()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il salvataggio dell’impianto')
    }
  }

  const isPending = createField.isPending || updateField.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

      <Field label="Nome impianto *">
        <input value={form.name} onChange={e => set('name', e.target.value)} className={inputCls} />
      </Field>

      <Field label="Categoria" hint="Opzionale">
        <select value={form.age_group} onChange={e => set('age_group', e.target.value)} className={inputCls}>
          <option value="">Tutte le categorie</option>
          {FIELD_AGE_GROUP_OPTIONS.map((ageGroup) => (
            <option key={ageGroup} value={ageGroup}>{ageGroup}</option>
          ))}
        </select>
      </Field>

      <Field label="Indirizzo">
        <input value={form.address} onChange={e => set('address', e.target.value)} className={inputCls} />
      </Field>

      <Field label="Google Maps">
        <input value={form.maps_url} onChange={e => set('maps_url', e.target.value)} className={inputCls} placeholder="https://maps.google.com/..." />
      </Field>

      <ImageUpload
        label="Foto impianto"
        value={form.photo_url}
        onChange={value => set('photo_url', value)}
        folder="fields"
        maxDim={1200}
        placeholder="Carica foto impianto"
      />

      <Field label="Note">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
      </Field>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Annulla
        </button>
        <button type="submit" disabled={isPending} className="flex-1 rounded-xl bg-rugby-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-rugby-green-dark disabled:opacity-50">
          {isPending ? 'Salvataggio...' : facility ? 'Salva impianto' : 'Crea impianto'}
        </button>
      </div>
    </form>
  )
}

import { useState } from 'react'
import {
  useUsers, useCreateUser, useUpdateUser, useDeleteUser, useResetPassword,
  AppUser, UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_COLORS,
} from '@/api/users'
import {
  useSaveUserSecurityQuestions,
  useUserSecurityQuestions,
  type SecurityQuestionAnswer,
} from '@/api/securityQuestions'
import { useAdminOrganizations } from '@/api/organizations'
import { useAdminTournaments } from '@/api/tournaments'
import { useAuth } from '@/context/AuthContext'
import { Plus, Pencil, Trash2, X, KeyRound, ShieldCheck, ToggleLeft, ToggleRight, ShieldQuestion, AlertTriangle } from 'lucide-react'
import PasswordStrengthField from '@/components/PasswordStrengthField'
import { isStrongPassword } from '@/lib/passwordStrength'

export default function UsersAdminPage() {
  const { data: users, isLoading } = useUsers()
  const { user: me } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null)
  const [securityTarget, setSecurityTarget] = useState<AppUser | null>(null)

  function openCreate() { setEditing(null); setShowForm(true) }
  function openEdit(u: AppUser) { setEditing(u); setShowForm(true) }

  return (
    <div className="max-w-5xl">
      <div className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-white/80 bg-white/80 p-6 shadow-[0_35px_90px_-60px_rgba(15,23,42,0.45)] backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Accessi</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Utenti</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Ruoli, permessi operativi e attivazione account in un’unica vista amministrativa.
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 rounded-2xl bg-rugby-green px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-rugby-green-dark">
          <Plus className="h-4 w-4" /> Nuovo utente
        </button>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-6">
        {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([role, label]) => (
          <div key={role} className="rounded-[1.4rem] border border-white/80 bg-white/85 p-4 shadow-[0_24px_60px_-55px_rgba(15,23,42,0.45)] backdrop-blur">
            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-1 ${ROLE_COLORS[role]}`}>
              {label}
            </span>
            <p className="text-xs text-gray-400 leading-snug">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>

      {isLoading && <div className="text-gray-400 text-sm py-8 text-center">Caricamento...</div>}

      {!isLoading && (!users || users.length === 0) && (
        <div className="bg-white rounded-xl border border-dashed border-gray-200 p-12 text-center text-gray-400">
          <p className="font-medium">Nessun utente</p>
        </div>
      )}

      {users && users.length > 0 && (
        <div className="grid gap-3">
          {users.map(u => (
            <UserRow
              key={u.id}
              user={u}
              isMe={u.id === me?.id}
              onEdit={() => openEdit(u)}
              onReset={() => setResetTarget(u)}
              onSecurity={() => setSecurityTarget(u)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <UserFormDrawer user={editing} onClose={() => { setShowForm(false); setEditing(null) }} />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {securityTarget && (
        <SecurityQuestionsModal user={securityTarget} onClose={() => setSecurityTarget(null)} />
      )}
    </div>
  )
}

function UserRow({ user: u, isMe, onEdit, onReset, onSecurity }: {
  user: AppUser; isMe: boolean; onEdit: () => void; onReset: () => void; onSecurity: () => void
}) {
  const deleteMutation = useDeleteUser()
  const updateMutation = useUpdateUser()
  const [confirmAction, setConfirmAction] = useState<'delete' | 'toggle' | null>(null)

  function handleToggleActive() {
    updateMutation.mutate({ id: u.id, data: { is_active: !u.is_active } })
    setConfirmAction(null)
  }

  function handleDelete() {
    deleteMutation.mutate(u.id)
    setConfirmAction(null)
  }

  return (
    <div className={`flex items-center gap-3 rounded-[1.7rem] border px-5 py-4 shadow-[0_30px_80px_-60px_rgba(15,23,42,0.5)] backdrop-blur ${
      !u.is_active ? 'border-red-100 bg-red-50/60 opacity-75' : 'border-white/80 bg-white/85'
    } ${
      !u.is_active ? 'opacity-50' : 'border-gray-100'
    }`}>
      {/* Avatar */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-sm font-bold text-gray-500">
        {u.email[0].toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm font-semibold text-gray-900">{u.email}</p>
          {isMe && (
            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">tu</span>
          )}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role]}`}>
            {ROLE_LABELS[u.role]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            u.security_questions_configured
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-amber-50 text-amber-700'
          }`}>
            {u.security_questions_configured ? 'Domande impostate' : 'Domande mancanti'}
          </span>
          {!u.is_active && (
            <span className="text-xs bg-red-50 text-red-400 px-2 py-0.5 rounded-full">Disabilitato</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => setConfirmAction('toggle')} title={u.is_active ? 'Disabilita' : 'Abilita'}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors">
          {u.is_active
            ? <ToggleRight className="h-4 w-4 text-green-500" />
            : <ToggleLeft className="h-4 w-4" />}
        </button>
        <button onClick={onReset} title="Reset password"
          className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
          <KeyRound className="h-4 w-4" />
        </button>
        <button onClick={onSecurity} title="Domande di sicurezza"
          className="p-2 rounded-lg text-gray-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
          <ShieldQuestion className="h-4 w-4" />
        </button>
        <button onClick={onEdit} title="Modifica"
          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <Pencil className="h-4 w-4" />
        </button>
        {!isMe && (
          <button onClick={() => setConfirmAction('delete')} title="Elimina"
            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {confirmAction && (
        <div className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="flex-1 text-sm font-semibold text-red-800">
            {confirmAction === 'delete'
              ? `Eliminare ${u.email}?`
              : `${u.is_active ? 'Disattivare' : 'Riattivare'} ${u.email}?`}
          </p>
          <button
            onClick={confirmAction === 'delete' ? handleDelete : handleToggleActive}
            disabled={deleteMutation.isPending || updateMutation.isPending}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirmAction === 'delete' ? 'Elimina' : (u.is_active ? 'Disattiva' : 'Riattiva')}
          </button>
          <button onClick={() => setConfirmAction(null)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100">Annulla</button>
        </div>
      )}
    </div>
  )
}

function UserFormDrawer({ user, onClose }: { user: AppUser | null; onClose: () => void }) {
  const { data: orgs } = useAdminOrganizations()
  const { data: tournaments } = useAdminTournaments()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const isEdit = !!user

  const [form, setForm] = useState({
    email: user?.email ?? '',
    password: '',
    role: user?.role ?? 'SCORE_KEEPER' as UserRole,
    organization_id: user?.organization_id ?? '',
    assigned_tournament_ids: user?.assigned_tournament_ids ?? [],
  })
  const [error, setError] = useState('')

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function toggleTournament(tournamentId: string) {
    setForm((current) => ({
      ...current,
      assigned_tournament_ids: current.assigned_tournament_ids.includes(tournamentId)
        ? current.assigned_tournament_ids.filter((id) => id !== tournamentId)
        : [...current.assigned_tournament_ids, tournamentId],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      if (isEdit) {
        await updateUser.mutateAsync({
          id: user!.id,
          data: {
            role: form.role,
            organization_id: form.organization_id || null,
            assigned_tournament_ids: form.role === 'SCORE_KEEPER' ? form.assigned_tournament_ids : [],
          },
        })
      } else {
        if (!form.password) { setError('La password è obbligatoria'); return }
        if (!isStrongPassword(form.password)) { setError('La password non rispetta i requisiti di sicurezza'); return }
        await createUser.mutateAsync({
          email: form.email,
          password: form.password,
          role: form.role,
          organization_id: form.organization_id || undefined,
          assigned_tournament_ids: form.role === 'SCORE_KEEPER' ? form.assigned_tournament_ids : [],
        })
      }
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il salvataggio')
    }
  }

  const isPending = createUser.isPending || updateUser.isPending
  const rolesNeedingOrg: UserRole[] = ['ORG_ADMIN', 'SCORE_KEEPER']

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? 'Modifica utente' : 'Nuovo utente'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              disabled={isEdit}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green disabled:bg-gray-50 disabled:text-gray-400"
              required />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
                required placeholder="Almeno 12 caratteri" />
              <div className="mt-3">
                <PasswordStrengthField password={form.password} />
              </div>
            </div>
          )}

          {/* Role selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ruolo *</label>
            <div className="space-y-2">
              {(['SUPER_ADMIN', 'ORG_ADMIN', 'SCORE_KEEPER'] as UserRole[]).map(role => (
                <label key={role}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    form.role === role
                      ? 'border-rugby-green bg-rugby-green/5'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}>
                  <input type="radio" name="role" value={role} checked={form.role === role}
                    onChange={() => set('role', role)} className="mt-0.5 accent-rugby-green" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[role]}`}>
                        {ROLE_LABELS[role]}
                      </span>
                      {role === 'SUPER_ADMIN' && <ShieldCheck className="h-3.5 w-3.5 text-purple-500" />}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Organization — shown for non-super-admin roles */}
          {rolesNeedingOrg.includes(form.role) && orgs && orgs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Società
                <span className="font-normal text-gray-400 ml-1 text-xs">(limita accesso alla sola org)</span>
              </label>
              <select value={form.organization_id} onChange={e => set('organization_id', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green">
                <option value="">— tutte le società —</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          )}

          {form.role === 'SCORE_KEEPER' && tournaments && tournaments.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tornei assegnati</label>
              <div className="grid gap-2 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-3">
                {tournaments.map((tournament) => {
                  const checked = form.assigned_tournament_ids.includes(tournament.id)
                  return (
                    <label key={tournament.id} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-sm transition-colors ${checked ? 'border-rugby-green bg-white' : 'border-transparent bg-white/80'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTournament(tournament.id)}
                        className="accent-rugby-green"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{tournament.name}</p>
                        <p className="text-xs text-gray-400">{tournament.slug}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50">
            Annulla
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={isPending || (!isEdit && !isStrongPassword(form.password))}
            className="flex-1 px-4 py-2.5 rounded-lg bg-rugby-green text-white text-sm font-semibold hover:bg-rugby-green-dark disabled:opacity-50">
            {isPending ? 'Salvataggio...' : isEdit ? 'Salva' : 'Crea utente'}
          </button>
        </div>
      </div>
    </>
  )
}

function ResetPasswordModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const resetMutation = useResetPassword()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return
    if (!isStrongPassword(password)) {
      setError('La password non rispetta i requisiti di sicurezza')
      return
    }
    await resetMutation.mutateAsync({ id: user.id, password })
    setDone(true)
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm h-fit bg-white rounded-2xl shadow-2xl z-50 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-amber-500" /> Reset password
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Imposta una nuova password per <span className="font-medium text-gray-700">{user.email}</span>
        </p>

        {done ? (
          <div className="text-center py-4">
            <p className="text-green-600 font-medium text-sm">Password aggiornata</p>
            <button onClick={onClose} className="mt-3 text-sm text-rugby-green underline">Chiudi</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="text-xs text-red-500">{error}</p>}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Nuova password" required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green" />
            <PasswordStrengthField password={password} />
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Conferma password" required
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green ${
                confirm && password !== confirm ? 'border-red-300' : 'border-gray-200'
              }`} />
            {confirm && password !== confirm && (
              <p className="text-xs text-red-500">Le password non coincidono</p>
            )}
            <button type="submit"
              disabled={resetMutation.isPending || password !== confirm || !password || !isStrongPassword(password)}
              className="w-full py-2.5 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
              {resetMutation.isPending ? 'Aggiornamento...' : 'Aggiorna password'}
            </button>
          </form>
        )}
      </div>
    </>
  )
}

function SecurityQuestionsModal({ user, onClose }: { user: AppUser; onClose: () => void }) {
  const { data, isLoading } = useUserSecurityQuestions(user.id)
  const saveMutation = useSaveUserSecurityQuestions(user.id)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const questions = data?.questions ?? []
  const allFilled = questions.length > 0 && questions.every((question) => (answers[question.question_key] || '').trim().length > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      const payload: SecurityQuestionAnswer[] = questions.map((question) => ({
        question_key: question.question_key,
        answer: answers[question.question_key] || '',
      }))
      await saveMutation.mutateAsync(payload)
      setMessage('Domande di sicurezza salvate correttamente.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Impossibile salvare le domande di sicurezza')
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex min-h-full items-center justify-center">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_40px_120px_-45px_rgba(15,23,42,0.65)]">
            <div className="border-b border-slate-100 bg-white px-6 py-5 sm:px-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <ShieldQuestion className="h-5 w-5 text-emerald-700" />
                    Domande di sicurezza
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                </div>
                <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-8rem)] overflow-y-auto bg-white px-6 py-5 sm:px-7">
              {isLoading || !data ? (
                <div className="py-10 text-center text-sm text-slate-500">Caricamento domande di sicurezza...</div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    data.configured
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                      : 'border-amber-100 bg-amber-50 text-amber-800'
                  }`}>
                    {data.configured
                      ? 'Le domande sono già configurate. Puoi aggiornarle da qui.'
                      : 'Questo account non ha ancora completato le domande di sicurezza.'}
                  </div>
                  {error && <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
                  {message && <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

                  <div className="space-y-4">
                    {questions.map((question, index) => (
                      <div key={question.question_key} className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                        <label className="mb-2 block text-sm font-semibold text-slate-800">
                          {index + 1}. {question.question_label}
                        </label>
                        <input
                          type="text"
                          value={answers[question.question_key] || ''}
                          onChange={(e) => setAnswers((current) => ({ ...current, [question.question_key]: e.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
                          placeholder="Inserisci la risposta segreta"
                          autoComplete="off"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Chiudi
                    </button>
                    <button
                      type="submit"
                      disabled={saveMutation.isPending || !allFilled}
                      className="flex-1 rounded-xl bg-rugby-green px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-rugby-green-dark disabled:opacity-50"
                    >
                      {saveMutation.isPending ? 'Salvataggio...' : 'Salva domande'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

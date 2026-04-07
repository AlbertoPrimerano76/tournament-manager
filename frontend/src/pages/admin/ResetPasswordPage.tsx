import { FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'

import { apiClient } from '@/api/client'
import AppLogo from '@/components/AppLogo'
import PasswordStrengthField from '@/components/PasswordStrengthField'
import { isStrongPassword } from '@/lib/passwordStrength'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!token) {
      setError('Token di reset mancante')
      return
    }
    if (password !== confirmPassword) {
      setError('Le password non coincidono')
      return
    }
    if (!isStrongPassword(password)) {
      setError('La password non rispetta i requisiti di sicurezza')
      return
    }

    setLoading(true)
    try {
      await apiClient.post(
        '/api/v1/admin/auth/reset-password',
        { token, password },
        { skipAuth: true, skipAuthRefresh: true } as never,
      )
      setMessage('Password aggiornata. Reindirizzamento al login...')
      window.setTimeout(() => navigate('/admin/login'), 1200)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Impossibile completare il reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-3">
            <AppLogo className="h-20 w-20 drop-shadow-[0_16px_30px_rgba(16,62,49,0.18)]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Nuova Password</h1>
          <p className="text-gray-500 text-sm mt-1">Primo accesso o reset password</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
          {message && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{message}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nuova password</label>
            <div className="relative">
              <KeyRound className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent"
                placeholder="Almeno 8 caratteri"
              />
            </div>
            <div className="mt-3">
              <PasswordStrengthField password={password} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conferma password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent"
              placeholder="Ripeti la password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !isStrongPassword(password) || password !== confirmPassword}
            className="w-full bg-rugby-green text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-rugby-green-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Salvataggio...' : 'Aggiorna password'}
          </button>

          <div className="text-center text-sm">
            <Link to="/admin/login" className="text-rugby-green hover:text-rugby-green-dark font-medium">
              Torna al login
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

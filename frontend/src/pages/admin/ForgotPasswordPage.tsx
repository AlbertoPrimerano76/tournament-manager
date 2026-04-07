import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'

import { apiClient } from '@/api/client'
import AppLogo from '@/components/AppLogo'
import type { SecurityQuestionPrompt } from '@/api/securityQuestions'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [questions, setQuestions] = useState<SecurityQuestionPrompt[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleStart(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await apiClient.post(
        '/api/v1/admin/auth/forgot-password',
        { email },
        { skipAuth: true, skipAuthRefresh: true } as never,
      )
      if (res.data?.reset_token) {
        navigate(`/admin/reset-password?token=${encodeURIComponent(res.data.reset_token)}`)
        return
      }
      if (res.data?.questions?.length) {
        setQuestions(res.data.questions)
        setMessage(res.data.message || 'Rispondi alle domande di sicurezza per continuare.')
        return
      }
      setMessage(res.data?.message || 'Account non disponibile')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Impossibile inviare la richiesta di reset')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const res = await apiClient.post(
        '/api/v1/admin/auth/forgot-password/verify',
        {
          email,
          answers: questions.map((question) => ({
            question_key: question.question_key,
            answer: answers[question.question_key] || '',
          })),
        },
        { skipAuth: true, skipAuthRefresh: true } as never,
      )
      navigate(`/admin/reset-password?token=${encodeURIComponent(res.data.reset_token)}`)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Impossibile verificare le risposte di sicurezza')
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
          <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
          <p className="text-gray-500 text-sm mt-1">Primo accesso o recupero password</p>
        </div>

        <form onSubmit={questions.length ? handleVerify : handleStart} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2">{error}</div>}
          {message && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg px-3 py-2">{message}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="relative">
              <Mail className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-200 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent"
                placeholder="admin@example.com"
              />
            </div>
          </div>

          {questions.length > 0 && (
            <div className="space-y-3">
              {questions.map((question, index) => (
                <div key={question.question_key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {index + 1}. {question.question_label}
                  </label>
                  <input
                    type="text"
                    value={answers[question.question_key] || ''}
                    onChange={(e) => setAnswers((current) => ({ ...current, [question.question_key]: e.target.value }))}
                    required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green focus:border-transparent"
                    placeholder="Risposta segreta"
                    autoComplete="off"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rugby-green text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-rugby-green-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Invio in corso...' : questions.length ? 'Verifica risposte' : 'Continua'}
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

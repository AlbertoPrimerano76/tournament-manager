import { FormEvent, useMemo, useState } from 'react'

import { useMySecurityQuestions, useSaveMySecurityQuestions } from '@/api/securityQuestions'

export default function SecurityQuestionsPage() {
  const { data, isLoading } = useMySecurityQuestions()
  const saveMutation = useSaveMySecurityQuestions()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const questions = data?.questions ?? []
  const allFilled = useMemo(
    () => questions.every((question) => (answers[question.question_key] || '').trim().length > 0),
    [answers, questions],
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await saveMutation.mutateAsync(
        questions.map((question) => ({
          question_key: question.question_key,
          answer: answers[question.question_key] || '',
        })),
      )
      setMessage('Domande di sicurezza salvate correttamente.')
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Impossibile salvare le domande di sicurezza')
    }
  }

  if (isLoading || !data) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento domande di sicurezza...</div>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="bg-[linear-gradient(135deg,_#103e31_0%,_#14523f_58%,_#1c6a51_100%)] px-7 py-8 text-white">
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-100/75">Sicurezza</p>
          <h1 className="mt-3 text-3xl font-black">Domande di sicurezza</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-emerald-50/80">
            Salva tre risposte segrete. Verranno richieste per il ripristino della password se non usi email SMTP.
          </p>
        </div>
      </section>

      <form onSubmit={handleSubmit} className="rounded-[1.7rem] border border-white/80 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)] space-y-4">
        {data.configured && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Domande gia' configurate. Se vuoi, puoi aggiornarle.
          </div>
        )}
        {error && <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {message && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        {questions.map((question, index) => (
          <div key={question.question_key} className="space-y-2">
            <label className="block text-sm font-semibold text-slate-800">
              {index + 1}. {question.question_label}
            </label>
            <input
              type="text"
              value={answers[question.question_key] || ''}
              onChange={(e) => setAnswers((current) => ({ ...current, [question.question_key]: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rugby-green"
              placeholder="Inserisci la tua risposta segreta"
              autoComplete="off"
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={saveMutation.isPending || !allFilled}
          className="inline-flex items-center rounded-xl bg-rugby-green px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-rugby-green-dark disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Salvataggio...' : 'Salva domande di sicurezza'}
        </button>
      </form>
    </div>
  )
}

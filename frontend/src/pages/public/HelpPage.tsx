import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, ClipboardList, ShieldCheck } from 'lucide-react'

const sections = [
  {
    title: '1. Crea il torneo',
    text: 'Configura dati base, impianti, categorie presenti e pubblicazione del torneo.',
  },
  {
    title: '2. Definisci la formula',
    text: 'Per ogni categoria imposta fasi, gironi, qualificazioni, orari, campi e arbitraggi.',
  },
  {
    title: '3. Genera e gestisci il programma',
    text: 'Genera automaticamente partite e calendario, poi correggi manualmente squadre, campi, orari e risultati.',
  },
]

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f2fff7_0%,_#f8fafc_42%,_#edf2f7_100%)]">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-[0_28px_80px_-48px_rgba(15,23,42,0.45)]">
          <div className="bg-[linear-gradient(135deg,_#0e3b2e_0%,_#14523f_100%)] px-8 py-8 text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <BookOpen className="h-3.5 w-3.5" />
              Guida rapida
            </div>
            <h1 className="mt-4 text-3xl font-black sm:text-4xl">Come usare il portale tornei</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 sm:text-base">
              Una guida semplice per creare tornei, configurare categorie, generare il programma e pubblicare risultati.
            </p>
          </div>

          <div className="grid gap-4 px-6 py-6 md:grid-cols-3">
            {sections.map((section, index) => (
              <article key={section.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Passo {index + 1}</p>
                <h2 className="mt-2 text-lg font-black text-slate-950">{section.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{section.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <GuideCard
            icon={<ClipboardList className="h-5 w-5" />}
            title="Formula torneo"
            text="Usa preset, definisci gironi e campi per ogni girone. Salva la struttura prima di aggiungere le squadre."
          />
          <GuideCard
            icon={<CalendarClock className="h-5 w-5" />}
            title="Programma e ritardi"
            text="Dal programma puoi aggiornare orari, applicare ritardi, cambiare campo e arbitro o salvare i risultati."
          />
          <GuideCard
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Pubblicazione"
            text="Le famiglie vedono solo il necessario: categorie, partite, classifiche, mappe e fase finale."
          />
        </section>

        <section className="mt-8 rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-44px_rgba(15,23,42,0.35)]">
          <h2 className="text-xl font-black text-slate-950">Percorso consigliato</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">Prima del torneo</p>
              <p className="mt-2 leading-6">Crea impianti, categorie e formula. Poi genera il programma e verifica campi, arbitri e orari.</p>
            </div>
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-bold text-slate-950">Durante il torneo</p>
              <p className="mt-2 leading-6">Aggiorna risultati, applica ritardi se serve e controlla classifiche e fasi finali direttamente dal pannello admin.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/" className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              Torna alla home
            </Link>
            <Link to="/admin" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
              Apri area amministrativa
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

function GuideCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.4)]">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  )
}

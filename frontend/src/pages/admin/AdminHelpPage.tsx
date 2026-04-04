import { BookOpen, CalendarClock, Flag, MapPinned, Trophy } from 'lucide-react'

const steps = [
  'Crea l’evento e configura gli impianti nella sezione Società.',
  'Attiva le categorie presenti e definisci la formula di ogni categoria.',
  'Imposta orario inizio, durata incontro, intervallo e campi disponibili.',
  'Assegna i campi ai gironi e definisci le regole di arbitraggio.',
  'Genera il programma, controlla le partite e correggi manualmente se necessario.',
  'Durante l’evento aggiorna risultati, ritardi, campi e arbitri dalla gestione operativa.',
]

export default function AdminHelpPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_30px_80px_-48px_rgba(15,23,42,0.45)]">
        <div className="bg-[linear-gradient(135deg,_#103e31_0%,_#14523f_100%)] px-8 py-8 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
            <BookOpen className="h-3.5 w-3.5" />
            Help admin
          </div>
          <h1 className="mt-4 text-3xl font-black">Guida gestione eventi</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-white/75">
            Qui trovi il flusso consigliato per configurare eventi, categorie, programma, orari, campi, arbitri e risultati.
          </p>
        </div>
        <div className="grid gap-4 px-6 py-6 md:grid-cols-2 xl:grid-cols-3">
          {steps.map((step, index) => (
            <article key={step} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Step {index + 1}</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <GuideBox
          icon={<Trophy className="h-5 w-5" />}
          title="Configurazione formula"
          bullets={[
            'Usa i preset come base, poi salva la struttura.',
            'Ogni girone deve avere almeno un campo assegnato.',
            'Se cambi la formula, rigenera il programma dalla fase interessata.',
          ]}
        />
        <GuideBox
          icon={<MapPinned className="h-5 w-5" />}
          title="Impianti e campi"
          bullets={[
            'Gli impianti si configurano sul torneo.',
            'Nel programma categoria definisci i campi reali: impianto + numero.',
            'Ogni girone può usare sempre gli stessi campi.',
          ]}
        />
        <GuideBox
          icon={<CalendarClock className="h-5 w-5" />}
          title="Gestione operativa"
          bullets={[
            'Usa la gestione massiva per impostare orari, campi e arbitri.',
            'Se una partita ritarda, applica il ritardo e propaga sullo stesso campo.',
            'Puoi distinguere rapidamente tra partite da giocare e già giocate.',
          ]}
        />
        <GuideBox
          icon={<Flag className="h-5 w-5" />}
          title="Risultati e classifiche"
          bullets={[
            'Salva i risultati dal pannello partita.',
            'Le classifiche dei gironi si aggiornano in automatico.',
            'Le fasi finali mostrano anche la classifica finale quando completate.',
          ]}
        />
      </section>
    </div>
  )
}

function GuideBox({ icon, title, bullets }: { icon: React.ReactNode; title: string; bullets: string[] }) {
  return (
    <article className="rounded-[1.6rem] border border-white/80 bg-white p-5 shadow-[0_24px_60px_-48px_rgba(15,23,42,0.4)]">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-black text-slate-950">{title}</h2>
      <div className="mt-3 space-y-2">
        {bullets.map((bullet) => (
          <p key={bullet} className="rounded-xl bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
            {bullet}
          </p>
        ))}
      </div>
    </article>
  )
}

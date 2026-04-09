import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import org from '@/config/org'

export default function PublicLayout() {
  const location = useLocation()
  const pageContext = getPublicPageContext(location.pathname)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <img src={org.logoUrl} alt={org.shortName} className="h-9 w-auto shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{org.shortName}</p>
                <p className="truncate text-xs text-slate-500">Tornei, categorie e risultati</p>
              </div>
            </Link>

            <Link
              to="/admin"
              className="inline-flex shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              Area amministrativa
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[
              { to: '/', label: 'Eventi' },
              { to: '/guida', label: 'Guida' },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
              >
                Sito società
              </a>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t border-slate-200/80 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700/80">{pageContext.kicker}</p>
              <p className="text-sm font-semibold text-slate-800">{pageContext.title}</p>
            </div>
            <p className="max-w-2xl text-sm text-slate-500">{pageContext.description}</p>
          </div>
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}

function getPublicPageContext(pathname: string) {
  if (pathname === '/') {
    return {
      kicker: 'Esplora',
      title: 'Elenco eventi pubblicati',
      description: 'Trova rapidamente tornei, raggruppamenti, società organizzatrici e accessi diretti alle categorie.',
    }
  }

  if (pathname === '/guida') {
    return {
      kicker: 'Supporto',
      title: 'Guida pubblico',
      description: 'Indicazioni rapide per consultare categorie, partite, classifiche e mappe degli impianti.',
    }
  }

  if (pathname.startsWith('/tornei/')) {
    return {
      kicker: 'Evento',
      title: 'Programma, categorie e logistica',
      description: 'Usa i percorsi rapidi per entrare nelle categorie, trovare i campi e seguire le partite in corso.',
    }
  }

  if (pathname.startsWith('/partite/')) {
    return {
      kicker: 'Partita',
      title: 'Dettaglio incontro',
      description: 'Consulta punteggio, orario, impianto e stato dell’incontro senza perdere il contesto del torneo.',
    }
  }

  return {
    kicker: 'Società',
    title: 'Calendario attività della società',
    description: 'Eventi organizzati, informazioni di contesto e accesso diretto alle pagine torneo.',
  }
}

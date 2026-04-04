import { Outlet } from 'react-router-dom'
import org from '@/config/org'

export default function PublicLayout() {
  const brandHref = org.website || '/'

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a
            href={brandHref}
            target={org.website ? '_blank' : undefined}
            rel={org.website ? 'noopener noreferrer' : undefined}
            className="flex min-w-0 items-center gap-2"
          >
            <img src={org.logoUrl} alt={org.shortName} className="h-8 w-auto shrink-0 object-contain" />
            <span className="truncate text-sm font-bold text-slate-900">{org.shortName}</span>
          </a>

          <div />
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </div>
  )
}

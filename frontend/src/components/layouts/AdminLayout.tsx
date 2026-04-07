import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Trophy, Users, LayoutDashboard, LogOut, Menu, Building2, Sparkles, BookOpen } from 'lucide-react'
import { useState } from 'react'
import { ROLE_LABELS } from '@/api/users'
import AppLogo from '@/components/AppLogo'

export default function AdminLayout() {
  const { user, isLoading, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/admin/login')
    }
  }, [user, isLoading, navigate])

  if (isLoading || !user) return null

  const navItems = user.role === 'SCORE_KEEPER'
    ? [
        { to: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard', exact: true },
        { to: '/admin/tornei', icon: <Trophy className="h-4 w-4" />, label: 'I miei tornei' },
        { to: '/admin/guida', icon: <BookOpen className="h-4 w-4" />, label: 'Guida' },
      ]
    : user.role === 'SUPER_ADMIN'
      ? [
          { to: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard', exact: true },
          { to: '/admin/societa', icon: <Building2 className="h-4 w-4" />, label: 'Società' },
          { to: '/admin/tornei', icon: <Trophy className="h-4 w-4" />, label: 'Tornei' },
          { to: '/admin/utenti', icon: <Users className="h-4 w-4" />, label: 'Utenti' },
          { to: '/admin/guida', icon: <BookOpen className="h-4 w-4" />, label: 'Guida' },
        ]
      : [
          { to: '/admin', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard', exact: true },
          { to: '/admin/societa', icon: <Building2 className="h-4 w-4" />, label: 'Società' },
          { to: '/admin/tornei', icon: <Trophy className="h-4 w-4" />, label: 'Tornei' },
          { to: '/admin/guida', icon: <BookOpen className="h-4 w-4" />, label: 'Guida' },
        ]

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfff4_0%,_#f4f7fb_40%,_#e9eef5_100%)] flex">
      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-[linear-gradient(180deg,_#0a2f26_0%,_#103e31_55%,_#0f4737_100%)] text-white transform transition-transform
        md:relative md:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="border-b border-white/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 p-1">
              <AppLogo className="h-10 w-10" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/72">Area amministrativa</p>
              <span className="text-lg font-bold">Pannello tornei</span>
            </div>
          </div>
          <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-emerald-100/80">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.22em]">Utente collegato</span>
            </div>
            <p className="mt-3 truncate text-sm font-semibold text-white">{user.email}</p>
            <p className="mt-1 text-xs text-emerald-50/78">{ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] ?? user.role}</p>
          </div>
        </div>
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const isActive = item.exact ? location.pathname === item.to : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-[#103e31] shadow-lg' : 'text-emerald-50/72 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-4 left-4 right-4">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm text-emerald-50/72 transition-colors hover:bg-red-600 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Esci
          </button>
        </div>
      </aside>

      {/* Overlay on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/70 bg-white/70 px-4 shadow-sm backdrop-blur md:px-6">
          <button className="rounded-xl p-2 hover:bg-slate-100 md:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Panoramica</p>
            <p className="text-sm font-semibold text-slate-800">Gestione tornei, società e contenuti pubblici</p>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

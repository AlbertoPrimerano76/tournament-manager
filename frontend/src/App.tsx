import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider } from '@/context/AuthContext'
import PublicLayout from '@/components/layouts/PublicLayout'
import AdminLayout from '@/components/layouts/AdminLayout'

const HomePage = lazy(() => import('@/pages/public/HomePage'))
const OrgPage = lazy(() => import('@/pages/public/OrgPage'))
const TournamentPage = lazy(() => import('@/pages/public/TournamentPage'))
const AgeGroupPage = lazy(() => import('@/pages/public/AgeGroupPage'))
const MatchPage = lazy(() => import('@/pages/public/MatchPage'))
const HelpPage = lazy(() => import('@/pages/public/HelpPage'))

const LoginPage = lazy(() => import('@/pages/admin/LoginPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/admin/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/admin/ResetPasswordPage'))
const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const TournamentsAdminPage = lazy(() => import('@/pages/admin/TournamentsAdminPage'))
const AgeGroupBracketPage = lazy(() => import('@/pages/admin/AgeGroupBracketPage'))
const UsersAdminPage = lazy(() => import('@/pages/admin/UsersAdminPage'))
const OrganizationsAdminPage = lazy(() => import('@/pages/admin/OrganizationsAdminPage'))
const AdminHelpPage = lazy(() => import('@/pages/admin/AdminHelpPage'))

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rugby-green" />
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/:orgSlug" element={<OrgPage />} />
              <Route path="/guida" element={<HelpPage />} />
              <Route path="/tornei/:slug" element={<TournamentPage />} />
              <Route path="/tornei/:slug/:ageGroupId" element={<AgeGroupPage />} />
              <Route path="/partite/:matchId" element={<MatchPage />} />
            </Route>

            {/* Admin routes */}
            <Route path="/admin/login" element={<LoginPage />} />
            <Route path="/admin/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="tornei" element={<TournamentsAdminPage />} />
              <Route path="tornei/nuovo" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/modifica" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/gestione" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/categorie" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/calendario" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/categorie/:ageGroupId/gestione" element={<TournamentsAdminPage />} />
              <Route path="tornei/:tournamentId/categorie/:ageGroupId/tabellone" element={<AgeGroupBracketPage />} />
              <Route path="tornei/:tournamentId/categorie/:ageGroupId" element={<TournamentsAdminPage />} />
              <Route path="societa" element={<OrganizationsAdminPage />} />
              <Route path="utenti" element={<UsersAdminPage />} />
              <Route path="guida" element={<AdminHelpPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { apiClient } from '@/api/client'

interface AuthUser {
  id: string
  email: string
  role: string
  organization_id: string | null
}

interface AuthState {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const AUTH_EMAIL_KEY = 'auth_user_email'

function clearStoredAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(AUTH_EMAIL_KEY)
}

function decodeAccessToken(token: string): { sub: string; role: string; exp?: number } | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (!payload?.sub || !payload?.role) {
      return null
    }
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const email = localStorage.getItem(AUTH_EMAIL_KEY) ?? ''
    if (token) {
      const payload = decodeAccessToken(token)
      if (payload) {
        setUser({ id: payload.sub, email, role: payload.role, organization_id: null })
      } else {
        clearStoredAuth()
      }
    }
    setIsLoading(false)
  }, [])

  async function login(email: string, password: string) {
    const res = await apiClient.post('/api/v1/admin/auth/login', { email, password })
    localStorage.setItem(ACCESS_TOKEN_KEY, res.data.access_token)
    localStorage.setItem(REFRESH_TOKEN_KEY, res.data.refresh_token)
    localStorage.setItem(AUTH_EMAIL_KEY, email)
    const payload = decodeAccessToken(res.data.access_token)
    if (!payload) {
      clearStoredAuth()
      throw new Error('Token di accesso non valido')
    }
    setUser({ id: payload.sub, email, role: payload.role, organization_id: null })
  }

  function logout() {
    clearStoredAuth()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import axios from 'axios'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
})

function clearAuthState() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('auth_user_email')
}

function redirectToLogin() {
  if (window.location.pathname !== '/admin/login') {
    window.location.href = '/admin/login'
  }
}

function isAdminApiRequest(url?: string) {
  return typeof url === 'string' && url.startsWith('/api/v1/admin')
}

// Attach access token only to admin requests
apiClient.interceptors.request.use((config) => {
  if ((config as { skipAuth?: boolean }).skipAuth) return config
  if (!isAdminApiRequest(config.url)) return config
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Auto-refresh only for admin requests
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as { _retry?: boolean; skipAuthRefresh?: boolean; headers?: { Authorization?: string }; url?: string } | undefined
    const status = error.response?.status
    if ((status === 401 || status === 403) && original && isAdminApiRequest(original.url) && !original._retry && !original.skipAuthRefresh) {
      original._retry = true
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        try {
          const res = await apiClient.post(
            '/api/v1/admin/auth/refresh',
            { refresh_token: refresh },
            { skipAuth: true, skipAuthRefresh: true } as never,
          )
          localStorage.setItem('access_token', res.data.access_token)
          localStorage.setItem('refresh_token', res.data.refresh_token)
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${res.data.access_token}`
          return apiClient(original)
        } catch {
          clearAuthState()
          redirectToLogin()
        }
      } else {
        clearAuthState()
        redirectToLogin()
      }
    }
    return Promise.reject(error)
  },
)

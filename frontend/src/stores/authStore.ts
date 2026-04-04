import { create } from 'zustand'

interface AuthStore {
  isAuthenticated: boolean
  setAuthenticated: (val: boolean) => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: !!localStorage.getItem('access_token'),
  setAuthenticated: (val) => set({ isAuthenticated: val }),
}))

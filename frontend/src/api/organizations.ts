import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'
import axios from 'axios'

export interface Organization {
  id: string
  name: string
  slug: string
  logo_url: string | null
  city: string | null
  website: string | null
  primary_color: string
  accent_color: string
}

export function useAdminOrganizations() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await apiClient.get<Organization[]>('/api/v1/admin/organizations')
      return res.data
    },
  })
}

export function usePublicOrganization(slug: string) {
  return useQuery({
    queryKey: ['public-org', slug],
    queryFn: async () => {
      const res = await axios.get<Organization>(`/api/v1/organizations/${slug}`)
      return res.data
    },
    enabled: !!slug,
    retry: false,
  })
}

export function usePublicTournamentOrganization(slug: string) {
  return useQuery({
    queryKey: ['public-tournament-org', slug],
    queryFn: async () => {
      const res = await axios.get<Organization>(`/api/v1/tournaments/${slug}/organization`)
      return res.data
    },
    enabled: !!slug,
    retry: false,
  })
}

export function useCreateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; slug: string; city?: string; website?: string; primary_color?: string; accent_color?: string }) => {
      const res = await apiClient.post<Organization>('/api/v1/admin/organizations', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useDeleteOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/v1/admin/organizations/${id}`)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

export function useUpdateOrganization() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; logo_url?: string; city?: string; website?: string; primary_color?: string; accent_color?: string } }) => {
      const res = await apiClient.put<Organization>(`/api/v1/admin/organizations/${id}`, data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['organizations'] }),
  })
}

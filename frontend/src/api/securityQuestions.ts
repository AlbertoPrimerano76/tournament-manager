import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiClient } from './client'

export type SecurityQuestionPrompt = {
  position: number
  question_key: string
  question_label: string
}

export type SecurityQuestionAnswer = {
  question_key: string
  answer: string
}

export function useMySecurityQuestions() {
  return useQuery({
    queryKey: ['security-questions'],
    queryFn: async () => {
      const res = await apiClient.get<{ configured: boolean; questions: SecurityQuestionPrompt[] }>('/api/v1/admin/auth/security-questions')
      return res.data
    },
  })
}

export function useSaveMySecurityQuestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (answers: SecurityQuestionAnswer[]) => {
      await apiClient.post('/api/v1/admin/auth/security-questions', { answers })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['security-questions'] }),
  })
}

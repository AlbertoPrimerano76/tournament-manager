import { apiClient } from './client'

export interface UploadOptions {
  folder?: string
  maxDim?: number
}

export async function uploadImage(file: File, opts: UploadOptions = {}): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('folder', opts.folder ?? 'misc')
  fd.append('max_dim', String(opts.maxDim ?? 800))
  const res = await apiClient.post<{ url: string }>('/api/v1/admin/upload/image', fd, {
    headers: { 'Content-Type': undefined }, // let axios set multipart/form-data + boundary automatically
  })
  return res.data.url
}

import { useRef, useState } from 'react'
import { Upload, Loader2, X, Image as ImageIcon } from 'lucide-react'
import { uploadImage } from '@/api/upload'

interface Props {
  value: string
  onChange: (url: string) => void
  folder: string
  maxDim?: number
  preview?: 'square' | 'wide'
  placeholder?: string
  label?: string
}

export default function ImageUpload({
  value,
  onChange,
  folder,
  maxDim = 800,
  preview = 'square',
  placeholder,
  label,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadImage(file, { folder, maxDim })
      onChange(url)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg ?? 'Errore durante il caricamento')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const previewClass = preview === 'wide'
    ? 'w-full h-36 rounded-xl object-cover border border-gray-200'
    : 'w-16 h-16 rounded-xl object-contain p-1 border border-gray-200 bg-gray-50'

  return (
    <div>
      {label && <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className={preview === 'wide' ? 'space-y-2' : 'flex items-center gap-4'}>
        {/* Preview */}
        {value ? (
          <div className="relative shrink-0">
            <img src={value} alt="preview" className={previewClass} />
            <button
              type="button"
              onClick={() => onChange('')}
              className="absolute -top-1.5 -right-1.5 bg-white border border-gray-200 text-gray-500 rounded-full p-0.5 hover:text-red-500 transition-colors shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className={`shrink-0 flex items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl ${
            preview === 'wide' ? 'w-full h-36' : 'w-16 h-16'
          }`}>
            <ImageIcon className="h-6 w-6 text-gray-300" />
          </div>
        )}

        <div className="flex flex-col gap-1.5 flex-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 w-fit"
          >
            {uploading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Caricamento...</>
              : <><Upload className="h-4 w-4" /> {value ? 'Sostituisci' : (placeholder ?? 'Carica immagine')}</>
            }
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!error && <p className="text-xs text-gray-400">JPG, PNG o WebP · max {5} MB</p>}
        </div>
      </div>
    </div>
  )
}

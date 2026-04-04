import { AlertCircle } from 'lucide-react'

interface Props {
  message?: string
  retry?: () => void
}

export default function ErrorMessage({ message = 'Si è verificato un errore', retry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center px-4">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <p className="text-gray-600">{message}</p>
      {retry && (
        <button
          onClick={retry}
          className="text-sm text-rugby-green font-medium underline underline-offset-2"
        >
          Riprova
        </button>
      )}
    </div>
  )
}

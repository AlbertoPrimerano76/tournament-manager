import { getPasswordChecks, getPasswordScore, getPasswordStrengthLabel } from '@/lib/passwordStrength'

type Props = {
  password: string
}

const meterClasses = [
  'bg-red-400',
  'bg-red-400',
  'bg-amber-400',
  'bg-amber-400',
  'bg-emerald-500',
]

export default function PasswordStrengthField({ password }: Props) {
  const checks = getPasswordChecks(password)
  const score = getPasswordScore(password)
  const label = getPasswordStrengthLabel(password)
  const activeBars = Math.max(score, password ? 1 : 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-600">Sicurezza password</span>
        <span className={`font-semibold ${score >= 5 ? 'text-emerald-600' : score >= 3 ? 'text-amber-600' : 'text-red-500'}`}>
          {label}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className={`h-2 rounded-full ${index < activeBars ? meterClasses[Math.min(score, 5) - 1] : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <div className="grid gap-1 text-xs text-gray-500">
        <PasswordRule ok={checks.minLength} label="Almeno 12 caratteri" />
        <PasswordRule ok={checks.upper} label="Una lettera maiuscola" />
        <PasswordRule ok={checks.lower} label="Una lettera minuscola" />
        <PasswordRule ok={checks.digit} label="Un numero" />
        <PasswordRule ok={checks.special} label="Un simbolo speciale" />
      </div>
    </div>
  )
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return <div className={ok ? 'text-emerald-600' : 'text-gray-500'}>{ok ? '✓' : '•'} {label}</div>
}

export type PasswordChecks = {
  minLength: boolean
  upper: boolean
  lower: boolean
  digit: boolean
  special: boolean
}

export function getPasswordChecks(password: string): PasswordChecks {
  return {
    minLength: password.length >= 12,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    digit: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  }
}

export function getPasswordScore(password: string): number {
  const checks = getPasswordChecks(password)
  return Object.values(checks).filter(Boolean).length
}

export function isStrongPassword(password: string): boolean {
  const checks = getPasswordChecks(password)
  return Object.values(checks).every(Boolean)
}

export function getPasswordStrengthLabel(password: string): string {
  const score = getPasswordScore(password)
  if (score <= 2) return 'Debole'
  if (score <= 4) return 'Media'
  return 'Robusta'
}

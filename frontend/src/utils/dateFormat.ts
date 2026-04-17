import { format, isToday, isTomorrow, isYesterday } from 'date-fns'
import { it } from 'date-fns/locale'

export function formatMatchDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return `Oggi ${format(d, 'HH:mm')}`
  if (isTomorrow(d)) return `Domani ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `Ieri ${format(d, 'HH:mm')}`
  return format(d, "EEE d MMM, HH:mm", { locale: it })
}

export function formatDate(dateStr: string): string {
  return format(new Date(dateStr), 'd MMMM yyyy', { locale: it })
}

/**
 * Strips the age-group category suffix that _build_field_name() appends for
 * internal conflict detection (e.g. "Campo G. Maneo · U8" → "Campo G. Maneo").
 * The suffix is a short word-like code (≤5 chars, no spaces) after " · ".
 */
export function stripFieldCategory(name: string): string {
  const parts = name.split(' · ')
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    if (last.length <= 5 && !/\s/.test(last)) {
      return parts.slice(0, -1).join(' · ')
    }
  }
  return name
}

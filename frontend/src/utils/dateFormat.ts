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

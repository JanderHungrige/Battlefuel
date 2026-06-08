// NATO JLSG logistic site types (AJP-4.6, v2 Wave 11 F5). Mirrors the backend
// app/domain/supply.py LogisticSiteType. Shared by the add-site picker and the supply panel.

export type LogisticSiteType = 'bsa' | 'cssbn' | 'dob' | 'fls' | 'tlb'

export const LOGISTIC_SITE_TYPES: readonly LogisticSiteType[] = [
  'bsa',
  'cssbn',
  'dob',
  'fls',
  'tlb',
] as const

const LABELS: Record<LogisticSiteType, string> = {
  bsa: 'Brigade Support Area (BSA)',
  cssbn: 'CSS Battalion (CSSBN)',
  dob: 'Deployable Operating Base (DOB)',
  fls: 'Forward Logistic Site (FLS)',
  tlb: 'Theatre Logistic Base (TLB)',
}

export function logisticSiteLabel(type: string | null | undefined): string {
  if (!type) return 'Depot'
  return LABELS[type as LogisticSiteType] ?? type
}

export function logisticSiteShort(type: string | null | undefined): string {
  return type ? type.toUpperCase() : 'DEPOT'
}

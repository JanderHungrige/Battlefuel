// NATO fuel-order fulfilment stages (v2 Wave 11 F4) — labels + ordering shared by the order
// history panel and the chatter description. Mirrors backend app/domain/buy_order.py NatoStage.

export type NatoStage =
  | 'placed'
  | 'confirmed_jlsg'
  | 'confirmed_jtf'
  | 'confirmed_provider'
  | 'on_route'
  | 'reached_jlsg'
  | 'reached_opcon'

export const NATO_STAGES: readonly NatoStage[] = [
  'placed',
  'confirmed_jlsg',
  'confirmed_jtf',
  'confirmed_provider',
  'on_route',
  'reached_jlsg',
  'reached_opcon',
] as const

const LABELS: Record<NatoStage, string> = {
  placed: 'Order placed',
  confirmed_jlsg: 'Confirmed by JLSG',
  confirmed_jtf: 'Confirmed by JTF',
  confirmed_provider: 'Confirmed by Fuel Provider',
  on_route: 'Fuel on route',
  reached_jlsg: 'Fuel reached JLSG',
  reached_opcon: 'Fuel reached OPCON',
}

export function natoStageLabel(stage: NatoStage | undefined | null): string {
  return stage ? (LABELS[stage] ?? stage) : LABELS.placed
}

/** 0-based index in the progression, or 0 for an unknown/missing stage. */
export function natoStageIndex(stage: NatoStage | undefined | null): number {
  const i = stage ? NATO_STAGES.indexOf(stage) : -1
  return i < 0 ? 0 : i
}

export function isFinalStage(stage: NatoStage | undefined | null): boolean {
  return stage === 'reached_opcon'
}

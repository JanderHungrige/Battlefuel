// Call-sign labelling (v2 W13 correction): show the unit TYPE behind a call sign in lists/panels.

interface NamedType {
  id: string
  name: string
}

/** The human unit-type name for a unit_type_id, or '' when unknown. */
export function unitTypeName(unitTypeId: string, unitTypes: readonly NamedType[]): string {
  return unitTypes.find((t) => t.id === unitTypeId)?.name ?? ''
}

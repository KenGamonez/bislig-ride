/**
 * Driver group catalog for the Driver Login experience.
 *
 * The list is intentionally data-driven: future groups are added by
 * appending another definition here rather than redesigning the login UI.
 *
 * NOTE: group selection is currently UI-level only. There is no
 * group/organization field in the driver data model, so selection does NOT
 * authenticate or authorize group membership — login continues through the
 * exact existing credential path. Once the backend supports driver groups,
 * connect `selectedGroupId` at the sign-in call site without rebuilding the UI.
 */
import type { TranslationKey } from './i18n'

export type DriverGroup = {
  id: string
  labelKey: TranslationKey
  descriptionKey: TranslationKey
}

export const DRIVER_GROUPS: readonly DriverGroup[] = [
  {
    id: 'btrp-toda',
    labelKey: 'auth.groupBtrp',
    descriptionKey: 'auth.groupBtrpDesc',
  },
  {
    id: 'independent',
    labelKey: 'auth.groupIndependent',
    descriptionKey: 'auth.groupIndependentDesc',
  },
]

export function isKnownDriverGroup(groupId: string | null): boolean {
  return typeof groupId === 'string' && DRIVER_GROUPS.some((group) => group.id === groupId)
}

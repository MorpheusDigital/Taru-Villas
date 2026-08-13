import type {
  EngineEmployee,
  EngineProperty,
  EngineRole,
  EngineShiftTemplate,
} from './types'

export interface SelectShiftTemplateArgs {
  employee: EngineEmployee
  role: EngineRole
  property: EngineProperty
  activeRank: number
  activeCount: number
  templates: EngineShiftTemplate[]
}

function preferredTemplateCodes(
  role: EngineRole,
  property: EngineProperty,
  activeRank: number,
  activeCount: number,
): string[] {
  if (role.code === 'BRIDGE_COMMIS') return ['BRIDGE_COMMIS']
  if (role.code === 'NIGHT_AUDITOR') return ['NIGHT_AUDITOR']
  if (role.code === 'GSA') {
    return [activeRank % 2 === 0 ? 'GSA_MORNING' : 'GSA_EVENING']
  }
  if (role.isPropertyManager && activeCount === 1) return ['SOLO_PIC']
  if (property.safariFocus) return ['SAFARI_EARLY', 'DEFAULT']

  if (['WAITER', 'HOUSEKEEPER'].includes(role.code)) {
    if (activeCount === 1) return ['ACTIVE_1_SPLIT']
    if (activeCount === 2) {
      return [activeRank === 0 ? 'ACTIVE_2_MORNING' : 'ACTIVE_2_CLOSE']
    }
    if (activeRank === 0) return ['ACTIVE_3_PLUS_MORNING']
    if (activeRank === 1) return ['ACTIVE_3_PLUS_CLOSE']
    return ['ACTIVE_3_PLUS_SPLIT']
  }

  return ['DEFAULT']
}

function isEligibleForTemplate(
  employee: EngineEmployee,
  role: EngineRole,
  property: EngineProperty,
  template: EngineShiftTemplate,
): boolean {
  const isSplit = template.segments.length > 1

  if (property.multiZoneSeparation && role.code === 'WAITER' && isSplit) {
    return false
  }

  if (employee.residencyType === 'commuter') {
    if (isSplit) return false

    const worksPastTransport = template.segments.some(
      (segment) =>
        segment.endsNextDay || segment.endTime > property.transportCutoff,
    )

    if (worksPastTransport) return false
  }

  if (
    role.code !== 'NIGHT_AUDITOR' &&
    template.segments.some(
      (segment) =>
        segment.endsNextDay || segment.endTime > property.barCloseTime,
    )
  ) {
    return false
  }

  return true
}

export function selectShiftTemplate({
  employee,
  role,
  property,
  activeRank,
  activeCount,
  templates,
}: SelectShiftTemplateArgs): EngineShiftTemplate | null {
  const preferredCodes = preferredTemplateCodes(
    role,
    property,
    activeRank,
    activeCount,
  )
  const candidates = templates
    .filter(
      (template) =>
        template.roleId === role.id && preferredCodes.includes(template.code),
    )
    .sort(
      (left, right) =>
        preferredCodes.indexOf(left.code) - preferredCodes.indexOf(right.code) ||
        left.id.localeCompare(right.id),
    )

  return (
    candidates.find((template) =>
      isEligibleForTemplate(employee, role, property, template),
    ) ?? null
  )
}

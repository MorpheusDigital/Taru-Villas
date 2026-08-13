import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })

const args = process.argv.slice(2)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

function fail(message) {
  throw new Error(
    `${message}\nUsage: npm run seed:tarushift-demo -- HUB_PROPERTY_UUID SPOKE_PROPERTY_UUID YYYY-MM`,
  )
}

if (args.length !== 3) fail('Exactly three arguments are required.')
const [hubPropertyId, spokePropertyId, monthArg] = args
if (!uuidPattern.test(hubPropertyId) || !uuidPattern.test(spokePropertyId)) {
  fail('Both property IDs must be valid UUIDs.')
}
if (hubPropertyId === spokePropertyId) fail('Hub and spoke properties must differ.')
if (!monthPattern.test(monthArg)) fail('Month must use YYYY-MM.')

const connectionString = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
if (!connectionString) fail('POSTGRES_URL or DATABASE_URL is required.')

function datesInMonth(month) {
  const [year, monthNumber] = month.split('-').map(Number)
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, '0')}`,
  )
}

function precedingMondayBoundary(month) {
  const first = new Date(`${month}-01T00:00:00.000Z`)
  const mondayOffset = (first.getUTCDay() + 6) % 7
  return Array.from({ length: mondayOffset }, (_, index) => {
    const date = new Date(first)
    date.setUTCDate(first.getUTCDate() - mondayOffset + index)
    return date.toISOString().slice(0, 10)
  })
}

const departments = [
  ['DEMO_MANAGEMENT', 'Management', 1],
  ['DEMO_FRONT_OFFICE', 'Front Office', 2],
  ['DEMO_CULINARY', 'Culinary', 3],
  ['DEMO_FB', 'Food & Beverage', 4],
  ['DEMO_HOUSEKEEPING', 'Housekeeping', 5],
  ['DEMO_SUPPORT', 'Engineering & Support', 6],
]

const roleDefinitions = [
  ['DEMO_AREA_MANAGER', 'Area Manager', 'DEMO_MANAGEMENT', 'fixed', false, true, false, 0],
  ['DEMO_PROPERTY_MANAGER', 'Property Manager / PIC', 'DEMO_MANAGEMENT', 'fixed', false, false, true, 0],
  ['DEMO_NIGHT_AUDITOR', 'Night Auditor', 'DEMO_FRONT_OFFICE', 'fixed', false, false, false, 0],
  ['DEMO_GSA', 'Guest Service Associate', 'DEMO_FRONT_OFFICE', 'variable', true, false, false, 0],
  ['DEMO_BRIDGE_COMMIS', 'Bridge Commis', 'DEMO_CULINARY', 'variable', true, false, false, 0],
  ['DEMO_CHEF', 'Chef', 'DEMO_CULINARY', 'variable', true, false, false, 1],
  ['DEMO_WAITER', 'Waiter', 'DEMO_FB', 'variable', true, false, false, 1],
  ['DEMO_HOUSEKEEPER', 'Housekeeper', 'DEMO_HOUSEKEEPING', 'variable', true, false, false, 1],
  ['DEMO_MAINTENANCE', 'Maintenance', 'DEMO_SUPPORT', 'fixed', false, false, false, 0],
  ['DEMO_DRIVER_GARDENER', 'Driver / Gardener', 'DEMO_SUPPORT', 'fixed', false, false, false, 0],
  ['DEMO_SWEEPER', 'Sweeper', 'DEMO_SUPPORT', 'fixed', false, false, false, 0],
  ['DEMO_SUPPORT', 'Operations Support', 'DEMO_SUPPORT', 'variable', true, false, false, 0],
]

const employees = [
  ['DEMO-001', 'Amara Jayasinghe', 'DEMO_AREA_MANAGER', 'hub', 'commuter', 22],
  ['DEMO-002', 'Nimali Perera', 'DEMO_PROPERTY_MANAGER', 'spoke', 'resident', 28],
  ['DEMO-003', 'Ruwan Silva', 'DEMO_NIGHT_AUDITOR', 'hub', 'resident', 18],
  ['DEMO-004', 'Tharushi Fernando', 'DEMO_GSA', 'hub', 'commuter', 16],
  ['DEMO-005', 'Dinuka Senanayake', 'DEMO_GSA', 'hub', 'resident', 64],
  ['DEMO-006', 'Kavindi Wijesinghe', 'DEMO_GSA', 'spoke', 'commuter', 14],
  ['DEMO-007', 'Sahan Gunasekara', 'DEMO_BRIDGE_COMMIS', 'hub', 'resident', 36],
  ['DEMO-008', 'Maduwanthi Kumari', 'DEMO_CHEF', 'hub', 'commuter', 58],
  ['DEMO-009', 'Kasun Rathnayake', 'DEMO_CHEF', 'hub', 'commuter', 17],
  ['DEMO-010', 'Piumi Lakmali', 'DEMO_CHEF', 'spoke', 'resident', 52],
  ['DEMO-011', 'Isuru Madushanka', 'DEMO_WAITER', 'hub', 'resident', 68],
  ['DEMO-012', 'Chathurika Mendis', 'DEMO_WAITER', 'hub', 'resident', 12],
  ['DEMO-013', 'Akila Bandara', 'DEMO_WAITER', 'spoke', 'resident', 48],
  ['DEMO-014', 'Sewwandi Nadeesha', 'DEMO_WAITER', 'spoke', 'resident', 19],
  ['DEMO-015', 'Gayan Priyantha', 'DEMO_HOUSEKEEPER', 'hub', 'resident', 44],
  ['DEMO-016', 'Hansani Dilrukshi', 'DEMO_HOUSEKEEPER', 'hub', 'resident', 15],
  ['DEMO-017', 'Nuwan Sampath', 'DEMO_HOUSEKEEPER', 'spoke', 'resident', 34],
  ['DEMO-018', 'Dilani Pushpika', 'DEMO_MAINTENANCE', 'hub', 'commuter', 13],
  ['DEMO-019', 'Chamod Wickramasinghe', 'DEMO_MAINTENANCE', 'spoke', 'commuter', 41],
  ['DEMO-020', 'Supun Lakshan', 'DEMO_DRIVER_GARDENER', 'hub', 'commuter', 18],
  ['DEMO-021', 'Shyamali De Silva', 'DEMO_SWEEPER', 'spoke', 'resident', 27],
  ['DEMO-022', 'Malith Ekanayake', 'DEMO_SUPPORT', 'hub', 'commuter', 20],
]

function templatesForRole(roleCode) {
  if (roleCode === 'DEMO_BRIDGE_COMMIS') {
    return [['BRIDGE_COMMIS', 'Bridge Commis 11:00–20:00', [[11, 0, 20, 0, false]]]]
  }
  if (roleCode === 'DEMO_NIGHT_AUDITOR') {
    return [['NIGHT_AUDITOR', 'Night Auditor 22:00–07:00', [[22, 0, 7, 0, true]]]]
  }
  if (roleCode === 'DEMO_GSA') {
    return [
      ['GSA_MORNING', 'GSA Morning 07:00–16:00', [[7, 0, 16, 0, false]]],
      ['GSA_EVENING', 'GSA Evening 14:00–23:00', [[14, 0, 23, 0, false]]],
    ]
  }
  if (roleCode === 'DEMO_PROPERTY_MANAGER') {
    return [['SOLO_PIC', 'Solo PIC Split', [[11, 0, 16, 0, false], [19, 0, 23, 0, false]]]]
  }
  if (['DEMO_WAITER', 'DEMO_HOUSEKEEPER'].includes(roleCode)) {
    return [
      ['ACTIVE_1_SPLIT', 'Solo Active Split', [[7, 0, 12, 0, false], [18, 0, 22, 0, false]]],
      ['ACTIVE_2_MORNING', 'Two Active Morning', [[7, 0, 16, 0, false]]],
      ['ACTIVE_2_CLOSE', 'Two Active Close', [[14, 0, 23, 0, false]]],
      ['ACTIVE_3_PLUS_MORNING', 'Three Plus Morning', [[7, 0, 16, 0, false]]],
      ['ACTIVE_3_PLUS_CLOSE', 'Three Plus Close', [[14, 0, 23, 0, false]]],
      ['ACTIVE_3_PLUS_SPLIT', 'Three Plus Split', [[7, 0, 12, 0, false], [18, 0, 22, 0, false]]],
    ]
  }
  return [['DEFAULT', 'Standard 07:00–16:00', [[7, 0, 16, 0, false]]]]
}

function time(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

const client = postgres(connectionString, { prepare: false, max: 1 })

try {
  const selected = await client`
    select id, org_id, name, code, is_active
    from properties
    where id in (${hubPropertyId}, ${spokePropertyId})
    order by id
  `
  if (selected.length !== 2) fail('Both selected properties must exist.')
  if (selected.some((property) => !property.is_active)) fail('Both selected properties must be active.')
  if (new Set(selected.map((property) => property.org_id)).size !== 1) {
    fail('Selected properties must belong to the same organization.')
  }

  const hubProperty = selected.find((property) => property.id === hubPropertyId)
  const spokeProperty = selected.find((property) => property.id === spokePropertyId)
  const orgId = hubProperty.org_id
  const month = `${monthArg}-01`
  const monthDates = datesInMonth(monthArg)
  const boundaryDates = precedingMondayBoundary(monthArg)

  const outcome = await client.begin(async (sql) => {
    const [hub] = await sql`
      insert into roster_hubs (org_id, name, code, is_active)
      values (${orgId}, ${`Demo ${hubProperty.name} Hub`}, ${`DEMO_${hubProperty.code}_${spokeProperty.code}`}, true)
      on conflict (org_id, code) do update
      set name = excluded.name, is_active = true, updated_at = now()
      returning id, name, code
    `

    for (const [propertyId, kind] of [[hubPropertyId, 'hub'], [spokePropertyId, 'spoke']]) {
      const memberships = await sql`select hub_id from roster_hub_properties where property_id = ${propertyId}`
      if (memberships.length && memberships[0].hub_id !== hub.id) {
        throw new Error(`Property ${propertyId} already belongs to another roster hub.`)
      }
      await sql`
        insert into roster_hub_properties (hub_id, property_id, kind, is_active)
        values (${hub.id}, ${propertyId}, ${kind}, true)
        on conflict (property_id) do update
        set kind = excluded.kind, is_active = true, updated_at = now()
      `
    }

    const departmentIds = new Map()
    for (const [code, name, sortOrder] of departments) {
      const [row] = await sql`
        insert into roster_departments (org_id, name, code, sort_order, is_active)
        values (${orgId}, ${name}, ${code}, ${sortOrder}, true)
        on conflict (org_id, code) do update
        set name = excluded.name, sort_order = excluded.sort_order, is_active = true, updated_at = now()
        returning id, code
      `
      departmentIds.set(row.code, row.id)
    }

    const roleIds = new Map()
    for (const [code, name, departmentCode, laborTier, relief, area, manager, minimumFloor] of roleDefinitions) {
      const [row] = await sql`
        insert into roster_roles (
          org_id, department_id, name, code, labor_tier,
          same_hub_relief_eligible, is_area_manager, is_property_manager,
          is_minimum_floor_role, minimum_floor, is_active
        ) values (
          ${orgId}, ${departmentIds.get(departmentCode)}, ${name}, ${code}, ${laborTier},
          ${relief}, ${area}, ${manager}, ${minimumFloor > 0}, ${minimumFloor}, true
        )
        on conflict (org_id, code) do update set
          department_id = excluded.department_id,
          name = excluded.name,
          labor_tier = excluded.labor_tier,
          same_hub_relief_eligible = excluded.same_hub_relief_eligible,
          is_area_manager = excluded.is_area_manager,
          is_property_manager = excluded.is_property_manager,
          is_minimum_floor_role = excluded.is_minimum_floor_role,
          minimum_floor = excluded.minimum_floor,
          is_active = true,
          updated_at = now()
        returning id, code
      `
      roleIds.set(row.code, row.id)
    }

    const employeeIds = new Map()
    for (const [number, name, roleCode, propertyKind, residency, distance] of employees) {
      const [row] = await sql`
        insert into roster_employees (
          org_id, employee_number, full_name, role_id, base_property_id,
          residency_type, home_distance_km, employment_start_date, is_active, is_demo
        ) values (
          ${orgId}, ${number}, ${name}, ${roleIds.get(roleCode)},
          ${propertyKind === 'hub' ? hubPropertyId : spokePropertyId},
          ${residency}, ${distance}, '2020-01-01', true, true
        )
        on conflict (org_id, employee_number) do update set
          full_name = excluded.full_name,
          role_id = excluded.role_id,
          base_property_id = excluded.base_property_id,
          residency_type = excluded.residency_type,
          home_distance_km = excluded.home_distance_km,
          employment_start_date = excluded.employment_start_date,
          employment_end_date = null,
          is_active = true,
          is_demo = true,
          updated_at = now()
        where roster_employees.is_demo = true
        returning id, employee_number
      `
      if (!row) throw new Error(`Employee number ${number} is owned by a non-demo employee.`)
      employeeIds.set(row.employee_number, row.id)
    }

    for (const employee of employees) {
      const [number, , roleCode] = employee
      const employeeId = employeeIds.get(number)
      await sql`delete from roster_employee_skills where employee_id = ${employeeId}`
      await sql`
        insert into roster_employee_skills (employee_id, role_id, is_primary)
        values (${employeeId}, ${roleIds.get(roleCode)}, true)
      `
    }
    const secondarySkills = [
      ['DEMO-005', 'DEMO_WAITER'],
      ['DEMO-010', 'DEMO_BRIDGE_COMMIS'],
      ['DEMO-013', 'DEMO_HOUSEKEEPER'],
      ['DEMO-022', 'DEMO_GSA'],
    ]
    for (const [number, roleCode] of secondarySkills) {
      await sql`
        insert into roster_employee_skills (employee_id, role_id, is_primary)
        values (${employeeIds.get(number)}, ${roleIds.get(roleCode)}, false)
        on conflict (employee_id, role_id) do update set is_primary = false
      `
    }

    for (const propertyId of [hubPropertyId, spokePropertyId]) {
      await sql`
        insert into roster_property_settings (
          property_id, bar_close_time, transport_cutoff, multi_zone_separation,
          safari_focus, outsourced_security, time_zone
        ) values (
          ${propertyId}, '23:00', '19:00', false, false,
          ${propertyId === spokePropertyId}, 'Asia/Colombo'
        )
        on conflict (property_id) do update set
          bar_close_time = excluded.bar_close_time,
          transport_cutoff = excluded.transport_cutoff,
          multi_zone_separation = excluded.multi_zone_separation,
          safari_focus = excluded.safari_focus,
          outsourced_security = excluded.outsourced_security,
          time_zone = excluded.time_zone,
          updated_at = now()
      `
    }

    const competingPolicies = await sql`
      select id, name from roster_policy_versions
      where org_id = ${orgId} and status = 'active' and name <> 'DEMO_TARUSHIFT_POLICY'
        and effective_from <= ${monthDates.at(-1)}
        and (effective_to is null or effective_to >= ${month})
    `
    if (competingPolicies.length) {
      throw new Error(`A non-demo active policy already covers ${monthArg}; retire it or use a clean demo environment.`)
    }
    const [policy] = await sql`
      insert into roster_policy_versions (
        org_id, name, version, status, effective_from,
        approved_by_name, approved_at, evidence_reference, activated_at
      ) values (
        ${orgId}, 'DEMO_TARUSHIFT_POLICY', 1, 'active', '2020-01-01',
        'Demo HR Reviewer', now(), 'DEMO-PREVIEW-NOT-LEGAL-ADVICE', now()
      )
      on conflict (org_id, name, version) do update set
        status = 'active',
        approved_by_name = excluded.approved_by_name,
        approved_at = excluded.approved_at,
        evidence_reference = excluded.evidence_reference,
        activated_at = excluded.activated_at,
        updated_at = now()
      returning id, version
    `
    await sql`
      insert into roster_policy_rules (
        policy_version_id, rule_code, calculation_type, severity,
        max_working_minutes_per_day, max_working_minutes_per_week,
        work_week_starts_on, monthly_workday_target, full_rest_days_per_week,
        half_rest_days_per_week, break_threshold_minutes, break_minutes,
        minimum_split_gap_minutes, maximum_spreadover_minutes,
        commuter_straight_shift_required, enforce_transport_cutoff,
        travel_distance_threshold_km, resident_target_percent,
        commuter_target_percent, area_manager_spoke_days, area_manager_overlap_days
      ) values (
        ${policy.id}, 'DEMO_CORE_POLICY', 'structured_policy', 'hard',
        600, 3000, 1, 24, 1, 1, 360, 60, 360, 900,
        true, true, 50, 60, 40, 10, 7
      )
      on conflict (policy_version_id, rule_code) do update set
        max_working_minutes_per_day = excluded.max_working_minutes_per_day,
        max_working_minutes_per_week = excluded.max_working_minutes_per_week,
        work_week_starts_on = excluded.work_week_starts_on,
        monthly_workday_target = excluded.monthly_workday_target,
        full_rest_days_per_week = excluded.full_rest_days_per_week,
        half_rest_days_per_week = excluded.half_rest_days_per_week,
        break_threshold_minutes = excluded.break_threshold_minutes,
        break_minutes = excluded.break_minutes,
        minimum_split_gap_minutes = excluded.minimum_split_gap_minutes,
        maximum_spreadover_minutes = excluded.maximum_spreadover_minutes,
        commuter_straight_shift_required = excluded.commuter_straight_shift_required,
        enforce_transport_cutoff = excluded.enforce_transport_cutoff,
        travel_distance_threshold_km = excluded.travel_distance_threshold_km,
        resident_target_percent = excluded.resident_target_percent,
        commuter_target_percent = excluded.commuter_target_percent,
        area_manager_spoke_days = excluded.area_manager_spoke_days,
        area_manager_overlap_days = excluded.area_manager_overlap_days,
        updated_at = now()
    `

    const templateIds = []
    for (const [roleCode] of roleDefinitions) {
      for (const [code, label, segments] of templatesForRole(roleCode)) {
        const scheduledMinutes = segments.reduce((total, segment) => {
          const [startHour, startMinute, endHour, endMinute, nextDay] = segment
          const start = startHour * 60 + startMinute
          const end = endHour * 60 + endMinute + (nextDay ? 1440 : 0)
          return total + end - start
        }, 0)
        const breakMinutes = segments.length === 1 && scheduledMinutes >= 540 ? 60 : 0
        const [template] = await sql`
          insert into roster_shift_templates (
            policy_version_id, role_id, code, label, applicability_code,
            duty_code, scheduled_minutes, break_minutes, working_minutes, is_published
          ) values (
            ${policy.id}, ${roleIds.get(roleCode)}, ${code}, ${label}, ${code},
            'W', ${scheduledMinutes}, ${breakMinutes}, ${scheduledMinutes - breakMinutes}, true
          )
          on conflict (policy_version_id, role_id, code) do update set
            label = excluded.label,
            applicability_code = excluded.applicability_code,
            scheduled_minutes = excluded.scheduled_minutes,
            break_minutes = excluded.break_minutes,
            working_minutes = excluded.working_minutes,
            is_published = true,
            updated_at = now()
          returning id
        `
        templateIds.push(template.id)
        await sql`delete from roster_shift_template_segments where shift_template_id = ${template.id}`
        for (const [sortOrder, segment] of segments.entries()) {
          await sql`
            insert into roster_shift_template_segments (
              shift_template_id, sort_order, start_time, end_time, ends_next_day
            ) values (
              ${template.id}, ${sortOrder}, ${time(segment[0], segment[1])},
              ${time(segment[2], segment[3])}, ${segment[4]}
            )
          `
        }
      }
    }

    const requiredByRoleProperty = (roleCode, propertyId) => {
      if (roleCode === 'DEMO_NIGHT_AUDITOR') return propertyId === hubPropertyId ? 1 : 0
      if (roleCode === 'DEMO_GSA') return propertyId === hubPropertyId ? 2 : 1
      if (roleCode === 'DEMO_BRIDGE_COMMIS') return propertyId === hubPropertyId ? 1 : 0
      if (['DEMO_CHEF', 'DEMO_WAITER', 'DEMO_HOUSEKEEPER'].includes(roleCode)) return 1
      if (roleCode === 'DEMO_MAINTENANCE') return 1
      if (roleCode === 'DEMO_DRIVER_GARDENER') return propertyId === hubPropertyId ? 1 : 0
      if (roleCode === 'DEMO_SWEEPER') return propertyId === spokePropertyId ? 1 : 0
      if (roleCode === 'DEMO_SUPPORT') return propertyId === hubPropertyId ? 1 : 0
      return 0
    }
    for (const propertyId of [hubPropertyId, spokePropertyId]) {
      for (const [roleCode] of roleDefinitions) {
        const required = requiredByRoleProperty(roleCode, propertyId)
        await sql`
          insert into roster_cadre_requirements (
            property_id, role_id, required_daily_active, relief_multiplier, effective_from
          ) values (${propertyId}, ${roleIds.get(roleCode)}, ${required}, 1.50, '2020-01-01')
          on conflict (property_id, role_id, effective_from) do update set
            required_daily_active = excluded.required_daily_active,
            relief_multiplier = excluded.relief_multiplier,
            effective_to = null,
            updated_at = now()
        `
        await sql`
          insert into roster_staffing_bands (
            property_id, role_id, occupancy_min, occupancy_max,
            required_active, effective_from
          ) values (
            ${propertyId}, ${roleIds.get(roleCode)}, 0, 100, ${required}, '2020-01-01'
          )
          on conflict (property_id, role_id, occupancy_min, occupancy_max, effective_from)
          do update set required_active = excluded.required_active, effective_to = null, updated_at = now()
        `
      }
    }

    for (const [propertyIndex, propertyId] of [hubPropertyId, spokePropertyId].entries()) {
      for (const [dayIndex, forecastDate] of monthDates.entries()) {
        const occupancy = 34 + ((dayIndex * 7 + propertyIndex * 13) % 61)
        await sql`
          insert into roster_forecasts (
            property_id, forecast_date, occupancy_percent,
            arrivals_count, departures_count, source
          ) values (
            ${propertyId}, ${forecastDate}, ${occupancy},
            ${(dayIndex + propertyIndex) % 5}, ${(dayIndex + propertyIndex * 2) % 4}, 'manual'
          )
          on conflict (property_id, forecast_date) do update set
            occupancy_percent = excluded.occupancy_percent,
            arrivals_count = excluded.arrivals_count,
            departures_count = excluded.departures_count,
            source = excluded.source,
            import_batch_id = null,
            updated_at = now()
        `
      }
    }

    const leaveEnd = `${monthArg}-${String(Math.min(7, monthDates.length)).padStart(2, '0')}`
    await sql`
      delete from roster_unavailability
      where employee_id in (${employeeIds.get('DEMO-002')}, ${employeeIds.get('DEMO-011')})
        and source = 'manual'
        and external_reference like 'DEMO_%'
    `
    await sql`
      insert into roster_unavailability (
        employee_id, start_date, end_date, type, source, external_reference, operational_note
      ) values
        (${employeeIds.get('DEMO-002')}, ${month}, ${leaveEnd}, 'annual_leave', 'manual', 'DEMO_PM_LEAVE', 'Approved demo source data'),
        (${employeeIds.get('DEMO-011')}, ${`${monthArg}-15`}, ${`${monthArg}-17`}, 'annual_leave', 'manual', 'DEMO_TRAVEL_LEAVE', 'Exercises paid travel-day eligibility')
    `

    for (const employeeId of employeeIds.values()) {
      for (const boundaryDate of boundaryDates) {
        await sql`
          insert into roster_boundary_assignments (
            employee_id, assignment_date, working_minutes, rest_category, source
          ) values (${employeeId}, ${boundaryDate}, 480, 'none', 'manual')
          on conflict (employee_id, assignment_date) do update set
            working_minutes = excluded.working_minutes,
            rest_category = excluded.rest_category,
            source = excluded.source,
            updated_at = now()
        `
      }
    }

    return { hub, policy, templateCount: templateIds.length }
  })

  console.log('TaruShift demo seed complete.')
  console.log(`Hub property: ${hubProperty.name} (${hubProperty.id})`)
  console.log(`Spoke property: ${spokeProperty.name} (${spokeProperty.id})`)
  console.log(`Month: ${monthArg}`)
  console.log(`Employees: ${employees.length}`)
  console.log(`Policy version: ${outcome.policy.version}`)
  console.log(`Shift templates: ${outcome.templateCount}`)
  console.log('Preview: /rostering')
} finally {
  await client.end()
}

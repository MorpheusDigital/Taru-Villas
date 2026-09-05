export type ClientModule =
  | 'dashboard'
  | 'tasks'
  | 'surveys'
  | 'fleet'
  | 'rostering'
  | 'sops'
  | 'daily-records'
  | 'assets'
  | 'menus'
  | 'excursions'
  | 'guest-profiles'
  | 'utilities'
  | 'settings'
  | 'allowed-emails'
  | 'core'

const clientModules: readonly ClientModule[] = [
  'dashboard',
  'tasks',
  'surveys',
  'fleet',
  'rostering',
  'sops',
  'daily-records',
  'assets',
  'menus',
  'excursions',
  'guest-profiles',
  'utilities',
  'settings',
  'allowed-emails',
  'core',
]

export type ClientModulePolicy =
  | { status: 'legacy-unrestricted'; enabledModules: Set<ClientModule> }
  | { status: 'configured'; enabledModules: Set<ClientModule> }
  | { status: 'configuration-error'; enabledModules: Set<ClientModule> }

const nestedPropertyRoutes: readonly [RegExp, ClientModule][] = [
  [/^\/properties\/[^/]+\/daily-records(?:\/|$)/, 'daily-records'],
  [/^\/properties\/[^/]+\/(?:utilities|waste)(?:\/|$)/, 'daily-records'],
  [/^\/properties\/[^/]+\/menus(?:\/|$)/, 'menus'],
  [/^\/properties\/[^/]+\/excursions(?:\/|$)/, 'excursions'],
  [/^\/properties\/[^/]+\/guest-profiles(?:\/|$)/, 'guest-profiles'],
]

const moduleRoutes: readonly [string, ClientModule][] = [
  ['/admin/fleet', 'fleet'],
  ['/fleet', 'fleet'],
  ['/api/fleet', 'fleet'],
  ['/d/', 'fleet'],
  ['/api/surveys', 'surveys'],
  ['/api/templates', 'surveys'],
  ['/api/admin/guest-links', 'surveys'],
  ['/g/', 'surveys'],
  ['/surveys', 'surveys'],
  ['/api/tasks', 'tasks'],
  ['/api/projects', 'tasks'],
  ['/api/issues', 'tasks'],
  ['/tasks', 'tasks'],
  ['/issues', 'tasks'],
  ['/api/dashboard', 'dashboard'],
  ['/dashboard', 'dashboard'],
  ['/admin/allowed-emails', 'allowed-emails'],
  ['/api/admin/allowed-emails', 'allowed-emails'],
  ['/api/auth/check-whitelist', 'allowed-emails'],
  // Existing users call this during password sign-in. The handler still
  // enforces authentication, invite-only policy, and onboarding eligibility.
  ['/api/auth/provision', 'core'],
  ['/admin/users', 'core'],
  ['/api/users', 'core'],
  ['/admin/properties', 'core'],
  ['/api/properties', 'core'],
  ['/properties', 'core'],
  ['/api/rostering', 'rostering'],
  ['/rostering', 'rostering'],
  ['/my-roster', 'rostering'],
  ['/api/sops', 'sops'],
  ['/sops', 'sops'],
  ['/api/utilities', 'utilities'],
  ['/utilities', 'utilities'],
  ['/u/', 'utilities'],
  ['/api/waste', 'daily-records'],
  ['/waste', 'daily-records'],
  ['/daily-records', 'daily-records'],
  ['/api/assets', 'assets'],
  ['/assets', 'assets'],
  ['/scan/asset', 'assets'],
  ['/api/menus', 'menus'],
  ['/m/', 'menus'],
  ['/menus', 'menus'],
  ['/api/excursions', 'excursions'],
  ['/e/', 'excursions'],
  ['/excursions', 'excursions'],
  ['/api/guest-profiles', 'guest-profiles'],
  ['/api/oracle', 'guest-profiles'],
  ['/guest-profiles', 'guest-profiles'],
  ['/settings', 'settings'],
  ['/api/cron/fleet-optimize', 'fleet'],
  ['/api/cron/vehicle-renewals', 'fleet'],
  ['/api/cron/guest-profiles-sync', 'guest-profiles'],
  ['/api/cron/electricity-autofill', 'utilities'],
]

export function getEnabledClientModules(value?: string): Set<ClientModule> {
  const configuredModules = new Set((value ?? process.env.CLIENT_ENABLED_MODULES ?? '').split(',').map((module) => module.trim()))

  return new Set(clientModules.filter((module) => configuredModules.has(module)))
}

export function getClientModulePolicy(
  value = process.env.CLIENT_ENABLED_MODULES,
  inviteOnly = false
): ClientModulePolicy {
  const configuredValues = value
    ?.split(',')
    .map((module) => module.trim())
    .filter(Boolean) ?? []
  const enabledModules = getEnabledClientModules(value)
  const invalidValues = configuredValues.filter(
    (module) => !clientModules.includes(module as ClientModule)
  )

  if (inviteOnly && (
    configuredValues.length === 0
    || enabledModules.size === 0
    || invalidValues.length > 0
  )) {
    return { status: 'configuration-error', enabledModules: new Set() }
  }

  if (enabledModules.size === 0) {
    return { status: 'legacy-unrestricted', enabledModules }
  }

  return { status: 'configured', enabledModules }
}

export function getClientModuleRequestStatus(
  pathname: string,
  value = process.env.CLIENT_ENABLED_MODULES,
  inviteOnly = false
): 404 | 503 | null {
  const policy = getClientModulePolicy(value, inviteOnly)
  if (policy.status === 'configuration-error') return 503
  if (
    policy.status === 'configured'
    && !isPathEnabled(pathname, policy.enabledModules)
  ) {
    return 404
  }
  return null
}

export function moduleForPath(pathname: string): ClientModule | undefined {
  for (const [pattern, module] of nestedPropertyRoutes) {
    if (pattern.test(pathname)) return module
  }

  const matchingRoute = moduleRoutes
    .filter(([prefix]) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
    .sort(([firstPrefix], [secondPrefix]) => secondPrefix.length - firstPrefix.length)[0]

  return matchingRoute?.[1]
}

export function isPathEnabled(pathname: string, enabled: Set<ClientModule>): boolean {
  const clientModule = moduleForPath(pathname)

  // Daily Records embeds utility recording without exposing the standalone
  // Utilities module or its public QR routes.
  if (enabled.has('daily-records') && (
    pathname === '/api/utilities'
    || pathname.startsWith('/api/utilities/')
    || pathname === '/api/cron/electricity-autofill'
  )) return true

  return enabled.size === 0 || !clientModule || clientModule === 'core' || enabled.has(clientModule)
}

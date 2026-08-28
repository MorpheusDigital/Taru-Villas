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
  ['/api/auth/provision', 'allowed-emails'],
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
  ['/api/cron/guest-profiles-sync', 'guest-profiles'],
  ['/api/cron/electricity-autofill', 'utilities'],
]

export function getEnabledClientModules(value?: string): Set<ClientModule> {
  const configuredModules = new Set((value ?? process.env.CLIENT_ENABLED_MODULES ?? '').split(',').map((module) => module.trim()))

  return new Set(clientModules.filter((module) => configuredModules.has(module)))
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

  return enabled.size === 0 || !clientModule || clientModule === 'core' || enabled.has(clientModule)
}

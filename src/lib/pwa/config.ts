export type PwaConfig = {
  name: string
  shortName: string
  themeColor: string
}

export function getPwaConfig(env = process.env): PwaConfig {
  return {
    name: env.NEXT_PUBLIC_APP_NAME?.trim() || 'Taru Villas Management Portal',
    shortName: env.NEXT_PUBLIC_APP_SHORT_NAME?.trim() || 'Taru Villas',
    themeColor: env.NEXT_PUBLIC_THEME_COLOR?.trim() || '#1f5138',
  }
}

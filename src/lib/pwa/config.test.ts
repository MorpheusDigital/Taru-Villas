import { expect, it } from 'vitest'
import { getPwaConfig } from './config'

it('uses configured client branding and safe defaults', () => {
  expect(
    getPwaConfig({
      NEXT_PUBLIC_APP_NAME: 'Client Portal',
      NEXT_PUBLIC_APP_SHORT_NAME: 'Client',
      NEXT_PUBLIC_THEME_COLOR: '#123456',
    } as unknown as NodeJS.ProcessEnv),
  ).toEqual({
    name: 'Client Portal',
    shortName: 'Client',
    themeColor: '#123456',
  })

  expect(getPwaConfig({} as NodeJS.ProcessEnv).name).toBe(
    'Taru Villas Management Portal',
  )
})

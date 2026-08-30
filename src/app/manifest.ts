import type { MetadataRoute } from 'next'
import { getPwaConfig } from '@/lib/pwa/config'

export default function manifest(): MetadataRoute.Manifest {
  const { name, shortName, themeColor } = getPwaConfig()

  return {
    name,
    short_name: shortName,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}

'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ConnectivityNotice } from './connectivity-notice'

export function PwaProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const refreshOnControllerChange = useRef(false)
  const updatePromptShown = useRef(false)

  useEffect(() => {
    let active = true
    let registration: ServiceWorkerRegistration | null = null
    let handleUpdateFound: (() => void) | null = null

    const updateConnection = () => setIsOnline(navigator.onLine)
    updateConnection()
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)

    if (!('serviceWorker' in navigator)) {
      return () => {
        window.removeEventListener('online', updateConnection)
        window.removeEventListener('offline', updateConnection)
      }
    }

    const handleControllerChange = () => {
      if (refreshOnControllerChange.current) window.location.reload()
    }

    const showUpdatePrompt = (registration: ServiceWorkerRegistration) => {
      if (updatePromptShown.current || !registration.waiting) return

      updatePromptShown.current = true
      toast('A portal update is ready.', {
        action: {
          label: 'Refresh',
          onClick: () => {
            refreshOnControllerChange.current = true
            registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
          },
        },
      })
    }

    const registerWorker = async () => {
      try {
        const nextRegistration = await navigator.serviceWorker.register('/sw.js')
        if (!active) return

        registration = nextRegistration
        showUpdatePrompt(nextRegistration)

        handleUpdateFound = () => {
          const worker = nextRegistration.installing
          if (!worker) return

          worker.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              showUpdatePrompt(nextRegistration)
            }
          })
        }

        nextRegistration.addEventListener('updatefound', handleUpdateFound)
      } catch {
        // A missing or unavailable worker must never prevent portal use.
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    void registerWorker()

    return () => {
      active = false
      window.removeEventListener('online', updateConnection)
      window.removeEventListener('offline', updateConnection)
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        handleControllerChange,
      )
      if (registration && handleUpdateFound) {
        registration.removeEventListener('updatefound', handleUpdateFound)
      }
    }
  }, [])

  return (
    <>
      {children}
      <ConnectivityNotice isOnline={isOnline} />
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ManifestStrings } from '@/lib/fleet/manifest-strings'

/** VAPID keys are base64url; PushManager wants a Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

interface PushSetupBannerProps {
  token: string
  vapidPublicKey: string
  strings: ManifestStrings
}

export function PushSetupBanner({ token, vapidPublicKey, strings }: PushSetupBannerProps) {
  const [supported, setSupported] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window
    setSupported(ok)
    if (!ok) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => setSupported(false))
  }, [])

  async function enable() {
    if (!vapidPublicKey) {
      toast.error('Notifications are not configured. Contact the office.')
      return
    }
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        toast.error('Notifications were blocked. Enable them in your browser settings.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })

      const res = await fetch(`/api/fleet/driver/${token}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error('Could not save subscription')

      setSubscribed(true)
      toast.success(strings.notificationsOn)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not turn on alerts')
    } finally {
      setBusy(false)
    }
  }

  // A browser without push support (or WhatsApp's in-app view) still gets the
  // manifest — it just cannot be alerted, so say so rather than showing a
  // button that will never work.
  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">{strings.setupTitle}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>{strings.setupStep1}</li>
          <li>{strings.setupStep2}</li>
          <li>{strings.setupStep3}</li>
        </ol>
      </div>
    )
  }

  if (subscribed) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-700">
        <CheckCircle2 className="size-4" /> {strings.notificationsOn}
      </p>
    )
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <p className="mb-3 text-sm font-medium text-amber-900">{strings.setupTitle}</p>
      <Button onClick={enable} disabled={busy} size="lg" className="w-full">
        <BellRing className="mr-2 size-5" />
        {busy ? '…' : strings.enableNotifications}
      </Button>
    </div>
  )
}

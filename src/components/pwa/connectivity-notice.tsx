import { connectionMessage } from '@/lib/pwa/connectivity'

export function ConnectivityNotice({ isOnline }: { isOnline: boolean }) {
  const message = connectionMessage(isOnline)

  if (!message) return null

  return (
    <div
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg sm:left-auto sm:right-6 sm:max-w-md"
      role="status"
    >
      {message}
    </div>
  )
}

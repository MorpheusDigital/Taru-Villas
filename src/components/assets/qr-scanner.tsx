'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Html5Qrcode, type Html5QrcodeResult } from 'html5-qrcode'
import { Camera, CircleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const QR_READER_ELEMENT_ID = 'qr-reader'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'permission-denied' | 'error'

/**
 * The QR encodes `${APP_URL}/scan/asset/<id>`. Parse it as a URL when
 * possible and fall back to treating the raw text as a path so a scan
 * still works if the origin differs from what's expected.
 */
function extractAssetId(decodedText: string): string | null {
  let path = decodedText
  try {
    path = new URL(decodedText).pathname
  } catch {
    // Not a fully-qualified URL — treat the decoded text as a path/string.
  }

  const segments = path.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1]

  return lastSegment && UUID_REGEX.test(lastSegment) ? lastSegment : null
}

export function QrScanner() {
  const router = useRouter()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  // Guards against the success callback firing again (fps: 10) while the
  // async stop()/navigate sequence from a prior decode is still in flight.
  const isNavigatingRef = useRef(false)
  const [status, setStatus] = useState<ScannerStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)

  // Release the camera if the user navigates away while scanning.
  useEffect(() => {
    return () => {
      const scanner = scannerRef.current
      if (scanner?.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            // stop() rejects if already stopped — camera is released either way.
          })
      }
    }
  }, [])

  async function stopScanner() {
    const scanner = scannerRef.current
    if (!scanner) return
    try {
      if (scanner.isScanning) {
        await scanner.stop()
      }
      scanner.clear()
    } catch {
      // Already stopped/cleared — nothing further to release.
    }
  }

  async function handleDecode(decodedText: string, _result: Html5QrcodeResult) {
    if (isNavigatingRef.current) return

    const assetId = extractAssetId(decodedText)

    if (!assetId) {
      setMessage('Unrecognized code — point the camera at an asset QR label.')
      return
    }

    isNavigatingRef.current = true
    setMessage(null)
    await stopScanner()
    setStatus('idle')
    router.push(`/scan/asset/${assetId}`)
  }

  async function handleStart() {
    isNavigatingRef.current = false
    setStatus('starting')
    setMessage(null)

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(QR_READER_ELEMENT_ID)
    }
    const scanner = scannerRef.current
    if (scanner.isScanning) return

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 250 },
        (decodedText, result) => {
          void handleDecode(decodedText, result)
        },
        undefined
      )
      setStatus('scanning')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isPermissionError = /permission|notallowed|denied/i.test(errorMessage)
      setStatus(isPermissionError ? 'permission-denied' : 'error')
      setMessage(
        isPermissionError
          ? 'Camera access was denied. Enable camera permission for this site in your browser settings and try again.'
          : 'Could not start the camera on this device.'
      )
    }
  }

  async function handleStop() {
    await stopScanner()
    setStatus('idle')
    setMessage(null)
  }

  const isActive = status === 'starting' || status === 'scanning'
  const isBlocked = status === 'permission-denied' || status === 'error'

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10">
        <div
          id={QR_READER_ELEMENT_ID}
          className={cn('w-full max-w-sm overflow-hidden rounded-lg [&_video]:rounded-lg', !isActive && 'hidden')}
        />

        {!isActive && (
          <Button size="lg" className="h-16 w-full max-w-sm text-lg" onClick={handleStart}>
            <Camera className="size-6" />
            Tap to Scan
          </Button>
        )}

        {isActive && (
          <Button variant="outline" className="w-full max-w-sm" onClick={handleStop}>
            Stop
          </Button>
        )}

        {message && (
          <div
            className={cn(
              'flex items-center gap-2 text-center text-sm',
              isBlocked ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {isBlocked && <CircleAlert className="size-4 shrink-0" />}
            <span>{message}</span>
          </div>
        )}

        {isBlocked && (
          <Link
            href="/assets/directory"
            className="text-sm font-medium underline underline-offset-4"
          >
            Go to the Directory instead
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

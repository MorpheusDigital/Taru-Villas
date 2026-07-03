'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AssetQrLabelProps {
  qrUrl: string | null
  assetCode: string
  name: string
}

export function AssetQrLabel({ qrUrl, assetCode, name }: AssetQrLabelProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (qrUrl == null) return
    let cancelled = false
    QRCode.toDataURL(qrUrl, { width: 320, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [qrUrl])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-base">QR Label</CardTitle>
        {qrUrl != null && (
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" />
            Print label
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {qrUrl == null ? (
          <p className="text-sm text-muted-foreground">No QR code available for this asset.</p>
        ) : (
          <div className="asset-qr-print flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-6 text-center">
            {dataUrl ? (
              <img src={dataUrl} alt={`QR code for ${assetCode}`} className="size-40" />
            ) : (
              <div className="flex size-40 items-center justify-center text-xs text-muted-foreground">
                Generating QR...
              </div>
            )}
            <p className="font-mono text-lg font-bold tracking-wide">{assetCode}</p>
            <p className="text-sm text-muted-foreground">{name}</p>
          </div>
        )}
      </CardContent>
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .asset-qr-print,
          .asset-qr-print * {
            visibility: visible;
          }
          .asset-qr-print {
            position: absolute;
            inset: 0;
            margin: auto;
            border: none;
          }
        }
      `}</style>
    </Card>
  )
}

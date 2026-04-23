'use client'

import { useRef, useState } from 'react'
import { Camera, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { prepareImage, extractMeterReading } from '@/lib/utilities/ocr'

function nowIST(): string {
  return new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }) + ' IST'
}

interface ReadingFormProps {
  propertyId: string
  utilityType: 'water' | 'electricity'
  onSuccess: () => void
}

export function UtilityReadingForm({
  propertyId,
  utilityType,
  onSuccess,
}: ReadingFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const [readingDate, setReadingDate] = useState(today)
  const [readingValue, setReadingValue] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scannedPreview, setScannedPreview] = useState<string | null>(null)
  const [readingTimestamp, setReadingTimestamp] = useState<string | null>(null)
  const [isScannedReading, setIsScannedReading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setIsScanning(true)
    setScannedPreview(null)
    setReadingTimestamp(null)
    try {
      const imageDataUrl = await prepareImage(file)
      setScannedPreview(imageDataUrl)
      const value = await extractMeterReading(imageDataUrl)
      setReadingValue(String(value))
      setReadingTimestamp(nowIST())
      setIsScannedReading(true)
      toast.success(`Detected reading: ${value}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read meter')
      setScannedPreview(null)
    } finally {
      setIsScanning(false)
    }
  }

  function handleManualChange(val: string) {
    setReadingValue(val)
    setIsScannedReading(false)
    setScannedPreview(null)
    setReadingTimestamp(val.trim() ? nowIST() : null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const value = parseFloat(readingValue)
    if (isNaN(value) || value < 0) {
      toast.error('Please enter a valid meter reading')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/utilities/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          utilityType,
          readingDate,
          readingValue: value,
          note: note || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save reading')
      }

      toast.success('Reading saved')
      setReadingValue('')
      setNote('')
      setScannedPreview(null)
      setReadingTimestamp(null)
      setIsScannedReading(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add Reading</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reading-date">Date</Label>
            <Input
              id="reading-date"
              type="date"
              value={readingDate}
              onChange={(e) => setReadingDate(e.target.value)}
              required
            />
          </div>

          {/* Camera scan button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScan}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isScanning}
              className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/40 hover:border-primary hover:bg-primary/5 transition-all py-5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? (
                <>
                  <Loader2 className="size-7 animate-spin text-primary" />
                  <span className="text-sm font-semibold text-primary">Reading meter...</span>
                </>
              ) : (
                <>
                  <Camera className="size-7 text-primary" />
                  <span className="text-sm font-semibold text-primary">Scan Meter</span>
                  <span className="text-xs text-muted-foreground">Opens camera directly</span>
                </>
              )}
            </button>
          </div>

          {scannedPreview && (
            <img
              src={scannedPreview}
              alt="Meter photo"
              className="w-full max-h-32 object-contain rounded-md border bg-muted"
            />
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reading-value">Meter Reading</Label>
            <Input
              id="reading-value"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 14523"
              value={readingValue}
              onChange={(e) => handleManualChange(e.target.value)}
              required
            />
            {readingTimestamp && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="size-3 shrink-0" />
                {isScannedReading ? 'Scanned' : 'Recorded'} at {readingTimestamp}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reading-note">Note (optional)</Label>
            <Textarea
              id="reading-note"
              placeholder="Any observations..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Reading'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

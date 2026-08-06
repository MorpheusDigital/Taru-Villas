'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface TripReportDialogProps {
  requestId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function TripReportDialog({ requestId, open, onOpenChange, onSaved }: TripReportDialogProps) {
  const [summary, setSummary] = useState('')
  const [urls, setUrls] = useState<string[]>([''])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) return
    setSummary('')
    setUrls([''])
  }, [open])

  async function submit() {
    if (!requestId || !summary.trim()) return

    setPending(true)
    try {
      const res = await fetch(`/api/fleet/reports/${requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summary.trim(),
          attachmentUrls: urls.map((url) => url.trim()).filter(Boolean),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? 'Failed to submit report')
      }

      toast.success('Trip report submitted')
      onOpenChange(false)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit trip report')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit trip report</DialogTitle>
          <DialogDescription>
            Record the completed work and any follow-up needed for this trip.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trip-report-summary">What was done and what follows?</Label>
            <Textarea
              id="trip-report-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label>Supporting file URLs</Label>
            {urls.map((url, index) => (
              <Input
                key={index}
                value={url}
                placeholder="https://…"
                onChange={(event) =>
                  setUrls((current) => current.map((item, i) => (i === index ? event.target.value : item)))
                }
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setUrls((current) => [...current, ''])}>
              Add URL
            </Button>
          </div>
          <Button className="w-full" disabled={pending || !summary.trim()} onClick={submit}>
            {pending ? 'Submitting…' : 'Submit report'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

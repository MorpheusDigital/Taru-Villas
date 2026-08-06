'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export function TripReportDialog({ requestId, open, onOpenChange, onSaved }: { requestId: string | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [summary, setSummary] = useState('')
  const [urls, setUrls] = useState<string[]>([''])
  const [pending, setPending] = useState(false)
  async function submit() {
    if (!requestId || !summary.trim()) return
    setPending(true)
    try {
      const res = await fetch(`/api/fleet/reports/${requestId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ summary: summary.trim(), attachmentUrls: urls.map((url) => url.trim()).filter(Boolean) }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error ?? 'Failed to submit report')
      toast.success('Trip report submitted')
      setSummary(''); setUrls(['']); onOpenChange(false); onSaved()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Failed to submit report') } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Submit trip report</DialogTitle></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>What was done and what follows?</Label><Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={6} /></div><div className="space-y-2"><Label>Supporting file URLs</Label>{urls.map((url, index) => <Input key={index} value={url} placeholder="https://…" onChange={(e) => setUrls((current) => current.map((item, i) => i === index ? e.target.value : item))} />)}<Button type="button" variant="outline" size="sm" onClick={() => setUrls((current) => [...current, ''])}>Add URL</Button></div><Button className="w-full" disabled={pending || !summary.trim()} onClick={submit}>{pending ? 'Submitting…' : 'Submit report'}</Button></div></DialogContent></Dialog>
}

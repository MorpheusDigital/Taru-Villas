'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface TripReportDialogProps {
  requestId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function TripReportDialog({ requestId, open, onOpenChange }: TripReportDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogHeader><DialogTitle>Visit report</DialogTitle><DialogDescription>Record the visit, its outcomes and follow-up tasks on the full report page.</DialogDescription></DialogHeader>
    {requestId && <Button asChild><Link href={`/fleet/reports/${requestId}`}>Open visit report</Link></Button>}
  </DialogContent></Dialog>
}

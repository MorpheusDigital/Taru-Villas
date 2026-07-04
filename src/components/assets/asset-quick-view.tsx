'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { CheckCircle2, MapPin, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { statusLabel, type AssetStatus } from '@/lib/assets/labels'
import type { AssetRow, AssetFinancialRow } from '@/lib/db/queries/assets'
import type { Room } from '@/lib/db/schema'

// Radix Select forbids an empty-string item value — use a sentinel for "no room".
const UNASSIGNED = '_unassigned_'

const STATUS_BADGE_CLASSES: Record<AssetStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_repair: 'bg-amber-100 text-amber-700 border-amber-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
  disposed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

interface MoveResponse {
  room: { id: string; name: string } | null
}

interface AssetQuickViewProps {
  // Union with AssetFinancialRow mirrors asset-detail.tsx — the page only
  // ever passes the physical projection (getAssetById(id, false)), and this
  // component never reads a financial-only field, but AssetFinancialRow
  // structurally extends AssetRow so accepting the union avoids a type
  // mismatch with the shared query return type.
  asset: AssetRow | AssetFinancialRow
  rooms: Room[]
}

export function AssetQuickView({ asset, rooms }: AssetQuickViewProps) {
  const [status, setStatus] = useState<AssetStatus>(asset.status)
  const [roomId, setRoomId] = useState<string | null>(asset.roomId)
  const [roomName, setRoomName] = useState<string | null>(asset.roomName)
  const [lastAuditedAt, setLastAuditedAt] = useState<Date | null>(asset.lastAuditedAt)

  const [isVerifying, setIsVerifying] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [isFlagging, setIsFlagging] = useState(false)
  const [showRepairForm, setShowRepairForm] = useState(false)
  const [issueDescription, setIssueDescription] = useState('')

  async function handleVerify() {
    setIsVerifying(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}/verify`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to verify asset')
      }
      const data = (await res.json()) as { ok: boolean; lastAuditedAt: string }
      setLastAuditedAt(new Date(data.lastAuditedAt))
      toast.success('Marked as verified present')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to verify asset')
    } finally {
      setIsVerifying(false)
    }
  }

  async function handleMove(value: string) {
    const newRoomId = value === UNASSIGNED ? null : value
    if (newRoomId === roomId) return
    setIsMoving(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: newRoomId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(typeof body.error === 'string' ? body.error : 'Failed to move asset')
      }
      const data = (await res.json()) as MoveResponse
      setRoomId(data.room?.id ?? null)
      setRoomName(data.room?.name ?? null)
      toast.success(data.room ? `Moved to ${data.room.name}` : 'Marked unassigned')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to move asset')
    } finally {
      setIsMoving(false)
    }
  }

  async function handleFlagRepair(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = issueDescription.trim()
    if (!trimmed) {
      toast.error('Please describe the issue')
      return
    }
    setIsFlagging(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}/flag-repair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueDescription: trimmed }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body.error === 'string' ? body.error : 'Failed to flag asset for repair',
        )
      }
      setStatus('in_repair')
      setIssueDescription('')
      setShowRepairForm(false)
      toast.success('Flagged for repair')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to flag asset for repair')
    } finally {
      setIsFlagging(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          {asset.imageUrl && (
            <div className="-mx-6 -mt-6 mb-2 overflow-hidden rounded-t-xl border-b bg-muted">
              <img src={asset.imageUrl} alt={asset.name} className="max-h-56 w-full object-cover" />
            </div>
          )}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-xl">{asset.name}</CardTitle>
              <p className="font-mono text-xs text-muted-foreground">{asset.assetCode}</p>
            </div>
            <Badge variant="outline" className={STATUS_BADGE_CLASSES[status]}>
              {statusLabel(status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm">
            <MapPin className="size-4 text-muted-foreground" />
            {roomName ?? 'Unassigned'}
          </p>
          <p className="text-xs text-muted-foreground">
            {lastAuditedAt
              ? `Last verified ${format(lastAuditedAt, 'dd MMM yyyy, HH:mm')}`
              : 'Never verified'}
          </p>
        </CardContent>
      </Card>

      <Button
        type="button"
        className="min-h-12 w-full text-base"
        onClick={handleVerify}
        disabled={isVerifying}
      >
        <CheckCircle2 className="size-5" />
        {isVerifying ? 'Verifying...' : 'Verify Present'}
      </Button>

      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label htmlFor="move-room" className="text-sm font-medium">
            Move Location
          </Label>
          <Select value={roomId ?? UNASSIGNED} onValueChange={handleMove} disabled={isMoving}>
            <SelectTrigger id="move-room" className="min-h-12 w-full text-base">
              <SelectValue placeholder="Select a room" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
              {rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {!showRepairForm ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full text-base"
              onClick={() => setShowRepairForm(true)}
              disabled={status === 'in_repair'}
            >
              <Wrench className="size-5" />
              {status === 'in_repair' ? 'Already In Repair' : 'Flag for Repair'}
            </Button>
          ) : (
            <form onSubmit={handleFlagRepair} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="issue-description" className="text-sm font-medium">
                  What&apos;s wrong?
                </Label>
                <Textarea
                  id="issue-description"
                  value={issueDescription}
                  onChange={(e) => setIssueDescription(e.target.value)}
                  placeholder="Describe the issue..."
                  className="min-h-24 text-base"
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-12 flex-1 text-base"
                  onClick={() => {
                    setShowRepairForm(false)
                    setIssueDescription('')
                  }}
                  disabled={isFlagging}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  className="min-h-12 flex-1 text-base"
                  disabled={isFlagging}
                >
                  {isFlagging ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

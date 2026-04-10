'use client'

import { useState, useEffect } from 'react'
import { Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TierData {
  tierNumber: number
  minUnits: number
  maxUnits: number | null
  ratePerUnit: number
}

interface TierFormProps {
  propertyId: string
  utilityType: 'water' | 'electricity'
  onRefresh: () => void
}

const DEFAULT_TIERS: TierData[] = [
  { tierNumber: 1, minUnits: 0, maxUnits: 30, ratePerUnit: 0 },
  { tierNumber: 2, minUnits: 30, maxUnits: 60, ratePerUnit: 0 },
  { tierNumber: 3, minUnits: 60, maxUnits: 90, ratePerUnit: 0 },
  { tierNumber: 4, minUnits: 90, maxUnits: 120, ratePerUnit: 0 },
  { tierNumber: 5, minUnits: 120, maxUnits: 180, ratePerUnit: 0 },
  { tierNumber: 6, minUnits: 180, maxUnits: null, ratePerUnit: 0 },
]

export function UtilityTierForm({ propertyId, utilityType, onRefresh }: TierFormProps) {
  const [tiers, setTiers] = useState<TierData[]>([])
  const [editTiers, setEditTiers] = useState<TierData[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTiers()
  }, [propertyId, utilityType])

  async function fetchTiers() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/utilities/tiers?propertyId=${propertyId}&utilityType=${utilityType}`
      )
      if (res.ok) {
        const data = await res.json()
        const parsed: TierData[] = data.map((t: { tierNumber: number; minUnits: string; maxUnits: string | null; ratePerUnit: string }) => ({
          tierNumber: t.tierNumber,
          minUnits: parseFloat(t.minUnits),
          maxUnits: t.maxUnits ? parseFloat(t.maxUnits) : null,
          ratePerUnit: parseFloat(t.ratePerUnit),
        }))
        setTiers(parsed)
      }
    } catch (error) {
      console.error('Failed to fetch tiers:', error)
    } finally {
      setLoading(false)
    }
  }

  function openEdit() {
    setEditTiers(tiers.length > 0 ? [...tiers] : [...DEFAULT_TIERS])
    setShowDialog(true)
  }

  function updateEditTier(index: number, field: keyof TierData, value: string) {
    setEditTiers((prev) => {
      const updated = [...prev]
      if (field === 'maxUnits') {
        updated[index] = { ...updated[index], [field]: value === '' ? null : parseFloat(value) }
      } else if (field === 'tierNumber') {
        updated[index] = { ...updated[index], [field]: parseInt(value) }
      } else {
        updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 }
      }

      // Auto-adjust: set next tier's minUnits to this tier's maxUnits
      if (field === 'maxUnits' && updated[index].maxUnits !== null && index < updated.length - 1) {
        updated[index + 1] = { ...updated[index + 1], minUnits: updated[index].maxUnits as number }
      }

      return updated
    })
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          utilityType,
          tiers: editTiers.map((t) => ({
            tierNumber: t.tierNumber,
            minUnits: t.minUnits,
            maxUnits: t.maxUnits,
            ratePerUnit: t.ratePerUnit,
          })),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save tiers')
      }

      toast.success('Rate tiers updated')
      setShowDialog(false)
      await fetchTiers()
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Rate Configuration</CardTitle>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Settings2 className="size-4" />
            {tiers.length > 0 ? 'Edit Tiers' : 'Set Up Tiers'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : tiers.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tier</TableHead>
                    <TableHead>Range (units)</TableHead>
                    <TableHead className="text-right">Rate/unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tiers.map((tier) => (
                    <TableRow key={tier.tierNumber}>
                      <TableCell className="font-medium">
                        Tier {tier.tierNumber}
                      </TableCell>
                      <TableCell>
                        {tier.minUnits} — {tier.maxUnits !== null ? tier.maxUnits : '∞'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        LKR {tier.ratePerUnit.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No rate tiers configured. Set up tiers to see cost calculations.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit {utilityType === 'water' ? 'Water' : 'Electricity'} Rate Tiers
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {editTiers.map((tier, index) => (
              <div
                key={tier.tierNumber}
                className="grid grid-cols-4 gap-3 items-end"
              >
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Tier {tier.tierNumber}
                  </Label>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">From (units)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.minUnits}
                    onChange={(e) => updateEditTier(index, 'minUnits', e.target.value)}
                    disabled={index > 0} // Auto-set from previous tier
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    To (units){index === editTiers.length - 1 ? ' — leave empty for ∞' : ''}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.maxUnits ?? ''}
                    onChange={(e) => updateEditTier(index, 'maxUnits', e.target.value)}
                    placeholder={index === editTiers.length - 1 ? '∞' : ''}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rate (LKR/unit)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tier.ratePerUnit}
                    onChange={(e) => updateEditTier(index, 'ratePerUnit', e.target.value)}
                  />
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Tiers'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

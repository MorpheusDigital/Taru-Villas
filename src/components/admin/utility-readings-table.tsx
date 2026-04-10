'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

interface ReadingEntry {
  id: string
  readingDate: string
  readingValue: string
  note: string | null
  recorderName: string | null
}

interface ReadingsTableProps {
  readings: ReadingEntry[]
  onRefresh: () => void
}

export function UtilityReadingsTable({ readings, onRefresh }: ReadingsTableProps) {
  const [deleteReading, setDeleteReading] = useState<ReadingEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editReading, setEditReading] = useState<ReadingEntry | null>(null)
  const [editValue, setEditValue] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Calculate daily consumption from consecutive readings
  // Readings are sorted by date ascending
  const readingsWithConsumption = readings.map((reading, index) => {
    const prevReading = index > 0 ? readings[index - 1] : null
    const consumption = prevReading
      ? parseFloat(reading.readingValue) - parseFloat(prevReading.readingValue)
      : null

    return { ...reading, dailyConsumption: consumption }
  })

  // Display in reverse chronological order (newest first)
  const displayReadings = [...readingsWithConsumption].reverse()

  async function handleDelete() {
    if (!deleteReading) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/utilities/readings/${deleteReading.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Reading deleted')
      setDeleteReading(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editReading) return
    setIsEditing(true)
    try {
      const res = await fetch(`/api/utilities/readings/${editReading.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readingValue: parseFloat(editValue) }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to update')
      }
      toast.success('Reading updated')
      setEditReading(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update')
    } finally {
      setIsEditing(false)
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr + 'T00:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Readings</CardTitle>
        </CardHeader>
        <CardContent>
          {displayReadings.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Meter Value</TableHead>
                    <TableHead className="text-right">Daily Usage</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayReadings.map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell className="font-medium">
                        {formatDate(reading.readingDate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {parseFloat(reading.readingValue).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {reading.dailyConsumption !== null
                          ? reading.dailyConsumption.toFixed(1)
                          : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {reading.recorderName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => {
                              setEditReading(reading)
                              setEditValue(reading.readingValue)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDeleteReading(reading)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No readings recorded for this month.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editReading} onOpenChange={(open) => !open && setEditReading(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Reading — {editReading && formatDate(editReading.readingDate)}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-value">Meter Reading</Label>
              <Input
                id="edit-value"
                type="number"
                step="0.01"
                min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditReading(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isEditing}>
                {isEditing ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteReading} onOpenChange={(o) => !o && setDeleteReading(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this reading?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the meter reading for{' '}
              {deleteReading && formatDate(deleteReading.readingDate)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="default" size="default" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

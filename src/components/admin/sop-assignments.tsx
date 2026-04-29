'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, UserPlus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { SopAssignmentWithDetails } from '@/lib/db/queries/sops'
import { SopMultiAssignDialog } from './sop-multi-assign-dialog'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PropertyOption {
  id: string
  name: string
}

interface UserOption {
  id: string
  fullName: string
}

interface SopAssignmentsProps {
  templateId: string
  assignments: SopAssignmentWithDetails[]
  properties: PropertyOption[]
  users: UserOption[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SopAssignments({
  templateId,
  assignments: initialAssignments,
  properties,
  users,
}: SopAssignmentsProps) {
  const router = useRouter()
  const [multiAssignOpen, setMultiAssignOpen] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this assignment?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/sops/assignments/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete')
      router.refresh()
    } catch {
      alert('Failed to delete assignment')
    } finally {
      setDeleting(null)
    }
  }

  const frequencyLabel = (freq: string) => {
    switch (freq) {
      case 'daily':
        return 'Daily'
      case 'weekly':
        return 'Weekly'
      case 'monthly':
        return 'Monthly'
      default:
        return freq
    }
  }

  const dayLabel = (freq: string, day: number | null) => {
    if (freq === 'daily' || day === null) return '-'
    if (freq === 'weekly') {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      return days[day] ?? day
    }
    return `Day ${day}`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Assignments</h2>
        <Button size="sm" onClick={() => setMultiAssignOpen(true)}>
          <UserPlus className="size-4" />
          Add Assignments
        </Button>
        <SopMultiAssignDialog
          open={multiAssignOpen}
          onOpenChange={setMultiAssignOpen}
          templateId={templateId}
          users={users}
          properties={properties}
          onCreated={() => router.refresh()}
        />
      </div>

      {initialAssignments.length === 0 ? (
        <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          No assignments yet. Add one to assign this SOP to a user at a property.
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead>Day</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialAssignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.user.fullName}
                  </TableCell>
                  <TableCell>{a.property.name}</TableCell>
                  <TableCell>{frequencyLabel(a.frequency)}</TableCell>
                  <TableCell className="tabular-nums">
                    {a.deadlineTime}
                  </TableCell>
                  <TableCell>
                    {dayLabel(a.frequency, a.deadlineDay)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={a.isActive ? 'default' : 'secondary'}
                    >
                      {a.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(a.id)}
                      disabled={deleting === a.id}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

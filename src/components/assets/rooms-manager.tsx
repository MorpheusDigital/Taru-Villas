'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, DoorOpen, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import type { Property, Room } from '@/lib/db/schema'

interface RoomsManagerProps {
  properties: Property[]
  rooms: Room[]
}

async function parseErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'error' in body) {
    const err = (body as { error?: unknown }).error
    if (typeof err === 'string') return err
  }
  return fallback
}

export function RoomsManager({ properties, rooms }: RoomsManagerProps) {
  const router = useRouter()
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(properties[0]?.id ?? '')

  // Add room form state
  const [newName, setNewName] = useState('')
  const [newFloor, setNewFloor] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Inline edit state (one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editFloor, setEditFloor] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const propertyRooms = useMemo(
    () => rooms.filter((r) => r.propertyId === selectedPropertyId),
    [rooms, selectedPropertyId],
  )

  function startEdit(room: Room) {
    setEditingId(room.id)
    setEditName(room.name)
    setEditFloor(room.floorLevel ?? '')
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  async function handleAdd() {
    const trimmedName = newName.trim()
    if (!trimmedName) {
      setAddError('Room name is required')
      return
    }
    if (!selectedPropertyId) {
      setAddError('Select a property first')
      return
    }

    setIsAdding(true)
    setAddError(null)
    try {
      const trimmedFloor = newFloor.trim()
      const res = await fetch('/api/assets/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          name: trimmedName,
          floorLevel: trimmedFloor || undefined,
        }),
      })

      if (!res.ok) {
        const message = await parseErrorMessage(res, 'Failed to add room')
        if (res.status === 409) {
          setAddError(message)
          return
        }
        throw new Error(message)
      }

      toast.success('Room added')
      setNewName('')
      setNewFloor('')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add room')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleSaveEdit(id: string) {
    const trimmedName = editName.trim()
    if (!trimmedName) {
      setEditError('Room name is required')
      return
    }

    setIsSavingEdit(true)
    setEditError(null)
    try {
      const trimmedFloor = editFloor.trim()
      const res = await fetch(`/api/assets/rooms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          floorLevel: trimmedFloor || null,
        }),
      })

      if (!res.ok) {
        const message = await parseErrorMessage(res, 'Failed to update room')
        if (res.status === 409) {
          setEditError(message)
          return
        }
        throw new Error(message)
      }

      toast.success('Room updated')
      setEditingId(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update room')
    } finally {
      setIsSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/assets/rooms/${deleteTarget.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const message = await parseErrorMessage(res, 'Failed to delete room')
        throw new Error(message)
      }

      toast.success('Room deleted')
      setDeleteTarget(null)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete room')
    } finally {
      setIsDeleting(false)
    }
  }

  if (properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <DoorOpen className="size-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-1">No properties available</h3>
        <p className="text-sm text-muted-foreground">
          You don&rsquo;t have access to any properties yet.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Rooms</h2>
          <p className="text-sm text-muted-foreground">
            Manage the rooms/locations used to place assets
          </p>
        </div>
        <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="Select a property" />
          </SelectTrigger>
          <SelectContent>
            {properties.map((property) => (
              <SelectItem key={property.id} value={property.id}>
                {property.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Room</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-room-name">Name</Label>
              <Input
                id="new-room-name"
                placeholder="e.g. Villa 1, Kitchen, Room 204"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setAddError(null)
                }}
              />
            </div>
            <div className="w-full sm:w-48 space-y-1.5">
              <Label htmlFor="new-room-floor">Floor level (optional)</Label>
              <Input
                id="new-room-floor"
                placeholder="e.g. Ground, 1st Floor"
                value={newFloor}
                onChange={(e) => setNewFloor(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={isAdding}>
              <Plus className="size-4" />
              {isAdding ? 'Adding...' : 'Add Room'}
            </Button>
          </div>
          {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {propertyRooms.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Floor Level</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propertyRooms.map((room) => {
                    const isEditing = editingId === room.id
                    return (
                      <Fragment key={room.id}>
                        <TableRow>
                          {isEditing ? (
                            <>
                              <TableCell>
                                <Input
                                  value={editName}
                                  onChange={(e) => {
                                    setEditName(e.target.value)
                                    setEditError(null)
                                  }}
                                  autoFocus
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={editFloor}
                                  onChange={(e) => setEditFloor(e.target.value)}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleSaveEdit(room.id)}
                                    disabled={isSavingEdit}
                                  >
                                    <Check className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={cancelEdit}
                                    disabled={isSavingEdit}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell className="font-medium">{room.name}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {room.floorLevel ?? '—'}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => startEdit(room)}
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setDeleteTarget(room)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          )}
                        </TableRow>
                        {isEditing && editError && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-sm text-destructive">
                              {editError}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No rooms yet for this property.
            </p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this room. Assets assigned to it will become
              unassigned. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="default"
              size="default"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

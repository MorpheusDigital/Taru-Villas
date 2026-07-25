'use client'

import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, CheckCircle2, Building2, Clock, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

import type { SopAssignmentForUser, SopCompletionWithItems } from '@/lib/sops/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SopCompletionProps {
  assignment: SopAssignmentForUser
  onBack: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SopCompletion({ assignment, onBack }: SopCompletionProps) {
  const [completion, setCompletion] = useState<SopCompletionWithItems | null>(
    assignment.currentCompletion
  )
  const [loading, setLoading] = useState(!completion)
  const [updatingItems, setUpdatingItems] = useState<Set<string>>(new Set())

  // Create completion record on mount if none exists
  useEffect(() => {
    if (!completion) {
      initCompletion()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const initCompletion = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/sops/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId: assignment.id,
          dueDate: assignment.currentDueDate,
        }),
      })
      if (!res.ok) throw new Error('Failed to init completion')
      const data = await res.json()
      setCompletion(data)
    } catch (error) {
      console.error('Init completion error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckItem = async (itemId: string, isChecked: boolean) => {
    if (!completion) return

    setUpdatingItems((prev) => new Set(prev).add(itemId))
    try {
      const res = await fetch(`/api/sops/completions/${completion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, isChecked }),
      })
      if (!res.ok) throw new Error('Failed to update item')
      const data = await res.json()
      setCompletion(data.completion)
    } catch (error) {
      console.error('Check item error:', error)
    } finally {
      setUpdatingItems((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  // Build a Set of checked item IDs for quick lookup
  const checkedItemIds = useMemo(() => {
    const set = new Set<string>()
    if (completion) {
      for (const ic of completion.itemCompletions) {
        if (ic.isChecked) set.add(ic.itemId)
      }
    }
    return set
  }, [completion])

  const items = assignment.template.items
  const totalItems = items.length
  const checkedCount = checkedItemIds.size
  const progress = totalItems > 0 ? Math.round((checkedCount / totalItems) * 100) : 0
  const isComplete = completion?.status === 'completed'

  // Group items by section
  const sectionMap = useMemo(() => {
    const map = new Map<string | null, typeof items>()
    for (const item of items) {
      const key = item.sectionId
      const list = map.get(key) ?? []
      list.push(item)
      map.set(key, list)
    }
    return map
  }, [items])

  // Section metadata (name + order) keyed by section id
  const sectionInfo = useMemo(() => {
    const map = new Map<string, { name: string; sortOrder: number }>()
    for (const section of assignment.template.sections) {
      map.set(section.id, { name: section.name, sortOrder: section.sortOrder })
    }
    return map
  }, [assignment.template.sections])

  // Ungrouped items (null sectionId)
  const ungroupedItems = sectionMap.get(null) ?? []
  const sectionedEntries = [...sectionMap.entries()]
    .filter(([k]) => k !== null)
    .sort(
      ([a], [b]) =>
        (sectionInfo.get(a as string)?.sortOrder ?? 0) -
        (sectionInfo.get(b as string)?.sortOrder ?? 0)
    )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Back to My SOPs
        </Button>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {assignment.template.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Building2 className="size-3.5" />
              {assignment.property.name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" />
              Due by {assignment.deadlineTime}
            </span>
            <Badge variant="outline" className="text-[10px] capitalize">
              {assignment.frequency}
            </Badge>
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>
              {checkedCount} of {totalItems} items completed
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-3" />
        </div>

        {isComplete && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 p-3 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-5" />
            <span className="font-medium">All items completed!</span>
          </div>
        )}
      </div>

      {/* Checklist */}
      {ungroupedItems.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-1">
              {ungroupedItems.map((item) => (
                <ChecklistItem
                  key={item.id}
                  content={item.content}
                  isChecked={checkedItemIds.has(item.id)}
                  isUpdating={updatingItems.has(item.id)}
                  onCheck={(checked) => handleCheckItem(item.id, checked)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {sectionedEntries.map(([sectionId, sectionItems]) => {
        const sectionName = sectionInfo.get(sectionId as string)?.name ?? 'Section'
        return (
          <Card key={sectionId}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{sectionName}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {sectionItems.map((item) => (
                  <ChecklistItem
                    key={item.id}
                    content={item.content}
                    isChecked={checkedItemIds.has(item.id)}
                    isUpdating={updatingItems.has(item.id)}
                    onCheck={(checked) => handleCheckItem(item.id, checked)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Checklist Item
// ---------------------------------------------------------------------------

function ChecklistItem({
  content,
  isChecked,
  isUpdating,
  onCheck,
}: {
  content: string
  isChecked: boolean
  isUpdating: boolean
  onCheck: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 rounded-md p-2 hover:bg-muted/50 cursor-pointer transition-colors">
      {isUpdating ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
      ) : (
        <Checkbox
          checked={isChecked}
          onCheckedChange={(checked) => onCheck(!!checked)}
        />
      )}
      <span
        className={`text-sm ${
          isChecked ? 'line-through text-muted-foreground' : ''
        }`}
      >
        {content}
      </span>
    </label>
  )
}

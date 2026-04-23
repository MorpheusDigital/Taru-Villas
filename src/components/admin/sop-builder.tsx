'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { z } from 'zod/v4'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  ChevronDown,
  ChevronRight,
  FolderPlus,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

import type { SopTemplateWithContent } from '@/lib/db/queries/sops'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  id: z.string().optional(),
  content: z.string().min(1, 'Item content is required'),
  sortOrder: z.number(),
})

const sectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Section name is required'),
  sortOrder: z.number(),
  items: z.array(itemSchema).min(1, 'Section needs at least one item'),
})

const formSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional(),
  isActive: z.boolean(),
  sections: z.array(sectionSchema),
  ungroupedItems: z.array(itemSchema),
})

type FormValues = z.infer<typeof formSchema>

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SopBuilderProps {
  initialData?: SopTemplateWithContent
}

export function SopBuilder({ initialData }: SopBuilderProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(
    new Set()
  )
  const isEditing = !!initialData

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          description: initialData.description ?? '',
          isActive: initialData.isActive,
          sections: initialData.sections.map((s, si) => ({
            id: s.id,
            name: s.name,
            sortOrder: si,
            items: s.items.map((item, ii) => ({
              id: item.id,
              content: item.content,
              sortOrder: ii,
            })),
          })),
          ungroupedItems: initialData.ungroupedItems.map((item, i) => ({
            id: item.id,
            content: item.content,
            sortOrder: i,
          })),
        }
      : {
          name: '',
          description: '',
          isActive: true,
          sections: [],
          ungroupedItems: [{ content: '', sortOrder: 0 }],
        },
  })

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    watch,
  } = form

  const {
    fields: sectionFields,
    append: appendSection,
    remove: removeSection,
  } = useFieldArray({ control, name: 'sections' })

  const {
    fields: ungroupedFields,
    append: appendUngrouped,
    remove: removeUngrouped,
  } = useFieldArray({ control, name: 'ungroupedItems' })

  const toggleSection = (index: number) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const onSubmit = async (data: FormValues) => {
    setSaving(true)
    try {
      // Re-number sort orders
      const sections = data.sections.map((s, si) => ({
        ...s,
        sortOrder: si,
        items: s.items.map((item, ii) => ({ ...item, sortOrder: ii })),
      }))
      const ungroupedItems = data.ungroupedItems.map((item, i) => ({
        ...item,
        sortOrder: i,
      }))

      const payload = {
        name: data.name,
        description: data.description || undefined,
        isActive: data.isActive,
        sections,
        ungroupedItems,
      }

      const url = isEditing
        ? `/api/sops/templates/${initialData.id}`
        : '/api/sops/templates'
      const method = isEditing ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      const result = await res.json()

      if (isEditing) {
        router.refresh()
      } else {
        router.push(`/sops/templates/${result.id}`)
      }
    } catch (error) {
      console.error('Save error:', error)
      alert(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Template metadata */}
      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g., Morning Checks"
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              {...register('description')}
              placeholder="Brief description of this SOP..."
              rows={2}
            />
          </div>
          {isEditing && (
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={watch('isActive')}
                onCheckedChange={(checked) => form.setValue('isActive', checked)}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ungrouped items */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ungroupedFields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <GripVertical className="size-4 shrink-0 text-muted-foreground" />
              <Input
                {...register(`ungroupedItems.${index}.content`)}
                placeholder="Checklist item..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeUngrouped(index)}
                disabled={ungroupedFields.length === 1 && sectionFields.length === 0}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {errors.ungroupedItems && (
            <p className="text-sm text-destructive">
              {typeof errors.ungroupedItems === 'object' && 'message' in errors.ungroupedItems
                ? errors.ungroupedItems.message
                : ''}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendUngrouped({
                content: '',
                sortOrder: ungroupedFields.length,
              })
            }
          >
            <Plus className="size-4" />
            Add Item
          </Button>
        </CardContent>
      </Card>

      {/* Sections */}
      {sectionFields.map((sectionField, sectionIndex) => (
        <SectionCard
          key={sectionField.id}
          sectionIndex={sectionIndex}
          control={control}
          register={register}
          errors={errors}
          collapsed={collapsedSections.has(sectionIndex)}
          onToggle={() => toggleSection(sectionIndex)}
          onRemove={() => removeSection(sectionIndex)}
        />
      ))}

      {/* Add section button */}
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          appendSection({
            name: '',
            sortOrder: sectionFields.length,
            items: [{ content: '', sortOrder: 0 }],
          })
        }
      >
        <FolderPlus className="size-4" />
        Add Section
      </Button>

      {/* Save */}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          <Save className="size-4" />
          {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Section Card sub-component
// ---------------------------------------------------------------------------

function SectionCard({
  sectionIndex,
  control,
  register,
  errors,
  collapsed,
  onToggle,
  onRemove,
}: {
  sectionIndex: number
  control: any
  register: any
  errors: any
  collapsed: boolean
  onToggle: () => void
  onRemove: () => void
}) {
  const {
    fields: itemFields,
    append: appendItem,
    remove: removeItem,
  } = useFieldArray({
    control,
    name: `sections.${sectionIndex}.items`,
  })

  return (
    <Card>
      <Collapsible open={!collapsed} onOpenChange={() => onToggle()}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="size-6">
                {collapsed ? (
                  <ChevronRight className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <Input
              {...register(`sections.${sectionIndex}.name`)}
              placeholder="Section name..."
              className="flex-1 font-medium"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {errors?.sections?.[sectionIndex]?.name && (
            <p className="text-sm text-destructive ml-8">
              {errors.sections[sectionIndex].name.message}
            </p>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {itemFields.map((field, itemIndex) => (
              <div key={field.id} className="flex items-center gap-2 ml-8">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  {...register(
                    `sections.${sectionIndex}.items.${itemIndex}.content`
                  )}
                  placeholder="Checklist item..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeItem(itemIndex)}
                  disabled={itemFields.length === 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="ml-8">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendItem({
                    content: '',
                    sortOrder: itemFields.length,
                  })
                }
              >
                <Plus className="size-4" />
                Add Item
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

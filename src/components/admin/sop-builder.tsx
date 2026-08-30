'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  useForm,
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from 'react-hook-form'
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
  Check,
  ChevronsUpDown,
} from 'lucide-react'
import { toast } from 'sonner'

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'

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

  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState<string | null>(initialData?.categoryId ?? null)
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')

  useEffect(() => {
    fetch('/api/sops/categories')
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setCategories(data))
      .catch(() => setCategories([]))
  }, [])

  async function handleCreateCategory() {
    const name = newCategoryName.trim()
    if (!name) return
    const res = await fetch('/api/sops/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? 'Failed to create category')
      return
    }
    const created = await res.json()
    setCategories([...categories, created])
    setCategoryId(created.id)
    setCreatingCategory(false)
    setNewCategoryName('')
    setCategoryPopoverOpen(false)
  }

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
    if (!isEditing && !categoryId) {
      toast.error('Please select a category')
      return
    }

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
        categoryId,
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Category <span className="text-destructive">*</span></label>
            <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {categoryId
                    ? categories.find((c) => c.id === categoryId)?.name ?? 'Select category…'
                    : 'Select category…'}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search categories…" />
                  <CommandList>
                    <CommandEmpty>No categories found.</CommandEmpty>
                    <CommandGroup>
                      {categories.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCategoryId(c.id)
                            setCategoryPopoverOpen(false)
                          }}
                        >
                          <Check className={cn('mr-2 h-4 w-4', categoryId === c.id ? 'opacity-100' : 'opacity-0')} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    <div className="border-t p-2">
                      {creatingCategory ? (
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="New category name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleCreateCategory()
                              }
                              if (e.key === 'Escape') {
                                setCreatingCategory(false)
                                setNewCategoryName('')
                              }
                            }}
                            autoFocus
                            className="flex-1"
                          />
                          <Button size="sm" onClick={handleCreateCategory}>Create</Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => setCreatingCategory(true)}
                        >
                          <Plus className="mr-2 h-4 w-4" /> Create new category…
                        </Button>
                      )}
                    </div>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
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
  control: Control<FormValues>
  register: UseFormRegister<FormValues>
  errors: FieldErrors<FormValues>
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

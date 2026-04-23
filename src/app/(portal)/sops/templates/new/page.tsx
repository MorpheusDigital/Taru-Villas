import { requireRole } from '@/lib/auth/guards'
import { SopBuilder } from '@/components/admin/sop-builder'

export default async function NewSopPage() {
  await requireRole(['admin'])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create SOP Template</h1>
        <p className="text-muted-foreground">
          Define a new Standard Operating Procedure checklist.
        </p>
      </div>
      <SopBuilder />
    </div>
  )
}

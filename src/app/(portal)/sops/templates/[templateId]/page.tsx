import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { getTemplateById, getAssignmentsForTemplate } from '@/lib/db/queries/sops'
import { getProperties } from '@/lib/db/queries/properties'
import { getActiveUsersForOrg } from '@/lib/db/queries/sops'
import { SopBuilder } from '@/components/admin/sop-builder'
import { SopAssignments } from '@/components/admin/sop-assignments'
import { Separator } from '@/components/ui/separator'

type Params = { params: Promise<{ templateId: string }> }

export default async function EditSopPage({ params }: Params) {
  const profile = await requireRole(['admin'])
  const { templateId } = await params

  const [template, assignments, orgProperties, orgUsers] = await Promise.all([
    getTemplateById(templateId),
    getAssignmentsForTemplate(templateId),
    getProperties(profile.orgId),
    getActiveUsersForOrg(profile.orgId),
  ])

  if (!template) notFound()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Edit SOP Template</h1>
        <p className="text-muted-foreground">
          Update the checklist and manage assignments.
        </p>
      </div>

      <SopBuilder initialData={template} />

      <Separator />

      <SopAssignments
        templateId={template.id}
        assignments={assignments}
        properties={orgProperties.map((p) => ({ id: p.id, name: p.name }))}
        users={orgUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
      />
    </div>
  )
}

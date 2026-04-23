import Link from 'next/link'
import { requireRole } from '@/lib/auth/guards'
import { getTemplatesForOrg } from '@/lib/db/queries/sops'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SopsAreaTabs } from '@/components/sops/sops-area-tabs'
import { Plus, ClipboardList } from 'lucide-react'

export default async function AdminSopsPage() {
  const profile = await requireRole(['admin'])
  const templates = await getTemplatesForOrg(profile.orgId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SOPs</h1>
          <p className="text-muted-foreground">
            Create and manage Standard Operating Procedure checklists.
          </p>
        </div>
        <Button asChild>
          <Link href="/sops/templates/new">
            <Plus className="size-4" />
            Create SOP
          </Link>
        </Button>
      </div>

      <SopsAreaTabs />

      <Separator />

      {/* Templates grid */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ClipboardList className="size-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">No SOP templates yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Create your first SOP template to define standard operating
              procedures for your properties.
            </p>
            <Button asChild className="mt-6">
              <Link href="/sops/templates/new">
                <Plus className="size-4" />
                Create SOP
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="space-y-1">
                  <CardTitle className="truncate">{template.name}</CardTitle>
                  {template.description && (
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold">{template.itemCount}</p>
                    <p className="text-xs text-muted-foreground">Items</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {template.assignmentCount}
                    </p>
                    <p className="text-xs text-muted-foreground">Assignments</p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t pt-4">
                <Badge variant={template.isActive ? 'default' : 'secondary'}>
                  {template.isActive ? 'Active' : 'Inactive'}
                </Badge>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/sops/templates/${template.id}`}>Edit</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

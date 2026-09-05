import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { z } from 'zod/v4'
import { requireAuth } from '@/lib/auth/guards'
import { getVehicleRenewalDetails } from '@/lib/db/queries/vehicle-renewals'
import { documentStatus } from '@/lib/fleet/vehicle-compliance'
import { colomboToday } from '@/lib/fleet/dates'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function VehicleRenewalPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile?.isActive) redirect('/login')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const details = await getVehicleRenewalDetails(id, profile.orgId)
  if (!details) notFound()
  const { vehicle, documents, cycles } = details
  return <div className="mx-auto max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-semibold">{vehicle.name} — renewals</h1><p className="text-muted-foreground">{vehicle.registrationNo ?? 'Registration not recorded'}</p></div>
    {profile.role === 'admin' && <Button asChild variant="outline"><Link href="/admin/fleet/vehicles">Manage vehicle details</Link></Button>}
    <p className="text-sm text-muted-foreground">Renewal tasks start {vehicle.renewalLeadDays} days before expiry. Completing a task does not change the document dates; ask an administrator to record the renewed coverage.</p>
    {!vehicle.administrationManagerId && <p className="text-sm text-amber-700">An Administration Manager must be assigned before tasks can be created.</p>}
    {documents.map(doc => <section key={doc.kind} className="space-y-3 border-t pt-4">
      <h2 className="font-semibold">{doc.label}</h2>
      <p className="text-sm">Expiry: {doc.expiry ?? 'Not recorded'} · {documentStatus(doc.expiry, vehicle.compliance[`${doc.kind}Valid`], colomboToday(), vehicle.renewalLeadDays)}</p>
      {cycles.filter(c => c.kind === doc.kind).map(c => <div key={c.taskId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{c.expiry} — {c.status.replaceAll('_', ' ')}</span>
        <Link className="underline underline-offset-2" href={`/tasks/${c.projectId}?task=${c.taskId}`}>Open renewal task</Link>
      </div>)}
      {!cycles.some(c => c.kind === doc.kind) && <p className="text-sm text-muted-foreground">No renewal task yet.</p>}
    </section>)}
  </div>
}

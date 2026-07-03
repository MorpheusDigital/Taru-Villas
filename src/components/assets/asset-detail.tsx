'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import { categoryLabel, statusLabel, type AssetStatus } from '@/lib/assets/labels'
import type { AssetRow, AssetFinancialRow } from '@/lib/db/queries/assets'
import type { MaintenanceLogRow } from '@/lib/db/queries/maintenance'

// ---------------------------------------------------------------------------
// Financial narrowing
// ---------------------------------------------------------------------------
// `asset` is `AssetRow | AssetFinancialRow` — its shape depends on
// `showFinancials` (staff assets never carry financial fields at runtime).
// `isFinancialRow` is a real type guard (not a cast), mirroring the guard
// used in asset-directory.tsx / the edit page, so every financial-field
// access below is safe even though the prop type is the union.

function isFinancialRow(row: AssetRow | AssetFinancialRow): row is AssetFinancialRow {
  return 'netBookValue' in row
}

const currencyFormatter = new Intl.NumberFormat('en-LK', {
  style: 'currency',
  currency: 'LKR',
  maximumFractionDigits: 0,
})

function formatCurrency(value: number | string): string {
  return currencyFormatter.format(Number(value))
}

function formatDate(value: string): string {
  return format(new Date(`${value}T00:00:00`), 'dd MMM yyyy')
}

const STATUS_BADGE_CLASSES: Record<AssetStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_repair: 'bg-amber-100 text-amber-700 border-amber-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
  disposed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

const RESOLUTION_BADGE_CLASSES: Record<MaintenanceLogRow['resolutionStatus'], string> = {
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  resolved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

interface AssetDetailProps {
  asset: AssetRow | AssetFinancialRow
  logs: MaintenanceLogRow[]
  showFinancials: boolean
  canEdit: boolean
  canDelete: boolean
}

export function AssetDetail({ asset, logs, showFinancials, canEdit, canDelete }: AssetDetailProps) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to delete asset')
      }
      toast.success('Asset deleted')
      router.push('/assets/directory')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete asset')
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/assets/directory">
          <ArrowLeft className="size-4" />
          Back to Directory
        </Link>
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className={STATUS_BADGE_CLASSES[asset.status]}>
              {statusLabel(asset.status)}
            </Badge>
            <span className="font-mono text-xs text-muted-foreground">{asset.assetCode}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" asChild>
              <Link href={`/assets/${asset.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDeleting}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Asset</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete &ldquo;{asset.name}&rdquo;? Its maintenance
                    history and event log will also be permanently removed. This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        {asset.imageUrl && (
          <div className="overflow-hidden rounded-lg border bg-muted">
            <img
              src={asset.imageUrl}
              alt={asset.name}
              className="max-h-96 w-full object-cover"
            />
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Asset Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailField label="Category" value={categoryLabel(asset.category)} />
              <DetailField label="Property" value={asset.propertyName} />
              <DetailField label="Room" value={asset.roomName ?? '—'} />
              <DetailField label="Serial Number" value={asset.serialNumber ?? '—'} />
              <DetailField label="Vendor" value={asset.vendorName ?? '—'} />
              <DetailField
                label="Warranty Expiry"
                value={asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : '—'}
              />
              <DetailField label="Purchase Date" value={formatDate(asset.purchaseDate)} />
              <DetailField
                label="Last Audited"
                value={asset.lastAuditedAt ? format(asset.lastAuditedAt, 'dd MMM yyyy') : 'Never'}
              />
            </dl>
          </CardContent>
        </Card>

        {/* Financial block — admin/PM only, guarded on both the boolean flag
            AND a runtime type-narrow of the union so a mis-set flag can
            never leak fields that don't even exist on a staff row. */}
        {showFinancials && isFinancialRow(asset) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financials</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DetailField label="Purchase Cost" value={formatCurrency(asset.purchaseCost)} />
                <DetailField label="Salvage Value" value={formatCurrency(asset.salvageValue)} />
                <DetailField label="Useful Life" value={`${asset.usefulLifeYears} years`} />
                <DetailField
                  label="Annual Depreciation"
                  value={formatCurrency(asset.annualDepreciation)}
                />
                <DetailField
                  label="Accumulated Depreciation"
                  value={formatCurrency(asset.accumulatedDepreciation)}
                />
                <DetailField label="Net Book Value" value={formatCurrency(asset.netBookValue)} />
              </dl>
            </CardContent>
          </Card>
        )}

        {/* Maintenance history */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maintenance History</CardTitle>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No maintenance logs recorded yet.
              </p>
            ) : (
              <ul className="space-y-4">
                {logs.map((log, i) => (
                  <li key={log.id}>
                    {i > 0 && <Separator className="mb-4" />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm">{log.issueDescription}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {log.serviceDate && <span>Serviced {formatDate(log.serviceDate)}</span>}
                          {log.reporterName && <span>Reported by {log.reporterName}</span>}
                          <span>Logged {format(log.createdAt, 'dd MMM yyyy')}</span>
                          {log.resolvedAt && (
                            <span>Resolved {format(log.resolvedAt, 'dd MMM yyyy')}</span>
                          )}
                        </div>
                        {/* repairCost is a financial figure — the maintenance
                            query returns it unconditionally, so gate the
                            render on showFinancials to keep staff blind to it. */}
                        {showFinancials && log.repairCost && (
                          <p className="text-xs text-muted-foreground">
                            Repair cost: {formatCurrency(log.repairCost)}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={RESOLUTION_BADGE_CLASSES[log.resolutionStatus]}
                      >
                        {log.resolutionStatus === 'resolved' ? 'Resolved' : 'Pending'}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  )
}

'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  type Column,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Package,
  Plus,
  Search,
} from 'lucide-react'
import { format } from 'date-fns'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toCsv } from '@/lib/assets/csv'
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  categoryLabel,
  statusLabel,
  type AssetCategory,
  type AssetStatus,
} from '@/lib/assets/labels'
import type { AssetRow, AssetFinancialRow } from '@/lib/db/queries/assets'
import type { Property } from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// Financial narrowing
// ---------------------------------------------------------------------------
// `assets` is `AssetRow[] | AssetFinancialRow[]` — a homogeneous array whose
// element shape depends on `showFinancials` (staff rows never carry
// financial fields at runtime). `isFinancialRow` is a real type guard (not a
// cast) so every financial-field access is safe even though the column/table
// types operate over the union.

type AssetTableRow = AssetRow | AssetFinancialRow

function isFinancialRow(row: AssetTableRow): row is AssetFinancialRow {
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

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_BADGE_CLASSES: Record<AssetStatus, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  in_repair: 'bg-amber-100 text-amber-700 border-amber-200',
  missing: 'bg-red-100 text-red-700 border-red-200',
  disposed: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

function StatusBadge({ status }: { status: AssetStatus }) {
  return (
    <Badge variant="outline" className={STATUS_BADGE_CLASSES[status]}>
      {statusLabel(status)}
    </Badge>
  )
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function sortableHeader(label: string) {
  return function Header({ column }: { column: Column<AssetTableRow, unknown> }) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        {label}
        <ArrowUpDown className="size-3.5" />
      </Button>
    )
  }
}

function createColumns(showFinancials: boolean): ColumnDef<AssetTableRow>[] {
  const columns: ColumnDef<AssetTableRow>[] = [
    {
      accessorKey: 'assetCode',
      header: 'Code',
      cell: ({ row }) => (
        <Link
          href={`/assets/${row.original.id}`}
          className="font-mono text-xs hover:underline"
        >
          {row.original.assetCode}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <Link href={`/assets/${row.original.id}`} className="font-medium hover:underline">
          {row.original.name}
        </Link>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => categoryLabel(row.original.category),
    },
    {
      accessorKey: 'propertyName',
      header: 'Property',
    },
    {
      accessorKey: 'roomName',
      header: 'Room',
      cell: ({ row }) =>
        row.original.roomName ?? (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'purchaseDate',
      header: sortableHeader('Purchase Date'),
      cell: ({ row }) => formatDate(row.original.purchaseDate),
    },
  ]

  if (showFinancials) {
    columns.push(
      {
        id: 'purchaseCost',
        header: 'Purchase Cost',
        cell: ({ row }) => {
          const asset = row.original
          return isFinancialRow(asset) ? formatCurrency(asset.purchaseCost) : null
        },
      },
      {
        id: 'netBookValue',
        accessorFn: (row) => (isFinancialRow(row) ? row.netBookValue : null),
        header: sortableHeader('NBV'),
        cell: ({ row }) => {
          const asset = row.original
          return isFinancialRow(asset) ? formatCurrency(asset.netBookValue) : null
        },
      },
    )
  }

  return columns
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCsv(rows: AssetTableRow[], showFinancials: boolean) {
  const headers = [
    'Code',
    'Name',
    'Category',
    'Property',
    'Room',
    'Status',
    'Purchase Date',
    ...(showFinancials ? ['Purchase Cost', 'NBV'] : []),
  ]

  const body = rows.map((asset) => {
    const base: (string | number | null | undefined)[] = [
      asset.assetCode,
      asset.name,
      categoryLabel(asset.category),
      asset.propertyName,
      asset.roomName,
      statusLabel(asset.status),
      asset.purchaseDate,
    ]
    if (showFinancials && isFinancialRow(asset)) {
      base.push(asset.purchaseCost, asset.netBookValue)
    }
    return base
  })

  const csv = toCsv(headers, body)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `asset-directory-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------
// AssetDirectory component
// ---------------------------------------------------------------------------

interface AssetDirectoryProps {
  assets: AssetTableRow[]
  properties: Property[]
  showFinancials: boolean
  canCreate: boolean
}

export function AssetDirectory({
  assets,
  properties,
  showFinancials,
  canCreate,
}: AssetDirectoryProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [propertyFilter, setPropertyFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | AssetCategory>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | AssetStatus>('all')

  const columns = useMemo(() => createColumns(showFinancials), [showFinancials])

  const filteredData = useMemo(() => {
    return assets.filter((asset) => {
      if (propertyFilter !== 'all' && asset.propertyId !== propertyFilter) return false
      if (categoryFilter !== 'all' && asset.category !== categoryFilter) return false
      if (statusFilter !== 'all' && asset.status !== statusFilter) return false
      return true
    })
  }, [assets, propertyFilter, categoryFilter, statusFilter])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const search = filterValue.toLowerCase()
      const asset = row.original
      return (
        asset.name.toLowerCase().includes(search) ||
        asset.assetCode.toLowerCase().includes(search) ||
        (asset.serialNumber?.toLowerCase().includes(search) ?? false)
      )
    },
    initialState: {
      pagination: { pageSize: 15 },
    },
  })

  function handleExport() {
    const rows = table.getSortedRowModel().rows.map((r) => r.original)
    exportCsv(rows, showFinancials)
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Directory</h2>
          <p className="text-sm text-muted-foreground">
            Every tracked asset across your properties
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="size-4" />
            Export CSV
          </Button>
          {canCreate && (
            <Button asChild>
              <Link href="/assets/directory/new">
                <Plus className="size-4" />
                Add Asset
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, code or serial..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryFilter}
          onValueChange={(v) => setCategoryFilter(v as 'all' | AssetCategory)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {ASSET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {categoryLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | AssetStatus)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ASSET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="size-8 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No assets found</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {table.getRowModel().rows.length} of{' '}
            {table.getFilteredRowModel().rows.length} assets
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

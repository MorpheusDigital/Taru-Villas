'use client'

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ImportPreview, RosterImportType } from '@/lib/rostering/imports'

interface ImportPanelProps {
  isAdmin: boolean
  defaultMonth: string
  propertyCodes: string[]
  employeeNumbers: string[]
}

const labels: Record<RosterImportType, string> = {
  employees: 'Employees',
  forecasts: 'Forecasts',
  unavailability: 'Approved unavailability',
  boundary: 'Initial boundary context',
}

function templateFor(
  type: RosterImportType,
  propertyCode: string,
  employeeNumber: string,
  month: string,
): string {
  if (type === 'employees') {
    return [
      'employee_number,full_name,department_code,role_code,base_property_code,residency_type,home_distance_km,start_date,is_active,end_date,secondary_role_codes,portal_email',
      `EMP-001,Sample Employee,FB,WAITER,${propertyCode},resident,12.5,${month}-01,true,,GSA,`,
    ].join('\r\n')
  }
  if (type === 'forecasts') {
    return [
      'property_code,date,occupancy_percent,arrivals_count,departures_count',
      `${propertyCode},${month}-01,65,3,2`,
    ].join('\r\n')
  }
  if (type === 'unavailability') {
    return [
      'employee_number,start_date,end_date,type,reference,note',
      `${employeeNumber},${month}-10,${month}-12,annual_leave,AL-001,Approved source record`,
    ].join('\r\n')
  }
  return [
    'employee_number,date,working_minutes,rest_category',
    `${employeeNumber},${month}-01,480,none`,
  ].join('\r\n')
}

export function ImportPanel({
  isAdmin,
  defaultMonth,
  propertyCodes,
  employeeNumbers,
}: ImportPanelProps) {
  const [type, setType] = useState<RosterImportType>('forecasts')
  const [month, setMonth] = useState(defaultMonth)
  const [fileName, setFileName] = useState('')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const canCommit = isAdmin || !['employees', 'boundary'].includes(type)

  function downloadTemplate() {
    const contents = templateFor(
      type,
      propertyCodes[0] ?? 'PROPERTY_CODE',
      employeeNumbers[0] ?? 'EMPLOYEE_NUMBER',
      month,
    )
    const url = URL.createObjectURL(
      new Blob([contents], { type: 'text/csv;charset=utf-8' }),
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `tarushift-${type}-template.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return
    setFileName(file.name)
    setCsv(await file.text())
    setPreview(null)
  }

  async function previewFile() {
    if (!csv) return toast.error('Choose a CSV file')
    setIsLoading(true)
    try {
      const response = await fetch(`/api/rostering/imports/${type}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv, month: type === 'forecasts' ? month : undefined }),
      })
      const body = (await response.json()) as ImportPreview & { error?: string }
      if (!body.summary) throw new Error(body.error ?? 'Preview failed')
      setPreview(body)
      if (body.errors.length) toast.error('Preview contains row errors')
      else toast.success('CSV preview ready')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function commit() {
    if (!preview || preview.errors.length) return
    setIsLoading(true)
    try {
      const response = await fetch(`/api/rostering/imports/${type}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv,
          checksum: preview.checksum,
          sourceFileName: fileName,
          month: type === 'forecasts' ? month : undefined,
        }),
      })
      const body = (await response.json()) as {
        error?: string
        added?: number
        updated?: number
        unchanged?: number
      }
      if (!response.ok) throw new Error(body.error ?? 'Commit failed')
      toast.success(
        `Import committed: ${body.added} added, ${body.updated} updated, ${body.unchanged} unchanged`,
      )
      setPreview(null)
      setCsv('')
      setFileName('')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Commit failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="gap-3 py-4">
        <CardHeader className="px-4">
          <CardTitle className="text-sm">Import contract</CardTitle>
          <CardDescription>Choose the source dataset to validate.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1 px-3">
          {(Object.keys(labels) as RosterImportType[]).map((item) => {
            const adminOnly = ['employees', 'boundary'].includes(item)
            return (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setType(item)
                  setPreview(null)
                }}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                  type === item ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950' : 'hover:bg-muted'
                }`}
              >
                <span>{labels[item]}</span>
                {adminOnly && <span className="text-[10px] uppercase opacity-60">Admin</span>}
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b px-6 py-5">
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-teal-700 dark:text-teal-300" />
            {labels[type]}
          </CardTitle>
          <CardDescription>
            Download the exact headers, then preview every row before committing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-6 py-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="import-month">Planning month</Label>
              <Input
                id="import-month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="w-44"
              />
            </div>
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download /> Download template
            </Button>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-9 text-center transition-colors hover:bg-muted/40">
            <Upload className="size-6 text-muted-foreground" />
            <span className="mt-3 text-sm font-medium">
              {fileName || 'Choose a UTF-8 CSV file'}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">Maximum 2 MB and 5,000 rows</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => chooseFile(event.target.files?.[0])}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={previewFile} disabled={!csv || isLoading}>
              {isLoading ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              Preview rows
            </Button>
            <Button
              variant="outline"
              onClick={commit}
              disabled={!preview || preview.errors.length > 0 || !canCommit || isLoading}
            >
              <CheckCircle2 /> Commit approved data
            </Button>
          </div>

          {!canCommit && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              This contract is admin-only. You may preview it, but cannot commit it.
            </p>
          )}
          {type === 'employees' && (
            <p className="text-sm text-muted-foreground">
              The optional portal_email column is informational only. After import,
              use Staff account links to explicitly connect an existing Portal user.
            </p>
          )}

          {preview && (
            <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{preview.summary.totalRows} rows</Badge>
                <Badge variant="secondary">{preview.summary.validRows} valid</Badge>
                <Badge variant={preview.errors.length ? 'destructive' : 'outline'}>
                  {preview.errors.length} errors
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {preview.checksum.slice(0, 12)}…
                </Badge>
              </div>
              {preview.errors.length > 0 ? (
                <div className="space-y-2">
                  {preview.errors.slice(0, 20).map((error, index) => (
                    <div key={`${error.row}-${error.field}-${index}`} className="flex gap-2 text-sm text-rose-700 dark:text-rose-300">
                      <AlertCircle className="mt-0.5 size-4 shrink-0" />
                      <span>Row {error.row} · {error.field}: {error.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-4" /> All rows satisfy the CSV contract.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

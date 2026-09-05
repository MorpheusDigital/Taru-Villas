'use client'

import { Controller, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VehicleCompliance } from '@/lib/fleet/vehicle-compliance'

export interface VehicleFormValues {
  name: string; registrationNo: string; maxPassengers: number; cargoCapable: boolean; isRestricted: boolean
  status: 'active' | 'maintenance' | 'retired'; currentLocationPropertyId: string; sortOrder: number
  administrationManagerId: string; renewalLeadDays: number; compliance: VehicleCompliance
}
export type ManagerOption = { id: string; fullName: string; isActive: boolean }
type Field = { key: Exclude<keyof VehicleCompliance, 'sourceRecord'>; label: string; type?: 'date' | 'flag' | 'ownership' }
const groups: { title: string; fields: Field[] }[] = [
  { title: 'Vehicle identity & acquisition', fields: [
    { key: 'chassisNo', label: 'Chassis number' },
    { key: 'purchaseDate', label: 'Purchase date', type: 'date' }, { key: 'transferDate', label: 'Transfer date', type: 'date' },
    { key: 'purchaseValue', label: 'Purchase value (as recorded; currency not supplied)' },
  ] },
  { title: 'Registration book & ownership', fields: [
    { key: 'originalBookAvailable', label: 'Original book available', type: 'flag' },
    { key: 'bookOwner', label: 'Owner of the book' }, { key: 'ownership', label: 'Ownership', type: 'ownership' },
    { key: 'absoluteOwner', label: 'Absolute owner' }, { key: 'ownershipNotes', label: 'Ownership details' },
  ] },
  { title: 'Lease & finance', fields: [
    { key: 'leasedValue', label: 'Leased value (as recorded; currency not supplied)' },
    { key: 'leaseTenureMonths', label: 'Lease tenure (months)' },
    { key: 'leaseStart', label: 'Lease start', type: 'date' }, { key: 'leaseEnd', label: 'Lease end', type: 'date' },
  ] },
  { title: 'Custodian & driver', fields: [
    { key: 'assignedCustodian', label: 'Assigned custodian / role (not renewal task assignee)' },
    { key: 'driverName', label: 'Driver name' }, { key: 'driverLicenceNo', label: 'Driver licence number' },
    { key: 'driverLicenceExpiry', label: 'Driver licence expiry', type: 'date' },
  ] },
  { title: 'Revenue licence', fields: [
    { key: 'revenueLicenceValid', label: 'Valid', type: 'flag' }, { key: 'revenueLicenceType', label: 'Licence type' },
    { key: 'revenueLicenceStart', label: 'Period start', type: 'date' }, { key: 'revenueLicenceEnd', label: 'Period end / expiry', type: 'date' },
  ] },
  { title: 'Insurance', fields: [
    { key: 'insuranceValid', label: 'Valid', type: 'flag' }, { key: 'insurancePolicyNo', label: 'Policy number' },
    { key: 'insuranceStart', label: 'Period start', type: 'date' }, { key: 'insuranceEnd', label: 'Period end / expiry', type: 'date' },
    { key: 'insuranceProvider', label: 'Insurance service provider' },
    { key: 'insuranceStatusNote', label: 'Cover / status details' },
  ] },
  { title: 'Emission test', fields: [
    { key: 'emissionRequired', label: 'Emission test applicable', type: 'flag' },
    { key: 'emissionValid', label: 'Valid', type: 'flag' },
    { key: 'emissionStart', label: 'Period start', type: 'date' }, { key: 'emissionEnd', label: 'Period end / expiry', type: 'date' },
  ] },
  { title: 'Keys', fields: [
    { key: 'key1', label: 'Key 1 — holder / location' }, { key: 'key2', label: 'Key 2 — holder / location' }, { key: 'rearKey', label: 'Rear key — holder / location' },
  ] },
  { title: 'GPS & service provider', fields: [
    { key: 'gpsAvailable', label: 'GPS available', type: 'flag' }, { key: 'gpsSim', label: 'SIM details' }, { key: 'serviceProvider', label: 'Service provider' },
  ] },
  { title: 'Document copies available', fields: [
    { key: 'bookCopy', label: 'Book copy', type: 'flag' }, { key: 'insuranceCopy', label: 'Insurance copy', type: 'flag' },
    { key: 'revenueLicenceCopy', label: 'Revenue licence copy', type: 'flag' }, { key: 'emissionCopy', label: 'Emission test copy', type: 'flag' },
  ] },
]

export function VehicleComplianceFields({ control, register, managers }: {
  control: Control<VehicleFormValues>; register: UseFormRegister<VehicleFormValues>; managers: ManagerOption[]
}) {
  const source = useWatch({ control, name: 'compliance.sourceRecord' })
  return <div className="space-y-6">
    {source && <div className="rounded-lg border p-3 text-sm space-y-2">
      <p>Imported from {source.fileName}. Blank fields are unknown, not zero or No. Review the source below for historical values.</p>
      {source.warnings.length > 0 && <ul className="list-disc pl-5 text-amber-800 dark:text-amber-300">{source.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
    </div>}
    <fieldset className="space-y-3 border-t pt-4">
      <legend className="px-1 text-base font-semibold">Renewal responsibility</legend>
      <p className="text-sm text-muted-foreground">Tasks are assigned before expiry. After renewal, update the dates here. Unknown details can be left blank.</p>
      <Label htmlFor="vehicle-manager">Administration Manager</Label>
      <Controller control={control} name="administrationManagerId" render={({ field }) => (
        <Select value={field.value || '_none_'} onValueChange={v => field.onChange(v === '_none_' ? '' : v)}>
          <SelectTrigger id="vehicle-manager" className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="_none_">Not assigned</SelectItem>
            {managers.filter(m => m.isActive || m.id === field.value).map(m => <SelectItem key={m.id} value={m.id} disabled={!m.isActive}>{m.fullName}{!m.isActive ? ' (inactive — reassign)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
      )} />
      <Label htmlFor="vehicle-lead">Create renewal tasks this many days before expiry</Label>
      <Input id="vehicle-lead" type="number" min={0} max={365} required {...register('renewalLeadDays', { valueAsNumber: true, min: 0, max: 365, required: true })} />
    </fieldset>
    {groups.map(group => <fieldset key={group.title} className="border-t pt-4">
      <legend className="px-1 text-base font-semibold">{group.title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map(({ key, label, type }) => <div key={key} className="space-y-2">
          <Label htmlFor={`vehicle-${key}`}>{label}</Label>
          {type === 'flag' || type === 'ownership' ? <Controller control={control} name={`compliance.${key}`} render={({ field }) => (
            <Select value={field.value == null ? '_unknown_' : String(field.value)} onValueChange={v => field.onChange(v === '_unknown_' ? null : type === 'flag' ? v === 'true' : v)}>
              <SelectTrigger id={`vehicle-${key}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="_unknown_">Not recorded</SelectItem>
                {type === 'flag' ? <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></> : <><SelectItem value="leased">Leased</SelectItem><SelectItem value="owned">Owned</SelectItem><SelectItem value="refinanced">Refinanced</SelectItem></>}
              </SelectContent>
            </Select>
          )} /> : <Input id={`vehicle-${key}`} type={type === 'date' ? 'date' : 'text'} maxLength={255} {...register(`compliance.${key}`)} />}
        </div>)}
      </div>
    </fieldset>)}
    <div className="space-y-2 border-t pt-4">
      <Label htmlFor="vehicle-record-notes">Record notes / details awaiting confirmation</Label>
      <Textarea id="vehicle-record-notes" maxLength={4000} {...register('compliance.recordNotes')} />
    </div>
    {source && <details className="border-t pt-4">
      <summary className="cursor-pointer font-semibold">Original imported values (all sheet fields)</summary>
      <p className="my-2 text-sm text-muted-foreground">This snapshot preserves the original sheet, including blanks and inconsistencies. Edit the current fields above after confirming corrections.</p>
      <dl className="divide-y text-sm">{source.cells.map(cell => <div key={cell.row} className="grid grid-cols-2 gap-3 py-2">
        <dt className="text-muted-foreground">{cell.section}{cell.detail ? ` — ${cell.detail}` : ''}</dt>
        <dd className="whitespace-pre-wrap break-words">{cell.value || 'Not supplied'}</dd>
      </div>)}</dl>
    </details>}
  </div>
}

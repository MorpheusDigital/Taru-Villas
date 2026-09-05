'use client'

import { Controller, type Control, type UseFormRegister } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { VehicleCompliance } from '@/lib/fleet/vehicle-compliance'

export interface VehicleFormValues {
  name: string; registrationNo: string; maxPassengers: number; cargoCapable: boolean; isRestricted: boolean
  status: 'active' | 'maintenance' | 'retired'; currentLocationPropertyId: string; sortOrder: number
  administrationManagerId: string; renewalLeadDays: number; compliance: VehicleCompliance
}
export type ManagerOption = { id: string; fullName: string; isActive: boolean }
type Field = { key: keyof VehicleCompliance; label: string; type?: 'date' | 'flag' | 'ownership' }
const groups: { title: string; fields: Field[] }[] = [
  { title: 'Registration book & ownership', fields: [
    { key: 'originalBookAvailable', label: 'Original book available', type: 'flag' },
    { key: 'bookOwner', label: 'Owner of the book' }, { key: 'ownership', label: 'Ownership', type: 'ownership' },
  ] },
  { title: 'Revenue licence', fields: [
    { key: 'revenueLicenceValid', label: 'Valid', type: 'flag' }, { key: 'revenueLicenceType', label: 'Licence type' },
    { key: 'revenueLicenceStart', label: 'Period start', type: 'date' }, { key: 'revenueLicenceEnd', label: 'Period end / expiry', type: 'date' },
  ] },
  { title: 'Insurance', fields: [
    { key: 'insuranceValid', label: 'Valid', type: 'flag' }, { key: 'insurancePolicyNo', label: 'Policy number' },
    { key: 'insuranceStart', label: 'Period start', type: 'date' }, { key: 'insuranceEnd', label: 'Period end / expiry', type: 'date' },
    { key: 'insuranceProvider', label: 'Insurance service provider' },
  ] },
  { title: 'Emission test', fields: [
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
  return <div className="space-y-6">
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
                {type === 'flag' ? <><SelectItem value="true">Yes</SelectItem><SelectItem value="false">No</SelectItem></> : <><SelectItem value="leased">Leased</SelectItem><SelectItem value="owned">Owned</SelectItem></>}
              </SelectContent>
            </Select>
          )} /> : <Input id={`vehicle-${key}`} type={type === 'date' ? 'date' : 'text'} maxLength={255} {...register(`compliance.${key}`)} />}
        </div>)}
      </div>
    </fieldset>)}
  </div>
}

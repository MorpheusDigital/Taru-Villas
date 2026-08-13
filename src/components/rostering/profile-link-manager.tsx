'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Loader2, UserRoundCheck } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProfileLinkManagerProps {
  employees: Array<{
    id: string
    employeeNumber: string
    fullName: string
    profileId: string | null
  }>
  profiles: Array<{
    id: string
    email: string
    fullName: string
    role: 'admin' | 'property_manager' | 'staff'
  }>
}

export function ProfileLinkManager({
  employees,
  profiles,
}: ProfileLinkManagerProps) {
  const router = useRouter()
  const [selections, setSelections] = useState<Record<string, string>>(
    Object.fromEntries(
      employees.map((employee) => [employee.id, employee.profileId ?? 'none']),
    ),
  )
  const [savingId, setSavingId] = useState<string | null>(null)

  async function save(employeeId: string) {
    setSavingId(employeeId)
    try {
      const value = selections[employeeId] ?? 'none'
      const response = await fetch(
        `/api/rostering/employees/${employeeId}/profile-link`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profileId: value === 'none' ? null : value }),
        },
      )
      const result = (await response.json().catch(() => ({}))) as {
        error?: string
      }
      if (!response.ok) throw new Error(result.error ?? 'Link failed')
      toast.success('Portal account link saved')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Link failed')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b px-5 py-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserRoundCheck className="size-4" /> Staff account links
        </CardTitle>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Link an employee to one existing Portal account. Employee CSV imports
          never create Portal users; linking controls who can see a published My Roster.
        </p>
      </CardHeader>
      <CardContent className="divide-y px-0 py-0">
        {employees.map((employee) => {
          const selected = selections[employee.id] ?? 'none'
          const changed = selected !== (employee.profileId ?? 'none')
          return (
            <div
              key={employee.id}
              className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1fr)_minmax(280px,1.4fr)_auto] md:items-center"
            >
              <div>
                <p className="font-medium">{employee.fullName}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {employee.employeeNumber}
                </p>
              </div>
              <Select
                value={selected}
                onValueChange={(value) =>
                  setSelections((current) => ({
                    ...current,
                    [employee.id]: value,
                  }))
                }
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked</SelectItem>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.email} · {profile.role.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                {!changed && employee.profileId && (
                  <Badge variant="secondary"><Link2 /> Linked</Badge>
                )}
                <Button
                  size="sm"
                  onClick={() => save(employee.id)}
                  disabled={!changed || savingId !== null}
                >
                  {savingId === employee.id && <Loader2 className="animate-spin" />}
                  Save
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

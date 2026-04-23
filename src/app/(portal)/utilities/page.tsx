import Link from 'next/link'
import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { requireAuth } from '@/lib/auth/guards'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Meter Readings | Taru Villas',
}

export default async function UtilitiesPickerPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const properties = await getPropertiesForUser(profile.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meter Readings</h1>
        <p className="text-sm text-muted-foreground">
          Select a property to manage its meter readings
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => {
          const imageSrc =
            property.imageUrl || `/properties/${property.code}.png`

          return (
            <Link
              key={property.id}
              href={`/properties/${property.id}/utilities`}
            >
              <Card className="group overflow-hidden py-0 gap-0 transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  <Image
                    src={imageSrc}
                    alt={property.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <CardContent className="space-y-1.5 p-5">
                  <h3 className="font-semibold text-sm">{property.name}</h3>
                  {property.location && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {property.location}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPropertyBySlug } from '@/lib/db/queries/excursions'
import { PublicReadingForm } from '@/components/utilities/public-reading-form'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)

  if (!property) {
    return { title: 'Not Found' }
  }

  return {
    title: `Meter Reading — ${property.name}`,
    description: `Submit daily utility meter readings for ${property.name}.`,
  }
}

export default async function PublicMeterReadingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)

  if (!property) {
    notFound()
  }

  return (
    <PublicReadingForm
      property={{
        id: property.id,
        name: property.name,
        location: property.location,
      }}
    />
  )
}

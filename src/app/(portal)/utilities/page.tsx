import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Daily Records | Taru Villas' }

export default function UtilitiesPickerPage() {
  redirect('/daily-records')
}

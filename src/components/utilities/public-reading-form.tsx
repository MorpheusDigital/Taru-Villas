'use client'

import { useState } from 'react'
import { Droplets, Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface PublicReadingFormProps {
  property: { id: string; name: string; location: string | null }
}

export function PublicReadingForm({ property }: PublicReadingFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const [utilityType, setUtilityType] = useState<'water' | 'electricity'>('water')
  const [readingDate, setReadingDate] = useState(today)
  const [readingValue, setReadingValue] = useState('')
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const value = parseFloat(readingValue)
    if (isNaN(value) || value < 0) {
      setError('Please enter a valid meter reading')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/utilities/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          utilityType,
          readingDate,
          readingValue: value,
          note: note || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save reading')
      }

      setSuccess(true)
      setReadingValue('')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 className="size-12 text-emerald-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Reading Saved</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your {utilityType} meter reading for {property.name} has been recorded.
            </p>
            <Button onClick={() => setSuccess(false)}>
              Submit Another Reading
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto">
            <img
              src="/TVPL.png"
              alt="Taru Villas logo"
              className="mx-auto size-12"
            />
          </div>
          <CardTitle className="text-xl">{property.name}</CardTitle>
          {property.location && (
            <p className="text-sm text-muted-foreground">{property.location}</p>
          )}
          <p className="text-sm text-muted-foreground">Enter Meter Reading</p>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4">
              {error}
            </div>
          )}

          <Tabs
            value={utilityType}
            onValueChange={(v) => setUtilityType(v as 'water' | 'electricity')}
            className="mb-4"
          >
            <TabsList className="w-full">
              <TabsTrigger value="water" className="flex-1 gap-2">
                <Droplets className="size-4" />
                Water
              </TabsTrigger>
              <TabsTrigger value="electricity" className="flex-1 gap-2">
                <Zap className="size-4" />
                Electricity
              </TabsTrigger>
            </TabsList>
            {/* TabsContent is empty — we just use the tab state to set utilityType */}
            <TabsContent value="water" />
            <TabsContent value="electricity" />
          </Tabs>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pub-reading-date">Date</Label>
              <Input
                id="pub-reading-date"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pub-reading-value">
                {utilityType === 'water' ? 'Water' : 'Electricity'} Meter Reading
              </Label>
              <Input
                id="pub-reading-value"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 14523"
                value={readingValue}
                onChange={(e) => setReadingValue(e.target.value)}
                required
                className="text-lg"
              />
              <p className="text-xs text-muted-foreground">
                Enter the cumulative number shown on the meter
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pub-note">Note (optional)</Label>
              <Textarea
                id="pub-note"
                placeholder="Any observations..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Submit Reading'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

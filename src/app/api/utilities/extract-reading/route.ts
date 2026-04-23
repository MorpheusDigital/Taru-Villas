import { NextRequest, NextResponse } from 'next/server'

const PROMPT = `You are reading a photograph of a residential electricity or water meter.

Read the current meter reading: the main large numeric value shown on the meter's LCD display, 7-segment display, or mechanical dial register.

CRITICAL rules:
1. Preserve decimal points EXACTLY as shown on the display. If the display shows "1594.1", respond "1594.1" (not "15941"). Look carefully for small dots or decimal separators between digits.
2. Do NOT infer or add decimal points that are not clearly visible on the meter itself.
3. Include any leading digits even if faint.

IGNORE:
- Model numbers (e.g. "I-210+", "EM-220")
- Serial numbers
- Class ratings (e.g. "Cl. 200")
- Voltage / phase markings (e.g. "240V", "3W")
- Unit labels (kWh, m³, L)

Respond with ONLY the numeric reading. No words, no units, no explanation.
If you cannot clearly read a meter reading, respond with exactly: UNREADABLE

Examples:
- Display shows "15941" → respond: 15941
- Display shows "1594.1" → respond: 1594.1
- Display shows "00248765" → respond: 248765

Meter reading:`

export async function POST(request: NextRequest) {
  try {
    const { imageBase64, mimeType } = await request.json()

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'imageBase64 and mimeType are required' },
        { status: 400 },
      )
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_AI_TOKEN
    if (!accountId || !apiToken) {
      console.error('Cloudflare AI env vars missing')
      return NextResponse.json(
        { error: 'Vision service not configured' },
        { status: 500 },
      )
    }

    const imageBytes = Array.from(Buffer.from(imageBase64, 'base64'))

    const aiRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBytes,
          prompt: PROMPT,
          max_tokens: 32,
          temperature: 0.1,
        }),
      },
    )

    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '')
      console.error('Cloudflare AI error:', aiRes.status, errText)
      return NextResponse.json(
        { error: 'Vision service failed' },
        { status: 502 },
      )
    }

    const data = (await aiRes.json()) as {
      result?: unknown
      success?: boolean
      errors?: unknown[]
    }

    if (!data.success) {
      console.error('Cloudflare AI returned non-success:', data)
      return NextResponse.json(
        { error: 'Vision service failed' },
        { status: 502 },
      )
    }

    const result = data.result as { response?: unknown; description?: unknown }
    const rawResponse =
      typeof result?.response === 'string' || typeof result?.response === 'number'
        ? result.response
        : typeof result?.description === 'string'
          ? result.description
          : ''
    const text = String(rawResponse).trim()
    if (!text || /unreadable/i.test(text)) {
      return NextResponse.json(
        { error: 'Could not read meter — try a clearer, closer photo' },
        { status: 422 },
      )
    }

    const match = text.match(/\d+(?:\.\d+)?/)
    if (!match) {
      return NextResponse.json(
        { error: 'Could not detect meter digits' },
        { status: 422 },
      )
    }

    const value = parseFloat(match[0])
    if (isNaN(value) || value < 0) {
      return NextResponse.json({ error: 'Invalid meter reading' }, { status: 422 })
    }

    return NextResponse.json({ value })
  } catch (error) {
    console.error('POST /api/utilities/extract-reading error:', error)
    return NextResponse.json({ error: 'Failed to process image' }, { status: 500 })
  }
}

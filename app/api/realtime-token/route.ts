import { NextResponse } from 'next/server'

export async function GET() {
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      voice: 'nova',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Realtime token error:', response.status, error)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }

  const data = await response.json()
  return NextResponse.json(data)
}

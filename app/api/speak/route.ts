import { NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const { text } = await req.json()

  console.log('ElevenLabs key present:', !!process.env.ELEVENLABS_API_KEY)

  if (!text) {
    return new Response('Missing text', { status: 400 })
  }

  const response = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  console.log('ElevenLabs status:', response.status)

  if (!response.ok) {
    return new Response('ElevenLabs API error', { status: response.status })
  }

  const audioBuffer = await response.arrayBuffer()
  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}

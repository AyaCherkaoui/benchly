const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? ''
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel — natural, warm

export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text) return new Response('No text', { status: 400 })

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  if (!response.ok) {
    const err = await response.text()
    console.error('ElevenLabs error:', response.status, err)
    return new Response('TTS failed', { status: 500 })
  }

  const audio = await response.arrayBuffer()
  return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } })
}

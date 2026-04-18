export async function POST(req: Request) {
  const { text } = await req.json()
  if (!text) return new Response('No text', { status: 400 })

  console.log('OpenAI TTS called with:', text.slice(0, 60))

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice: 'nova',
      response_format: 'mp3',
      speed: 1.1,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('OpenAI TTS error:', response.status, error)
    return new Response('TTS failed', { status: 500 })
  }

  const audioBuffer = await response.arrayBuffer()
  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/mpeg' },
  })
}

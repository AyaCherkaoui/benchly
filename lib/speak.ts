/**
 * speakText — calls /api/speak (ElevenLabs) and plays the returned audio.
 * Falls back to window.speechSynthesis if the API call fails or returns an error.
 */
export async function speakText(text: string): Promise<void> {
  if (!text) return

  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error(`speak API ${res.status}`)

    const arrayBuffer = await res.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)
    source.start(0)

    // Resolve when the audio finishes playing
    return new Promise((resolve) => {
      source.onended = () => resolve()
    })
  } catch {
    // Fallback to browser TTS
    return new Promise((resolve) => {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1
      utterance.volume = 1
      utterance.onend = () => resolve()
      utterance.onerror = () => resolve()
      window.speechSynthesis.speak(utterance)
    })
  }
}

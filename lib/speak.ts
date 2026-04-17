/**
 * speakText — plays text via ElevenLabs TTS with an instant perceived response.
 *
 * Strategy:
 *   1. Immediately speak the first 5 words via browser speechSynthesis (zero latency).
 *   2. Fetch the full ElevenLabs audio in parallel.
 *   3. Cancel the browser preview and play the full audio once it arrives.
 *   4. If ElevenLabs fails, cancel the preview and speak the full text via
 *      browser TTS as a fallback so the mode never goes silent.
 */
export async function speakText(text: string): Promise<void> {
  if (!text) return

  console.log('speak() called with text:', text.slice(0, 50))

  // ── Instant preview: first 5 words via browser TTS ───────────────────────
  const words = text.trim().split(/\s+/)
  if (words.length > 5) {
    window.speechSynthesis.cancel()
    const preview = new SpeechSynthesisUtterance(words.slice(0, 5).join(' '))
    preview.rate = 1.0
    window.speechSynthesis.speak(preview)
  }

  // ── Full audio from ElevenLabs ────────────────────────────────────────────
  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!res.ok) throw new Error(`speak API ${res.status}`)

    // Stop the browser preview before playing full audio
    window.speechSynthesis.cancel()

    const arrayBuffer = await res.arrayBuffer()
    const audioCtx = new AudioContext()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const source = audioCtx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(audioCtx.destination)
    source.start(0)

    return new Promise((resolve) => {
      source.onended = () => resolve()
    })
  } catch {
    // ElevenLabs failed — speak full text via browser TTS
    window.speechSynthesis.cancel()
    return new Promise((resolve) => {
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
